import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { selectBrand } from '../../config/vite/brand-profile'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const dir = `.review/device-action/${brand}/430x932`

test('scoped device mock operates and restores in the actual App', async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) return route.continue()
    external.push(route.request().url())
    return route.abort('blockedbyclient')
  })
  mkdirSync(dir, { recursive: true })
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', caret: 'hide' })

  await page.goto('/#/pages/index/index?devReview=1')
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.getByTestId('device-action-mock-entry').click()
  await expect(page.getByTestId('device-mock-page')).toBeVisible()
  await expect(page.getByTestId('action-workspace-shell')).toBeVisible()
  await shot('01-select')
  await page.getByTestId('device-connect').click()
  await expect(page.getByTestId('device-start')).toBeVisible()
  await page.getByTestId('device-start').click()
  await expect(page.getByTestId('device-progress')).toBeVisible()
  await shot('02-pressure-running')
  await page.getByTestId('device-disconnect').click()
  await expect(page.getByTestId('device-message')).toContainText('不会自动重发')
  await page.getByTestId('device-connect').click()
  await expect(page.getByTestId('device-start')).toBeVisible()
  await expect(page.getByTestId('device-result')).toHaveCount(0)
  await page.getByTestId('device-start').click()
  await expect(page.getByTestId('device-result')).toContainText('合格判定待真实规则核实')
  await expect(page.getByTestId('device-result')).toContainText(/业务确认\s*未确认/)
  await page.getByTestId('device-save').click()
  await expect(page.getByTestId('device-result')).toContainText(/本机保存\s*已核对/)
  await shot('03-pressure-result')

  await page.goto('/#/pages/index/index?devReview=1')
  await page.getByTestId('device-action-mock-entry').click()
  await expect(page.getByTestId('device-result')).toContainText(/本机保存\s*已核对/)
  await expect(page.getByTestId('device-connect')).toHaveCount(0)
  await page.getByTestId('device-new').click()
  await page.getByTestId('device-panorama-tab').click()
  await page.getByTestId('device-connect').click()
  await page.getByTestId('device-start').click()
  await page.getByTestId('device-cancel').click()
  await expect(page.getByTestId('device-result')).toHaveCount(0)
  await page.getByTestId('device-connect').click()
  await page.getByTestId('device-start').click()
  await expect(page.getByTestId('device-result')).toContainText('无真实原图或可上传文件')
  await shot('04-panorama-result')
  await page.locator('.action-workspace-scroll').evaluate(el => { el.scrollTop = 0 })
  await shot('05-panorama-top')

  const accent = await page.getByTestId('device-panorama-tab').evaluate(el => getComputedStyle(el).color)
  expect(accent).toBe(brand === 'yuhong' ? 'rgb(200, 32, 43)' : 'rgb(40, 120, 242)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.setViewportSize({ width: 375, height: 667 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.setViewportSize({ width: 430, height: 932 })
  await page.evaluate(async () => {
    const { useSessionStore } = await import(/* @vite-ignore */ '/src/shared/state/' + 'index.ts')
    useSessionStore().session = null
  })
  await expect(page.getByTestId('device-mock-blocked')).toBeVisible()
  expect(external).toEqual([])
  expect(errors).toEqual([])
  writeFileSync(`.review/device-action/${brand}/ledger.json`, JSON.stringify({ external, errors, accent }, null, 2))
})
