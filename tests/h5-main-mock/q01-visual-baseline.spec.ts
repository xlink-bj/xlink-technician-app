import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Q01 Visual Baseline V1 — the actual uni-app quotation component.
 * Fixed Owner review viewport 375x667; no device matrix or detached mock UI.
 * All reads are DEV Mock, network is fail-closed, business writes remain off.
 */
test('Q01 selected-items visual baseline on real App H5, 375x667', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const externalRequests: string[] = []
  const runtimeErrors: string[] = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    externalRequests.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()

  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-first-step-description').locator('textarea')
    .fill('平屋面落水口及泛水节点局部渗漏维修')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('18.6')
  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()

  // Four source-backed catalogue selections in one real composition.
  // Prices are NEVER supplied in this test or UI; verified amount is engine-owned.
  async function addItem(kind: string, id: string, isFirst = false) {
    if (!isFirst) await page.getByTestId('quotation-browse-quotation-group-1').click()
    await page.getByTestId('quotation-catalog-kind-' + kind).click()
    await page.getByTestId('quotation-catalog-add-' + kind + '-' + id).click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  }
  await addItem('procedure', 'mock-catalog-procedure-seal', true)
  await addItem('material', 'mock-catalog-material-sealant')
  await addItem('material', 'mock-catalog-material-ordinary-1')
  await addItem('measure', 'mock-catalog-measure-inspection')

  const group = page.getByTestId('quotation-repair-group-quotation-group-1')
  await expect(group).toBeVisible()
  const collapsed = page.getByTestId('quotation-group-collapsed-summary-quotation-group-1')
  if (await collapsed.isVisible()) {
    await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  }
  const content = group.getByTestId('quotation-composition-selection')
  await expect(content).toHaveCount(4)
  const material = page.getByTestId('quotation-group-section-quotation-group-1-material')
  await expect(material).toBeVisible()
  const geometry = await material.evaluate(el => {
    const style = getComputedStyle(el)
    return { radius: parseFloat(style.borderTopLeftRadius), background: style.backgroundColor }
  })
  expect(geometry.radius).toBeGreaterThanOrEqual(15)
  expect(geometry.background).toBe('rgb(255, 255, 255)')
  const qtyX = await material.locator('.quotation-content__quantity-wrap')
    .evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().left * 10) / 10))
  expect(qtyX).toHaveLength(2)
  expect(Math.abs(qtyX[0]! - qtyX[1]!), 'two Material quantity inputs share an alignment grid').toBeLessThanOrEqual(1)
  await expect(page.getByTestId('quotation-footer-summary')).toBeVisible()
  expect(externalRequests, 'DEV visual proof must never contact a remote endpoint').toEqual([])
  expect(runtimeErrors).toEqual([])

  const dir = resolve('.review/q01-visual-baseline')
  await mkdir(dir, { recursive: true })
  const viewportImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q01-selected-375x667.png'), viewportImage)
  await info.attach('Q01 real-App selection, 375x667', { body: viewportImage, contentType: 'image/png' })
  // Element capture conveys the long business group while the viewport proof
  // documents fixed navigation and footer. Neither shot changes DOM/CSS.
  const groupImage = await group.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q01-selected-group-full.png'), groupImage)
  await info.attach('Q01 full business group', { body: groupImage, contentType: 'image/png' })
  await writeFile(resolve(dir, 'evidence.json'), JSON.stringify({
    viewport: '375x667', source: 'real uni-app H5 / DEV Mock', lineCount: 4,
    materialQuantityX: qtyX, style: geometry, externalRequests, runtimeErrors,
    gitCommit: process.env.GITHUB_SHA ?? 'local',
  }, null, 2))
})
