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
  await addItem('procedure', 'mock-catalog-procedure-roof-node', true)
  await addItem('material', 'mock-catalog-material-butyl-tape')
  await addItem('material', 'mock-catalog-material-polyester-fabric')
  await addItem('measure', 'mock-catalog-measure-site-safety')

  const group = page.getByTestId('quotation-repair-group-quotation-group-1')
  await expect(group).toBeVisible()
  const context = page.getByTestId('quotation-group-context-quotation-group-1')
  if (await context.isVisible()) await page.getByTestId('quotation-group-context-toggle-quotation-group-1').click()
  await expect(context).toBeHidden()
  const collapsed = page.getByTestId('quotation-group-collapsed-summary-quotation-group-1')
  if (await collapsed.isVisible()) {
    await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  }
  const content = group.getByTestId('quotation-composition-selection')
  await expect(content).toHaveCount(4)
  await page.getByTestId('quotation-group-section-quotation-group-1-procedure')
    .locator('.quotation-content__quantity input').fill('12')
  const materialQuantities = page.getByTestId('quotation-group-section-quotation-group-1-material')
    .locator('.quotation-content__quantity input')
  await materialQuantities.nth(0).fill('8')
  await materialQuantities.nth(1).fill('4')
  // Measure stays at the catalogue default quantity of one.
  await expect(page.getByTestId('quotation-group-subtotal-quotation-group-1'))
    .toContainText('1291.00', { timeout: 20000 })
  await expect(page.getByTestId('quotation-footer-summary')).toContainText('1291.00')
  await expect(group.locator('.quotation-content__line-unit-price')).toHaveCount(4)
  await expect(group.locator('.quotation-content__line-money-value')).toHaveCount(4)
  const expectedTotals = ['820.80', '308.80', '107.20', '54.20']
  for (const total of expectedTotals) {
    await expect(group.locator('.quotation-content__line-money-value').filter({ hasText: total }))
      .toHaveCount(1)
  }
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
  // Each frame is an unaltered viewport screenshot from a real operator
  // scroll state. Do not claim one browser viewport captures a long scrollview.
  const procedure = page.getByTestId('quotation-group-section-quotation-group-1-procedure')
  await procedure.scrollIntoViewIfNeeded()
  const overviewImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q01-overview-and-procedure-375x667.png'), overviewImage)
  await info.attach('Q01 overview + procedure viewport', { body: overviewImage, contentType: 'image/png' })

  await material.scrollIntoViewIfNeeded()
  const materialImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q01-materials-375x667.png'), materialImage)
  await info.attach('Q01 material rows viewport', { body: materialImage, contentType: 'image/png' })
  const materialCard = await material.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q01-materials-card.png'), materialCard)

  const measures = page.getByTestId('quotation-group-section-quotation-group-1-measure')
  await measures.scrollIntoViewIfNeeded()
  const measureImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q01-measures-and-action-375x667.png'), measureImage)
  await info.attach('Q01 measures + actions viewport', { body: measureImage, contentType: 'image/png' })
  await writeFile(resolve(dir, 'evidence.json'), JSON.stringify({
    viewport: '375x667', source: 'real uni-app H5 / DEV Mock', lineCount: 4,
    materialQuantityX: qtyX, style: geometry, externalRequests, runtimeErrors,
    gitCommit: process.env.GITHUB_SHA ?? 'local',
  }, null, 2))
})
