import { expect, test } from '@playwright/test'

test('DEV Mock renders actual child panel for unknown, cancelled, empty and failed synthetic reads', async ({ page }, info) => {
  const forbidden: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(msg.text()) })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    forbidden.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    await route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home-page')).toBeVisible()
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-006', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('child-subflow-mock-preview-entry')).toBeVisible()
  await expect(page.getByTestId('production-child-form-view')).toHaveCount(0)
  await page.getByTestId('child-subflow-mock-preview-entry').click()
  await expect(page).toHaveURL(/child-subflow-mock-review/)
  await expect(page.getByText('子流程节点 · 只读预览')).toBeVisible()
  await expect(page.getByTestId('production-child-form-view')).toBeVisible()

  await page.getByText('查看节点', { exact: true }).click()
  await expect(page.getByTestId('child-form-node')).toHaveCount(3)
  await expect(page.getByTestId('child-form-untyped-guard')).toHaveCount(3)
  await expect(page.getByTestId('child-form-generic-reference')).toHaveCount(2)
  await expect(page.getByText('该节点已取消，仅供核对历史流程。')).toHaveCount(1)
  await expect(page.getByTestId('child-repeat-record')).toHaveCount(0)
  await info.attach('synthetic-child-subflow-390w', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  })

  await page.getByText('已取消', { exact: true }).click()
  await page.getByText('查看节点', { exact: true }).click()
  await expect(page.getByTestId('child-form-node')).toHaveCount(1)
  await page.getByText('空节点', { exact: true }).click()
  await page.getByText('查看节点', { exact: true }).click()
  await expect(page.getByTestId('child-form-empty')).toBeVisible()
  await page.getByText('读取失败', { exact: true }).click()
  await page.getByText('查看节点', { exact: true }).click()
  await expect(page.getByTestId('child-form-error')).toBeVisible()

  await page.goto('/#/pages/work-orders/child-subflow-mock-review?id=other', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('开发预览不可用')).toBeVisible()
  await expect(page.getByTestId('production-child-form-view')).toHaveCount(0)
  expect(forbidden).toEqual([])
  expect(pageErrors).toEqual([])
})

test('inaccessible pending-acceptance card has no empty navigator URL or detail navigation', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await page.goto('/#/pages/work-orders/work-orders', { waitUntil: 'domcontentloaded' })
  const pending = page.locator('.work-order-card').filter({ hasText: '演示客户丙' })
  await expect(pending).toBeVisible()
  await pending.locator('.card-customer').click()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  expect(consoleErrors).toEqual([])
})
