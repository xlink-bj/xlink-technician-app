import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const phase = process.env.BRAND_REVIEW_PHASE === 'before' ? 'before' : 'after'
const directory = `.review/品牌列表-v2/${brand}-${phase}/430x932`

test('brand list keeps actual search, category, read states, pagination and detail navigation', async ({ page, baseURL }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method()); return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.list-loaded-count')).toBeVisible()
  const capture = async (name: string) => {
    if (phase === 'after') await expect(page.locator('.app-loading-state--inline')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  await capture('01-全部工单')
  await page.getByTestId('work-order-category-to_accept').click()
  await expect(page.locator('.card-customer')).toHaveText(['李先生'])
  await capture('02-待接单')
  await page.evaluate(async () => {
    const modulePath = '/tests/h5-main-mock/fixtures/brand-list-harness.ts'
    const harness = await import(/* @vite-ignore */ modulePath)
    harness.installAcceptConfirmation()
  })
  await page.locator('.card-accept-button').click()
  await expect(page.locator('.accept-confirm-card')).toBeVisible()
  await capture('03-接单确认')
  await page.locator('.accept-confirm-button--secondary').click()
  await expect(page.locator('.accept-confirm-card')).toHaveCount(0)
  await page.getByTestId('work-order-category-all').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await expect(page.locator('.summary-number')).toHaveText('#26018')
  await page.goBack()
  await expect(page.getByTestId('app-search-bar').locator('input')).toHaveValue('26018')
  await capture('04-搜索返回保留')
  const search = page.getByTestId('app-search-bar').locator('input')
  await search.fill('查无此工单'); await page.locator('.search-button').click()
  await expect(page.getByText('没有找到匹配工单', { exact: true })).toBeVisible()
  await capture('05-搜索无结果')
  await page.locator('.app-feedback-state__action').click()
  await expect(page.locator('.list-loaded-count')).toBeVisible()
  const scenario = async (mode: string) => page.evaluate(async mode => {
    const modulePath = '/tests/h5-main-mock/fixtures/brand-list-harness.ts'
    const harness = await import(/* @vite-ignore */ modulePath)
    await harness.installListScenario(mode)
  }, mode)
  await scenario('long')
  await expect(page.locator('.card-customer')).toHaveText('王女士（现场维修联系人）')
  await capture('06-长地址与称谓')
  await scenario('empty')
  await expect(page.getByTestId('work-order-empty-state')).toBeVisible()
  await capture('07-真实空结果')
  await scenario('failed')
  await expect(page.getByText('暂时无法加载工单', { exact: true })).toBeVisible()
  await capture('08-读取失败')
  await scenario('loading')
  await expect(page.getByTestId('work-order-skeleton-list')).toBeVisible()
  await expect(page.locator('.search-button')).toBeDisabled()
  await capture('09-加载与禁用搜索')
  await page.evaluate(async () => {
    const modulePath = '/tests/h5-main-mock/fixtures/brand-list-harness.ts'
    const harness = await import(/* @vite-ignore */ modulePath)
    harness.releaseListLoading()
  })
  await expect(page.locator('.list-loaded-count')).toBeVisible()
  await scenario('pages')
  await expect(page.locator('.work-order-card')).toHaveCount(2)
  await page.locator('.load-more').click()
  await expect(page.locator('.work-order-card')).toHaveCount(3)
  await expect(page.locator('.load-more')).toHaveCount(0)
  await capture('10-分页回读')
  expect(errors).toEqual([]); expect(external).toEqual([])
})
