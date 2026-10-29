import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * CUI-01 single-device operator flow: actual uni-app H5 (not mock HTML).
 * Home -> WorkOrder list -> Detail -> Q01 -> Q03; 375 x 667 only.
 * Geometry reflects the real touch target, not screenshot approximations.
 */
test('cross-page controls and category labels obey one visual grid at 375px', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const external: string[] = []
  const runtimeErrors: string[] = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  const dir = resolve('.review/cui01-geometry')
  await mkdir(dir, { recursive: true })
  const measurements: Record<string, unknown> = {}
  async function assertTapTarget(label: string, locator: Locator, minimum = 44) {
    await expect(locator, label).toBeVisible()
    const box = await locator.boundingBox()
    expect(box, `${label} must have an interactive box`).not.toBeNull()
    expect(box!.height, `${label} touch target >=${minimum}px`).toBeGreaterThanOrEqual(minimum)
    expect(box!.width, `${label} width must be nonzero`).toBeGreaterThan(30)
    expect(box!.x, `${label} stays in viewport`).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width, `${label} stays in viewport`).toBeLessThanOrEqual(376)
    measurements[label] = { x: box!.x, width: box!.width, height: box!.height }
  }
  async function screenshot(name: string) {
    const buffer = await page.screenshot({ animations: 'disabled', caret: 'hide' })
    await writeFile(resolve(dir, name + '.png'), buffer)
    await info.attach(name, { body: buffer, contentType: 'image/png' })
  }

  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home-page')).toBeVisible()
  await assertTapTarget('home work-order entry', page.locator('.work-orders-entry'))
  await screenshot('home-375')

  await page.locator('.work-orders-entry').click()
  await page.locator('.search-input input').fill('26018')
  await assertTapTarget('work-order list search', page.locator('.search-button'))
  await page.locator('.search-button').click()
  await page.locator('.work-order-card').filter({ hasText: '吴先生' }).click()
  await expect(page.locator('.summary-number')).toContainText('26018')
  await assertTapTarget('detail primary task', page.getByTestId('task-focus-action'), 50)
  await screenshot('work-order-detail-375')

  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea')
    .fill('平屋面落水口及泛水节点局部渗漏维修')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('18.6')
  await assertTapTarget('Q01 choose products', page.getByTestId('quotation-first-step-select-products'))
  await screenshot('q01-first-step-375')

  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  const controls = page.locator('.quotation-content__catalog-main > .quotation-content__category-grid > .quotation-content__category')
  await expect(controls).toHaveCount(4)
  const geometry = await controls.evaluateAll(nodes => nodes.map(node => {
    const element = node as HTMLElement
    const hitbox = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const label = range.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      name: element.textContent?.trim(),
      height: hitbox.height,
      offset: Math.round(((label.top + label.bottom - hitbox.top - hitbox.bottom) / 2) * 10) / 10,
      display: style.display, align: style.alignItems,
    }
  }))
  for (const item of geometry) {
    expect(item.height, `${item.name} tab touch height`).toBeGreaterThanOrEqual(44)
    expect(Math.abs(item.offset), `${item.name} must have visually centered text`).toBeLessThanOrEqual(3)
  }
  measurements['Q03 four category tabs'] = geometry
  await assertTapTarget('Q03 footer return', page.getByTestId('quotation-catalog-return'))
  await screenshot('q03-category-375')

  // Source-based navigation must remain functionally reversible.
  await page.getByTestId('quotation-catalog-return').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  expect(external).toEqual([])
  expect(runtimeErrors).toEqual([])
  await writeFile(resolve(dir, 'measurements.json'), JSON.stringify({
    viewport: '375x667', source: 'real uni-app H5, DEV Mock adapter',
    measurements, external, runtimeErrors, sha: process.env.GITHUB_SHA ?? 'local',
  }, null, 2))
})
