import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

test('main App repeat records use the commercial Special Form surface', async ({ page }, info) => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true',
    'Run with VITE_XLINK_R1_MP_UX_FIXTURES=true to opt in to MOCK-021 without changing the default visual fixture.')

  const external: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  await page.setViewportSize({ width: 430, height: 932 })
  page.on('pageerror', error => pageErrors.push(error.name))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.type()) })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
  await page.locator('.work-orders-entry').click()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  const repeat = page.locator('.work-order-card').filter({ hasText: '田女士' })
  await expect(repeat).toBeVisible()
  await repeat.click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await expect(page.locator('.summary-number')).toContainText('021')
  const panel = page.getByTestId('a-stage-special-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.special-forms__title')).toContainText('现场复检')
  await expect(page.getByTestId('a-special-task-state')).toContainText('正在填写')
  await expect(page.getByTestId('a-special-row-mock-form-data-021-existing-a'))
    .toContainText('第一次复检')
  await expect(page.getByTestId('a-special-row-mock-form-data-021-existing-b'))
    .toContainText('第二次复检')
  await expect(panel).not.toContainText(/(?:DEV|Mock|fixture)/)
  await panel.scrollIntoViewIfNeeded()
  const directory = process.env.XLINK_STAGE_B_SCREENSHOTS
  if (directory) {
    mkdirSync(directory, { recursive: true })
    await page.screenshot({ path: `${directory}/special-repeat-form.png` })
  }
  await info.attach('special-repeat-form-430', {
    body: await page.screenshot(), contentType: 'image/png',
  })
  expect(external).toEqual([])
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
