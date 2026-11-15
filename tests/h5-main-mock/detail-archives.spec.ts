import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

test('actual detail archive cards preserve bounded read outcomes and return context', async ({ page }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 430, height: 932 })
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174'
    ? route.continue() : (external.push(route.request().method()), route.abort('blockedbyclient')))
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  await mkdir('.review/detail-archives', { recursive: true })
  const scenario = async (mode: string) => {
    await page.evaluate(async mode => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      const harness = await import(/* @vite-ignore */ modulePath)
      await harness.installArchiveScenario(mode)
    }, mode)
    await page.getByTestId('order-archive-load').click()
  }
  for (const mode of ['zero', 'one', 'many', 'partial', 'failed', 'denied', 'loading']) {
    await scenario(mode)
    const card = page.getByTestId('order-archive-summary')
    if (mode === 'zero') {
      await expect(card).toContainText('尚未产生正式订单')
      await expect(card.locator('uni-navigator')).toHaveCount(0)
    } else if (mode === 'one') {
      await expect(page.getByTestId('order-archive-single')).toContainText('SYNTHETIC-1')
    } else if (mode === 'many') {
      await expect(page.getByTestId('order-archive-item')).toHaveCount(2)
      await expect(page.getByTestId('order-archive-all')).toContainText('全部 3 笔')
      await expect(page.getByTestId('order-archive-item').first()).toContainText('SYNTHETIC-3')
    } else if (mode === 'partial') {
      await expect(page.getByTestId('order-archive-partial')).toContainText('完整数量待确认')
      await expect(page.getByTestId('order-archive-all')).not.toContainText('全部')
    } else if (mode === 'loading') await expect(card).toContainText('正在读取')
    else {
      await expect(page.getByTestId('order-archive-error')).toContainText(mode === 'denied' ? '没有读取' : '暂时无法读取')
      await expect(page.getByTestId('order-archive-empty')).toHaveCount(0)
      if (mode === 'failed') await expect(page.getByTestId('follow-up-summary')).toContainText('读取失败')
    }
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `.review/detail-archives/${mode}-430x932.png`, fullPage: true })
  }
  await scenario('many')
  await expect(page.getByTestId('order-archive-item')).toHaveCount(2)
  const all = page.getByTestId('order-archive-all')
  await all.scrollIntoViewIfNeeded()
  const top = (await all.boundingBox())!.y
  await all.click()
  await expect(page.getByTestId('quotation-read-record')).toHaveCount(3)
  await expect(page.getByTestId('task-focus-panel')).toHaveCount(0)
  await page.screenshot({ path: '.review/detail-archives/order-list-430x932.png', fullPage: true })
  await page.goBack()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  await expect.poll(async () => (await page.getByTestId('order-archive-all').boundingBox())?.y).toBeCloseTo(top, 0)
  await page.getByTestId('order-archive-item').first().click()
  await expect(page.getByTestId('quotation-read-record')).toHaveCount(1)
  await expect(page.getByTestId('quotation-read-record')).toContainText('SYNTHETIC-3')
  await page.screenshot({ path: '.review/detail-archives/order-detail-430x932.png', fullPage: true })
  await page.goBack()
  await page.getByTestId('follow-up-all').click()
  await expect(page.locator('.activity-item')).toHaveCount(3)
  await page.screenshot({ path: '.review/detail-archives/follow-up-detail-430x932.png', fullPage: true })
  await page.goBack()
  await page.getByTestId('customer-summary').click()
  await expect(page.locator('.customer-info-panel')).toBeVisible()
  await page.screenshot({ path: '.review/detail-archives/customer-detail-430x932.png', fullPage: true })
  await page.goBack()
  await expect(page.getByTestId('order-archive-all')).toContainText('全部 3 笔')
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 932 })
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `.review/detail-archives/overview-${width}x932.png`, fullPage: true })
  }
  expect(errors).toEqual([])
  expect(external).toEqual([])
})
