import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
const output = `.review/main-shell/${brand}`
mkdirSync(output, { recursive: true })

test('four roots, scoped notice handoff, return, and logout', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await expect(page.locator('.main-navigation-item')).toHaveCount(4)
  await page.screenshot({ path: `${output}/01-workbench-430x932.png`, animations: 'disabled' })

  await page.getByTestId('main-tab-workOrders').click()
  await expect(page).toHaveURL(/#\/pages\/work-orders\/work-orders/)
  await expect(page.locator('.work-orders-page')).toBeVisible()
  await expect(page.locator('.work-order-card').first()).toBeVisible()
  await page.screenshot({ path: `${output}/02-work-orders-430x932.png`, animations: 'disabled' })
  await page.getByTestId('main-tab-notices').click()
  await expect(page.locator('.notices-page')).toBeVisible()
  await expect(page.locator('.main-list-row')).toHaveCount(3)
  await page.screenshot({ path: `${output}/03-notices-430x932.png`, animations: 'disabled' })

  await page.locator('.main-list-row').filter({ hasText: '有工单等待查看' }).click()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await expect(page.locator('.main-navigation')).toHaveCount(0)
  await page.locator('.main-primary-action').click()
  await expect(page.locator('.work-order-detail-page, .detail-page')).toBeVisible()
  await expect(page.locator('.main-navigation')).toHaveCount(0)
  await page.goBack()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.notices-page')).toBeVisible()
  await expect(page.locator('.notice-indicator--read')).toHaveCount(1)

  await page.locator('.main-list-row').filter({ hasText: '工单可见性已变化' }).click()
  await page.locator('.main-primary-action').dblclick()
  await expect(page.getByText('当前账号无法查看关联工单。')).toBeVisible()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await page.goBack()
  await page.getByTestId('main-tab-me').click()
  await expect(page.locator('.me-page')).toBeVisible()
  await page.screenshot({ path: `${output}/04-me-430x932.png`, animations: 'disabled' })
  await page.locator('.main-logout').click()
  await expect(page.locator('.uni-modal')).toBeVisible()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.login-page')).toBeVisible()
  await expect(page.locator('.main-navigation')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('unknown notice and unavailable service state stay explicit', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/notices/detail?id=unknown')
  await expect(page.getByText('无法查看这条通知')).toBeVisible()
  await expect(page.locator('.main-primary-action')).toHaveCount(0)
  await page.evaluate(async () => {
    const modulePath = '/src/app/business-mock.ts'
    const { setBusinessMockMode } = await import(modulePath)
    setBusinessMockMode('off')
  })
  await page.goto('/#/pages/notices/notices')
  await expect(page.getByText('通知暂未接入')).toBeVisible()
  await expect(page.locator('.main-list-row')).toHaveCount(0)
})
