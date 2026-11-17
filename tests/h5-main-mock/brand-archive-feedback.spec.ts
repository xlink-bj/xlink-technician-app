import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const directory = `.review/雨虹档案失败语义/${brand}/430x932`
test('only explicit archive read failures receive the selected brand error treatment', async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method()); return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  const neutral = brand === 'yuhong' ? 'rgb(85, 94, 100)' : 'rgb(123, 138, 161)'
  const failed = brand === 'yuhong' ? 'rgb(180, 35, 24)' : neutral
  await expect(page.getByTestId('order-archive-summary').locator('.archive-hint')).toHaveCSS('color', neutral)
  await page.screenshot({ path: `${directory}/详情-初始未读取.png`, animations: 'disabled', caret: 'hide' })
  for (const mode of ['failed', 'denied', 'zero', 'loading']) {
    await page.evaluate(async mode => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      await (await import(/* @vite-ignore */ modulePath)).installArchiveScenario(mode)
    }, mode)
    await page.getByTestId('order-archive-load').click()
    const message = mode === 'failed' || mode === 'denied' ? page.getByTestId('order-archive-read-message') : page.getByTestId('order-archive-summary').locator('.archive-hint')
    await expect(message).toHaveCSS('color', mode === 'failed' ? failed : neutral)
    if (mode === 'failed') await expect(page.getByTestId('follow-up-read-message')).toHaveCSS('color', failed)
    if (mode === 'failed') {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${directory}/订单-failed-顶部.png`, animations: 'disabled', caret: 'hide' })
    }
    await page.getByTestId('order-archive-summary').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${directory}/订单-${mode}.png`, animations: 'disabled', caret: 'hide' })
  }
  for (const state of ['failed', 'denied', 'unavailable', 'succeeded', 'unknown']) {
    await page.evaluate(async state => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      await (await import(/* @vite-ignore */ modulePath)).installFollowUpReadState(state === 'unknown' ? undefined : state)
    }, state)
    await expect(page.getByTestId('follow-up-read-message')).toHaveCSS('color', state === 'failed' ? failed : neutral)
    await page.getByTestId('follow-up-summary').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${directory}/跟进-${state}.png`, animations: 'disabled', caret: 'hide' })
  }
  expect(external).toEqual([]); expect(errors).toEqual([])
})
