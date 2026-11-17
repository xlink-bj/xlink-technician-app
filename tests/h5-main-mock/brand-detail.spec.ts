import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const directory = `.review/品牌详情-v2/${brand}/430x932`

test('brand detail preserves archive state, unknown documents and read navigation', async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method())
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await expect(page.getByTestId('task-focus-action')).toBeEnabled()
  const snapshot = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  await snapshot('01-工单详情-未读取')
  await expect(page.getByTestId('contract-archive-unverified')).toHaveCount(0)
  await expect(page.getByTestId('warranty-archive-unverified')).toHaveCount(0)
  for (const mode of ['zero', 'one', 'many', 'partial', 'failed', 'denied', 'loading']) {
    await page.evaluate(async mode => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      const harness = await import(/* @vite-ignore */ modulePath)
      await harness.installArchiveScenario(mode)
    }, mode)
    await page.getByTestId('order-archive-load').click()
    const card = page.getByTestId('order-archive-summary')
    if (mode === 'zero') await expect(card).toContainText('尚未产生正式订单')
    else if (mode === 'one') await expect(page.getByTestId('order-archive-single')).toContainText('BJ202611130001')
    else if (mode === 'many') {
      await expect(page.getByTestId('order-archive-item')).toHaveCount(2)
      await expect(page.getByTestId('follow-up-timeline-item')).toHaveCount(2)
      await expect(page.getByTestId('order-archive-all')).toContainText('全部 3 笔')
    } else if (mode === 'partial') {
      await expect(page.getByTestId('order-archive-partial')).toContainText('完整数量待确认')
      await expect(card).not.toContainText('查看全部')
    } else if (mode === 'loading') await expect(card).toContainText('正在读取')
    else await expect(page.getByTestId('order-archive-error')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await snapshot(`02-订单-${mode}-顶部`)
    await page.getByTestId('order-archive-summary').scrollIntoViewIfNeeded()
    await snapshot(`03-档案-${mode}-底部`)
  }
  await page.evaluate(async () => {
    const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
    const harness = await import(/* @vite-ignore */ modulePath)
    await harness.installArchiveScenario('many')
  })
  await page.getByTestId('order-archive-load').click()
  await page.getByTestId('follow-up-all').click()
  await expect(page.locator('.uni-page-head__title')).toHaveText('跟进记录')
  await expect(page.locator('.activity-item')).toHaveCount(3)
  await snapshot('04-全部跟进')
  await page.goBack()
  await page.getByTestId('customer-summary').click()
  await expect(page.locator('.uni-page-head__title')).toHaveText('客户资料')
  await expect(page.locator('.customer-info-panel')).toContainText('吴先生')
  await snapshot('05-客户资料')
  await page.goBack()
  await page.getByTestId('order-archive-item').first().click()
  await expect(page.locator('.uni-page-head__title')).toHaveText('订单详情')
  await expect(page.getByTestId('quotation-read-record')).toContainText('丁基防水密封胶带')
  await expect(page.getByTestId('quotation-read-record')).toContainText('154.40')
  await snapshot('06-正式订单只读')
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
