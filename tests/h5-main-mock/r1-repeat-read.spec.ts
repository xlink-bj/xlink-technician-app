import { expect, test } from '@playwright/test'

test('main App synthetic repeat list is read only and makes no external request', async ({ page }, info) => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true',
    'Run with VITE_XLINK_R1_MP_UX_FIXTURES=true to opt in to MOCK-021 without changing the default visual fixture.')

  const external: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.name))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.type()) })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
  await page.locator('.work-orders-entry').click()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  const repeat = page.locator('.work-order-card').filter({ hasText: '重复表单本机草稿走查' })
  await expect(repeat).toBeVisible()
  await repeat.click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await expect(page.locator('.summary-number')).toContainText('021')
  await expect(page.getByTestId('r1-form-list-unknown')).toBeVisible()
  await page.locator('.app-button').filter({ hasText: '主动读取 DEV 合成记录' }).click()
  await expect(page.getByTestId('r1-form-list-entry')).toHaveCount(2)
  await expect(page.getByTestId('r1-form-list-count')).toContainText('2 条')
  await info.attach('synthetic-repeat-390', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  })
  expect(external).toEqual([])
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
