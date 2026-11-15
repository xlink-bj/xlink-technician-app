import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id

test('build-selected brand reaches the actual App with isolated product values', async ({ page, baseURL }) => {
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(new URL(route.request().url()).pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })
  await page.locator('.work-order-card').filter({ hasText: '#26018' }).click()
  await expect(page.getByTestId('task-focus-title')).toHaveText('报价')
  const action = page.getByTestId('task-focus-action')
  await expect(action).toBeEnabled()
  await expect(action).toHaveCSS('background-color', brand === 'yuhong' ? 'rgb(200, 32, 43)' : 'rgb(23, 105, 220)')
  const properties = await page.locator('.detail-page').evaluate(element => {
    const style = getComputedStyle(element)
    return { primary: style.getPropertyValue('--yh-action-primary').trim(), font: style.getPropertyValue('--app-font-body').trim() }
  })
  if (brand === 'xlink') expect(properties.primary).toBe('')
  else {
    expect(properties.primary).toBe('#C8202B'); expect(properties.font).toBe('16px')
    // Exercise actual alias resolution, not a separate CSS test fixture.
    await page.locator('.detail-page').evaluate(element => {
      const root = (element.closest('uni-page-body') ?? document.documentElement) as HTMLElement
      root.style.setProperty('--yh-palette-brand-600', '#782230')
    })
    await expect(action).toHaveCSS('background-color', 'rgb(120, 34, 48)')
    await expect(page.locator('.archive-link').first()).toHaveCSS('color', 'rgb(23, 93, 166)')
    await page.locator('.detail-page').evaluate(element => {
      const root = (element.closest('uni-page-body') ?? document.documentElement) as HTMLElement
      root.style.removeProperty('--yh-palette-brand-600')
    })
    await expect(action).toHaveCSS('background-color', 'rgb(200, 32, 43)')
    await expect(page.locator('.uni-page-head__title')).toHaveCSS('font-size', '20px')
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `.review/品牌基础-v2/${brand}/工单详情-430x932.png`, animations: 'disabled', caret: 'hide' })
  expect(external).toEqual([])
})
