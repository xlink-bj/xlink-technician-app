import { test, expect } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

test('Yuhong actual uni-button disabled state keeps the product background', async ({ page, baseURL }) => {
  test.skip(process.env.VITE_XLINK_BRAND !== 'yuhong', 'Yuhong-only product-state regression')
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method()); return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26019', customer: '蒋女士' })).click()
  await page.getByTestId('task-focus-action').click()
  const action = page.getByTestId('action-workspace-submit')
  await expect(action).toHaveAttribute('disabled', 'true')
  await expect(action).toHaveCSS('background-color', 'rgb(229, 231, 232)')
  await expect(action).toHaveCSS('color', 'rgb(85, 94, 100)')
  await expect(action).toHaveClass(/app-button--disabled/)
  expect(external).toEqual([])
})
