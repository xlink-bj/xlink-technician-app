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
      await expect(page.getByTestId('follow-up-timeline')).toHaveCount(0)
      await expect(card).toContainText('尚未产生正式订单')
      await expect(card.locator('uni-navigator')).toHaveCount(0)
    } else if (mode === 'one') {
      await expect(page.getByTestId('order-archive-single')).toContainText('BJ202611130001')
    } else if (mode === 'many') {
      await expect(page.getByTestId('order-archive-item')).toHaveCount(2)
      await expect(page.getByTestId('order-archive-all')).toContainText('全部 3 笔')
      await expect(page.getByTestId('order-archive-item').first()).toContainText('BJ202611150003')
    } else if (mode === 'partial') {
      await expect(page.getByTestId('order-archive-partial')).toContainText('完整数量待确认')
      await expect(page.getByTestId('order-archive-all')).not.toContainText('全部')
    } else if (mode === 'loading') await expect(card).toContainText('正在读取')
    else {
      await expect(page.getByTestId('order-archive-error')).toContainText(mode === 'denied' ? '没有读取' : '暂时无法读取')
      await expect(page.getByTestId('order-archive-empty')).toHaveCount(0)
      if (mode === 'failed') {
        await expect(page.getByTestId('follow-up-summary')).toContainText('读取失败')
        await expect(page.getByTestId('follow-up-timeline')).toHaveCount(0)
      }
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
  await expect(page.locator('.quotation-read-list')).not.toContainText(/不可识别|未识别|待核验|SYNTHETIC|合成/)
  expect((await page.getByTestId('production-signing-order-read-entry').first().boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('task-focus-panel')).toHaveCount(0)
  await expect.poll(async () => (await page.getByTestId('quotation-read-record').first().boundingBox())?.y).toBeLessThan(160)
  await page.screenshot({ path: '.review/detail-archives/order-list-430x932.png', fullPage: true })
  await page.goBack()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  await expect.poll(async () => (await page.getByTestId('order-archive-all').boundingBox())?.y).toBeCloseTo(top, 0)
  await page.getByTestId('order-archive-item').first().click()
  await expect(page.getByTestId('quotation-read-record')).toHaveCount(1)
  const record = page.getByTestId('quotation-read-record')
  await expect(record).toContainText('BJ202611150003')
  await expect(record).toContainText('丁基防水密封胶带')
  await expect(record).toContainText('数量：4 卷 · 单价：¥38.60 · 小计：¥154.40')
  await expect(record).not.toContainText(/不可识别|待核验|SYNTHETIC|合成/)
  // No destination scroll repair: the real navigation must place its first
  // record below the fixed header, before a screenshot can claim readiness.
  await expect.poll(async () => (await record.boundingBox())?.y).toBeLessThan(160)
  expect((await record.boundingBox())!.y).toBeGreaterThanOrEqual(44)
  await expect(record).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: '.review/detail-archives/order-detail-430x932.png', fullPage: true })
  await page.goBack()
  await page.getByTestId('follow-up-all').click()
  await expect(page.locator('.activity-item')).toHaveCount(3)
  await page.screenshot({ path: '.review/detail-archives/follow-up-detail-430x932.png', fullPage: true })
  await page.goBack()
  await page.getByTestId('customer-summary').click()
  await expect(page.locator('.customer-info-panel')).toBeVisible()
  await expect(page.locator('.row-label').filter({ hasText: /^工单编号$/ })).toHaveCount(1)
  await page.screenshot({ path: '.review/detail-archives/customer-detail-430x932.png', fullPage: true })
  await page.goBack()
  await expect(page.getByTestId('order-archive-all')).toContainText('全部 3 笔')
  await expect(page.getByTestId('work-order-archives')).not.toContainText(/DEV|Mock|fixture|SYNTHETIC|合成/)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 932 })
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `.review/detail-archives/overview-${width}x932.png`, fullPage: true })
  }
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

for (const width of [375, 390, 430]) test(`follow-up summary timeline follows the actual records and long content at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 932 })
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174'
    ? route.continue() : (external.push(route.request().method()), route.abort('blockedbyclient')))
  await page.goto('/#/pages/index/index')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  let normalSpacing = 0
  for (const example of ['normal', 'single', 'long'] as const) {
    await page.evaluate(async example => {
      const modulePath = '/tests/h5-main-mock/fixtures/detail-archive-harness.ts'
      await (await import(/* @vite-ignore */ modulePath)).installArchiveScenario('many', example)
    }, example)
    const count = example === 'single' ? 1 : 2
    const items = page.getByTestId('follow-up-timeline-item')
    await expect(items).toHaveCount(count)
    await expect(page.getByTestId('follow-up-timeline-dot')).toHaveCount(count)
    await expect(page.getByTestId('follow-up-timeline-line')).toHaveCount(count - 1)
    await expect(page.getByTestId('follow-up-all')).toContainText(example === 'single' ? '1 条' : '3 条')
    await expect(items.first()).toContainText(example === 'long' ? '到场安排与屋面检修范围沟通确认' : '到场安排确认')
    const borders = await items.evaluateAll(els => els.map(el => getComputedStyle(el).borderTopWidth))
    expect(borders).toEqual(Array(count).fill('0px'))
    if (count === 2) {
      const dots = await page.getByTestId('follow-up-timeline-dot').all()
      const first = (await dots[0]!.boundingBox())!, last = (await dots[1]!.boundingBox())!
      const line = (await page.getByTestId('follow-up-timeline-line').boundingBox())!
      expect(Math.abs(line.y - first.y - first.height / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(line.y + line.height - last.y - last.height / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(line.x + line.width / 2 - first.x - first.width / 2)).toBeLessThanOrEqual(1)
      if (example === 'normal') normalSpacing = last.y - first.y
      if (example === 'long') expect(last.y - first.y).toBeGreaterThan(normalSpacing + 30)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(external).toEqual([]); expect(errors).toEqual([])
})
