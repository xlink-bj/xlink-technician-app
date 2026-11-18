import { test, expect, type Locator } from '@playwright/test'
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
  const quickActions = page.locator('.summary-action')
  const yuhong = brand === 'yuhong'
  await expect(quickActions).toHaveCount(4)
  await expect(quickActions.filter({ hasText: '联系' })).toHaveAttribute('disabled', 'true')
  await expect(quickActions.first()).toHaveCSS('flex-direction', yuhong ? 'column' : 'row')
  await expect(quickActions.first().locator('.uni-icons')).toHaveCSS('font-size', yuhong ? '20px' : '15px')
  if (yuhong) {
    for (const action of await quickActions.all()) {
      const bounds = (await action.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
  }
  const snapshot = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  const expectHeadingDivider = async (card: Locator) => {
    const divider = await card.locator('.archive-summary-heading').evaluate(heading => {
      const line = getComputedStyle(heading, '::after')
      return [line.borderBottomWidth, line.borderBottomColor]
    })
    if (yuhong) expect(divider).toEqual(['1px', 'rgb(229, 231, 232)'])
    else expect(divider[0]).toBe('0px')
  }
  await expectHeadingDivider(page.getByTestId('follow-up-summary'))
  await expectHeadingDivider(page.getByTestId('customer-summary'))
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
    await expectHeadingDivider(card)
    if (mode === 'zero') await expect(card).toContainText('尚未产生正式订单')
    else if (mode === 'one') await expect(page.getByTestId('order-archive-single')).toContainText('BJ202611130001')
    else if (mode === 'many') {
      await expect(page.getByTestId('order-archive-item')).toHaveCount(2)
      const orders = page.getByTestId('order-archive-item')
      await expect(orders.first()).toHaveCSS('border-top-width', yuhong ? '0px' : '1px')
      await expect(orders.last()).toHaveCSS('border-top-width', '1px')
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
    await harness.installArchiveScenario('many', 'long')
  })
  await expect(page.getByTestId('follow-up-timeline-item').first()).toContainText('逐项确认维修边界')
  await page.evaluate(() => window.scrollTo(0, 0))
  await snapshot('04-工单详情-长跟进')
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
