import { expect, test } from '@playwright/test'

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
