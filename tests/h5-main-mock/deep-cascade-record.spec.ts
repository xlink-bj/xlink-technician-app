import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

test('430×932 three-level cascade reaches leaves and retains the entire saved path', async ({ page }) => {
  test.skip(process.env.VITE_XLINK_R1_DEEP_CASCADE !== 'true', 'Explicit deep-tree fixture required')
  await page.setViewportSize({ width: 430, height: 932 })
  const field = page.getByTestId('a-special-field-inspectionLocation')
  const capture = async (name: string) => {
    const directory = process.env.XLINK_STAGE_B_SCREENSHOTS
    if (!directory) return
    mkdirSync(directory, { recursive: true })
    await field.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${directory}/${name}.png` })
  }
  const external: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-020-local-forms')
  await enterDevMockDynamicFormWorkspace(page)
  await page.getByTestId('a-special-definition-choice').locator('.app-choice').filter({ hasText: '现场记录' }).click()
  await expect(field).toBeVisible()
  await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('三级级联完整路径')
  await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '可继续施工' }).click()
  await expect(field.locator('.app-cascade-selector__parent')).toHaveCount(0)
  await capture('cascade-before-selection')
  await field.locator('.app-choice').filter({ hasText: '外侧' }).click()
  await capture('cascade-selected')
  await expect(field.locator('.app-choice').filter({ hasText: '外侧' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'false')
  await page.getByTestId('a-special-save').click()
  const savedRow = page.locator('[data-testid^="a-special-row-"]').filter({ hasText: '三级级联完整路径' })
  await expect(savedRow).toBeVisible()
  const savedId = (await savedRow.getAttribute('data-testid'))!.replace('a-special-row-', '')
  await page.reload()
  await page.getByTestId(`a-special-edit-${savedId}`).click()
  await expect(field.locator('.app-choice').filter({ hasText: '外侧' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate((summary) => {
    const rows = JSON.parse(localStorage.getItem('xlink.dev.mock.r1-special.020-021.v1')!).rows
    const typedRows = rows as Record<string, { inspectionSummary?: unknown; inspectionLocation?: unknown }>
    return Object.values(typedRows).find(row => row.inspectionSummary === summary)?.inspectionLocation
  }, '三级级联完整路径')).toEqual(['roof', 'drain', 'outer'])
  expect(external).toEqual([])
})
