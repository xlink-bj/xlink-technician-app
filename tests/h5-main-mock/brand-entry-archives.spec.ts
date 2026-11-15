import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const base = `.review/雨虹入口档案补拍/${brand}/430x932`

test('actual archive navigation, recent two, full timeline, long content and empty customer fields', async ({ page, baseURL }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method()); return route.abort('blockedbyclient')
  })
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    expect(await page.locator('body').innerText()).not.toMatch(/DEV|Mock|fixture|SYNTHETIC/)
    await page.screenshot({ path: `${base}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  for (const example of ['normal', 'single', 'long']) {
    await page.evaluate(async example => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      await (await import(/* @vite-ignore */ modulePath)).installArchiveScenario('many', example)
    }, example)
    await expect(page.getByTestId('follow-up-timeline-item')).toHaveCount(example === 'single' ? 1 : 2)
    await page.getByTestId('follow-up-summary').scrollIntoViewIfNeeded()
    await capture(`跟进摘要-${example}-最近两条上限`)
    await page.getByTestId('follow-up-all').click()
    await expect(page.locator('.uni-page-head__title')).toHaveText('跟进记录')
    await expect(page.locator('.activity-item')).toHaveCount(example === 'single' ? 1 : 3)
    await capture(`跟进时间轴-${example}-全部记录`)
    await page.goBack()
    await expect(page.locator('.uni-page-head__title')).toHaveText('工单详情')
  }
  for (const mode of ['zero', 'failed']) {
    await page.evaluate(async mode => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      await (await import(/* @vite-ignore */ modulePath)).installArchiveScenario(mode)
    }, mode)
    await expect(page.getByTestId('follow-up-timeline-item')).toHaveCount(0)
    await expect(page.getByTestId('follow-up-summary')).toContainText(mode === 'failed' ? '读取失败' : '暂无跟进记录')
    await page.getByTestId('follow-up-summary').scrollIntoViewIfNeeded()
    await capture('跟进摘要-' + (mode === 'failed' ? '读取失败' : '明确空记录'))
  }
  await page.evaluate(async () => {
    const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
    await (await import(/* @vite-ignore */ modulePath)).installCustomerInformationEmptyScenario()
  })
  await page.getByTestId('customer-summary').click()
  await expect(page.locator('.uni-page-head__title')).toHaveText('客户资料')
  await expect(page.locator('.customer-info-panel')).toContainText('暂无可展示资料')
  await expect(page.getByTestId('configured-information-row')).toHaveCount(0)
  await capture('客户资料-明确空字段配置')
  expect(external).toEqual([]); expect(errors).toEqual([])
})
