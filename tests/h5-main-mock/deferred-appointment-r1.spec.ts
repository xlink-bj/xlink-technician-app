import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { rootPath } from '../../config/paths'

test('430×932 deferred appointment keeps and restores an existing datetime in the real App draft', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')

  const choice = page.locator('.action-content-field--choice')
  await choice.getByText('需要上门', { exact: true }).click()
  await page.locator('.appointment-time-selector').click()
  await page.locator('.date-shortcut').first().click()
  await page.locator('.time-slot').first().click()
  await page.locator('.time-selection-submit').click()
  await expect(page.locator('.confirmation-card-title').first()).toContainText('预约信息')
  await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
  await expect(page.locator('.appointment-time-selected')).toBeVisible()

  const storedAppointmentValues = () => page.evaluate(() => {
    const entry = Object.keys(localStorage).flatMap(key => {
      try {
        return [JSON.parse(localStorage.getItem(key) ?? 'null') as {
          identity?: { workOrderId?: string; workflowNodeId?: string }
          values?: Record<string, unknown>
        } | null]
      } catch { return [] }
    }).find(item => item?.identity?.workOrderId === 'mock-work-order-019-continuous-journey'
      && item.identity.workflowNodeId === 'mock-workflow-node-019-appointment')
    return entry?.values ?? null
  })

  await expect.poll(async () => (await storedAppointmentValues())?.datetime).toBeTruthy()
  const selectedDatetime = (await storedAppointmentValues())?.datetime
  expect(typeof selectedDatetime).toBe('string')

  await choice.getByText('暂不上门', { exact: true }).click()
  await expect(page.locator('.appointment-time-selector')).toHaveCount(0)
  await expect.poll(storedAppointmentValues).toMatchObject({ need: '0', datetime: selectedDatetime })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
  await expect(page.locator('.appointment-time-selector')).toHaveCount(0)
  await choice.getByText('需要上门', { exact: true }).click()
  await expect(page.locator('.appointment-time-selected')).toBeVisible()
  await expect.poll(storedAppointmentValues).toMatchObject({ need: '1', datetime: selectedDatetime })

  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('430×932 appointment time confirmation Back and return-to-edit share one edit predecessor', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.getByTestId('mock-continuous-journey-entry').click()
  await page.locator('.action-content-field--choice').getByText('需要上门', { exact: true }).click()
  const note = page.locator('.action-content-field--note textarea')
  await note.fill('合成预约：返回仍保留')
  // The default source-backed DEV preview keeps its submit gate closed. Use its real time-picker review path.
  const openReview = async () => {
    await page.locator('.appointment-time-selector').click()
    await page.locator('.time-slot').first().click()
    await page.locator('.time-selection-submit').click()
    await expect(page).toHaveURL(/action-confirmation/)
  }
  const back = () => page.locator('.uni-page-head-hd').click()
  await openReview()
  await expect(page).toHaveURL(/action-confirmation/)
  const confirmationUrl = page.url()
  await mkdir(rootPath('.review/navigation-return'), { recursive: true })
  await page.screenshot({ path: rootPath('.review/navigation-return/appointment-confirmation-430.png'), animations: 'disabled' })
  await back()
  await expect(page).toHaveURL(/action-workspace/)
  await expect(note).toHaveValue('合成预约：返回仍保留')
  for (let i = 0; i < 2; i++) {
    await openReview()
    await expect(page).toHaveURL(/action-confirmation/)
    await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
    await expect(page).toHaveURL(/action-workspace/)
    await expect(note).toHaveValue('合成预约：返回仍保留')
  }
  await back()
  await expect(page).toHaveURL(/pages\/dev\/qa-console/)
  // A cold direct confirmation has no edit predecessor; explicit return uses its bounded fallback.
  await page.goto(confirmationUrl)
  await expect(page.locator('.confirmation-card-title').first()).toContainText('预约信息')
  await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
  await expect(page).toHaveURL(/action-workspace/)
  await expect(note).toHaveValue('合成预约：返回仍保留')
  await expect(page.getByTestId('action-workspace-submit')).toContainText('继续确认')
  await expect(page.locator('.appointment-time-selected')).toBeVisible()
  await page.screenshot({ path: rootPath('.review/navigation-return/appointment-returned-430.png'), animations: 'disabled', style: '[data-testid="mock-journey-progress"] { display:none!important; }' })
  expect(external).toEqual([])
})

test('430×932 signing read return handles normal entry and direct empty stacks without writing', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.getByTestId('mock-continuous-journey-entry').click()
  const appointmentUrl = page.url()
  // Use the existing actual navigation API, without a signing grant or command.
  await page.evaluate(() => {
    const api = (window as unknown as { uni: { navigateTo(options: { url: string }): void } }).uni
    api.navigateTo({ url: '/pages/work-orders/signing-order-read?workOrderId=mock-work-order-019-continuous-journey' })
  })
  await page.getByTestId('signing-order-read-return').click()
  await expect(page).toHaveURL(appointmentUrl)
  await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=mock-work-order-019-continuous-journey')
  await page.getByTestId('signing-order-read-return').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail\?id=mock-work-order-019-continuous-journey/)
  await page.goto('/#/pages/work-orders/signing-order-read')
  await page.getByTestId('signing-order-read-return').click()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  expect(external).toEqual([])
})
