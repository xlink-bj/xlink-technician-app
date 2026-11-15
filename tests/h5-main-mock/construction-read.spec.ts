import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand = process.env.VITE_XLINK_BRAND || 'xlink'
const dir = `.review/construction-read/${brand}/430x932`
test('actual listed detail to scoped readonly construction logs, empty, retry and all procedures', async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', r => { if (new URL(r.request().url()).origin === new URL(baseURL!).origin) return r.continue(); external.push(r.request().url()); return r.abort('blockedbyclient') })
  mkdirSync(dir, { recursive: true }); const shot = async (name: string) => page.screenshot({ path: `${dir}/${name}.png` })
  await page.goto('/#/pages/index/index'); await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click(); await (await searchMockWorkOrder(page, { orderNum: '04009', customer: '陈女士' })).click()
  const entry = page.getByTestId('construction-read-entry'); await expect(entry).toBeVisible()
  await page.evaluate(async () => { const f = await import(/* @vite-ignore */ '/tests/h5-main-mock/fixtures/' + 'construction-read-fixture.ts'); f.installConstructionReadVariants(); f.selectConstructionReadMode('loading') })
  await entry.click(); await expect(page).toHaveURL(/pages\/work-orders\/construction-read/); await expect(page.getByTestId('construction-reader')).toContainText('正在读取'); await shot('01-reading')
  await page.evaluate(async () => { const f = await import(/* @vite-ignore */ '/tests/h5-main-mock/fixtures/' + 'construction-read-fixture.ts'); f.releaseConstructionRead() })
  await expect(page.getByTestId('construction-log')).toHaveCount(2); await shot('02-log-list')
  await page.getByTestId('construction-open-log').first().click(); await expect(page.locator('.construction-procedure')).toHaveCount(3); await expect(page.locator('.construction-procedure').last()).toContainText('复核接缝连续性'); await shot('03-multiple-procedures')
  await expect(page.locator('button').filter({ hasText: /新建|提交|删除|选择工序|选择订单/ })).toHaveCount(0)
  const titleColor = await page.locator('.construction-title').evaluate(e => getComputedStyle(e).color)
  expect(titleColor).toBe(brand === 'yuhong' ? 'rgb(25, 27, 30)' : 'rgb(29, 43, 64)')
  for (const mode of ['empty', 'failed', 'normal', 'wrong-scope', 'normal']) {
    await page.evaluate(async (m) => { const f = await import(/* @vite-ignore */ '/tests/h5-main-mock/fixtures/' + 'construction-read-fixture.ts'); f.selectConstructionReadMode(m); uni.navigateBack() }, mode)
    await expect(page.getByTestId('construction-read-entry')).toBeVisible(); await page.getByTestId('construction-read-entry').click()
    if (mode === 'empty') { await expect(page.getByTestId('construction-empty')).toBeVisible(); await shot('04-empty') }
    else if (mode === 'failed' || mode === 'wrong-scope') {
      await expect(page.getByTestId('construction-error')).toBeVisible(); await expect(page.getByTestId('construction-log')).toHaveCount(0)
      if (mode === 'failed') {
        const color = await page.getByTestId('construction-error').evaluate(e => getComputedStyle(e).color); expect(color).toBe(brand === 'yuhong' ? 'rgb(180, 35, 24)' : 'rgb(240, 100, 69)'); await shot('05-read-failed')
        await page.evaluate(async () => { const f = await import(/* @vite-ignore */ '/tests/h5-main-mock/fixtures/' + 'construction-read-fixture.ts'); f.selectConstructionReadMode('normal') })
        await page.getByTestId('construction-retry').click(); await expect(page.getByTestId('construction-log')).toHaveCount(2); await shot('06-retry-recovered')
      }
    } else await expect(page.getByTestId('construction-log')).toHaveCount(2)
  }
  for (const [width, height] of [[375, 667], [390, 844]]) { await page.setViewportSize({ width, height }); await expect(page.getByTestId('construction-log')).toHaveCount(2); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.getByTestId('construction-open-log').last().click(); await expect(page.locator('.construction-procedure')).toHaveCount(2); await page.getByTestId('construction-back-list').click() }
  await page.setViewportSize({ width: 430, height: 932 })
  // Session/role change must clear the visible record and block further reads.
  await page.evaluate(async () => { const { useSessionStore } = await import(/* @vite-ignore */ '/src/shared/state/' + 'index.ts'); useSessionStore().session = null })
  await expect(page.getByTestId('construction-log')).toHaveCount(0); await expect(page.getByTestId('construction-reader')).toHaveCount(0)
  expect(external).toEqual([]); expect(errors).toEqual([])
  const ledger = await page.evaluate(async () => { const f = await import(/* @vite-ignore */ '/tests/h5-main-mock/fixtures/' + 'construction-read-fixture.ts'); return f.ledger })
  writeFileSync(`.review/construction-read/${brand}/ledger.json`, JSON.stringify({ ledger, external, errors }, null, 2))
})
