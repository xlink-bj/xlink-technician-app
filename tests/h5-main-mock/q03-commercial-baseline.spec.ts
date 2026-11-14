import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [375, 390, 430]) {
  test(`Q03 material price and specification actions remain readable at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : width === 390 ? 844 : 932 })
    const remote: string[] = [], errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      remote.push(url.origin + url.pathname); return route.abort('blockedbyclient')
    })
    await page.goto('/#/pages/index/index?devReview=1')
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByRole('dialog', { name: '选择维修部位' }).locator('.app-cascade-selector__parents')
      .getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-repair-part-picker-done').click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('屋面局部修补')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
    await page.getByTestId('quotation-first-step-select-products').click()
    await page.getByTestId('quotation-catalog-kind-material').click()
    const card = page.getByTestId('quotation-catalog-item-material-mock-catalog-material-sealant')
    await expect(card).toContainText('按材料规格核价')
    await card.scrollIntoViewIfNeeded()
    const dir = resolve('.review/q03-commercial-baseline')
    await mkdir(dir, { recursive: true })
    await page.screenshot({ path: resolve(dir, `q03-spec-actions-${width}.png`), animations: 'disabled' })
    for (const item of [card, page.getByTestId('quotation-catalog-item-material-mock-catalog-material-butyl-tape')]) {
      const geometry = await item.evaluate(element => {
        const footer = element.querySelector('.quotation-content__catalog-item-footer')!.getBoundingClientRect()
        const price = element.querySelector('.quotation-content__catalog-item-price')!.getBoundingClientRect()
        return { width: price.width, footerWidth: footer.width, priceBottom: price.bottom,
          actions: [...element.querySelectorAll('.quotation-content__catalog-item-action')].map(action => {
            const box = action.getBoundingClientRect()
            return { left: box.left, right: box.right, top: box.top, height: box.height }
          }), left: footer.left, right: footer.right }
      })
      expect(geometry.width).toBeGreaterThanOrEqual(geometry.footerWidth - 1)
      for (const action of geometry.actions) {
        expect(action.top).toBeGreaterThanOrEqual(geometry.priceBottom)
        expect(action.height).toBeGreaterThanOrEqual(44)
        expect(action.left).toBeGreaterThanOrEqual(geometry.left - 1)
        expect(action.right).toBeLessThanOrEqual(geometry.right + 1)
      }
    }
    await page.getByTestId('quotation-material-options-mock-catalog-material-sealant').click()
    await expect(page.getByTestId('quotation-sku-field-thickness')).toBeVisible()
    await page.getByTestId('quotation-sku-preview-back').click()
    const ordinary = page.getByTestId('quotation-catalog-item-material-mock-catalog-material-butyl-tape')
    await expect(ordinary).toContainText('¥38.60/卷')
    await expect(ordinary.locator('.quotation-content__catalog-item-action')).toHaveCount(1)
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-butyl-tape').click()
    await expect(page.getByTestId('quotation-repair-group-quotation-group-1')).toContainText('丁基防水密封胶带')
    expect(remote).toEqual([]); expect(errors).toEqual([])
  })
}

/** Owner review: one width, actual uni-app component, source-shaped DEV Mock. */
test('Q03 source-priced roof materials, commercial layout and return-to-Q01 at 375px', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const remote: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    remote.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByRole('dialog', { name: '选择维修部位' }).locator('.app-cascade-selector__parents')
    .getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea')
    .fill('平屋面落水口及泛水节点局部渗漏维修')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('18.6')
  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  const dir = resolve('.review/q03-commercial-baseline')
  await mkdir(dir, { recursive: true })
  const packageCard = page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')
  await expect(packageCard).toBeVisible()
  await expect(packageCard).toContainText('平屋面节点防水维修套餐')
  await expect(packageCard).toContainText('按套餐配置核价')
  // The catalogue now has verified R1 classification providers. Keep the
  // navigation rail only when backed filters exist, and verify it filters the
  // package list instead of preserving the old no-taxonomy baseline.
  await expect(page.getByTestId('quotation-catalog-facets')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-facet-mock-site')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-facet-mock-exterior')).toBeVisible()
  await page.getByTestId('quotation-catalog-facet-mock-exterior').click()
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-extended')).toBeVisible()
  await expect(packageCard).toHaveCount(0)
  await page.getByTestId('quotation-catalog-facet-all').click()
  await expect(packageCard).toBeVisible()
  expect(await packageCard.innerText()).not.toMatch(/示例|Mock|DEV|仿真|DEMO/)

  // Visual-contract gate: text must share the vertical centre of each 44px
  // hit target. An underline fixed at bottom is NOT evidence of good alignment.
  const measureTabs = async () => page
    .locator('[data-testid="quotation-catalog-categories"] > .quotation-content__category')
    .evaluateAll(nodes => nodes.map(node => {
      const el = node as HTMLElement
      const hit = el.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(el)
      const label = range.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        text: el.textContent?.trim(),
        hitHeight: hit.height,
        labelCenterOffset: Math.round((((label.top + label.bottom) / 2) - ((hit.top + hit.bottom) / 2)) * 10) / 10,
        display: style.display, alignItems: style.alignItems, justifyContent: style.justifyContent,
        lineHeight: style.lineHeight,
      }
    }))
  const packageTabs = await measureTabs()
  expect(packageTabs).toHaveLength(4)
  for (const tab of packageTabs) {
    expect(tab.hitHeight, `${tab.text} target height`).toBeGreaterThanOrEqual(44)
    expect(Math.abs(tab.labelCenterOffset), `${tab.text} text must be centered, measured ${JSON.stringify(tab)}`)
      .toBeLessThanOrEqual(3)
  }
  const entryImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q03-package-entry-375x667.png'), entryImage)
  await info.attach('Q03 source-shaped commercial package entry, 375x667', { body: entryImage, contentType: 'image/png' })
  await page.getByTestId('quotation-catalog-kind-material').click()
  const materialTabs = await measureTabs()
  for (const tab of materialTabs) {
    expect(Math.abs(tab.labelCenterOffset), `material mode: ${JSON.stringify(tab)}`)
      .toBeLessThanOrEqual(3)
  }
  await page.getByTestId('quotation-catalog-search').locator('input').fill('10m')
  await expect(page.getByTestId('quotation-catalog-item-material-mock-catalog-material-butyl-tape')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-item-material-mock-catalog-material-polyester-fabric')).toBeVisible()
  const results = page.locator('.quotation-content__catalog-list .quotation-content__catalog-item')
  await expect(results).toHaveCount(2)

  const tape = page.getByTestId('quotation-catalog-item-material-mock-catalog-material-butyl-tape')
  const fabric = page.getByTestId('quotation-catalog-item-material-mock-catalog-material-polyester-fabric')
  await expect(tape).toContainText('丁基防水密封胶带')
  await expect(fabric).toContainText('聚酯胎增强布')
  await expect(page.getByTestId('quotation-catalog-price-mock-catalog-material-butyl-tape'))
    .toContainText('¥38.60/卷')
  await expect(page.getByTestId('quotation-catalog-price-mock-catalog-material-polyester-fabric'))
    .toContainText('¥26.80/卷')
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('平屋面落水口')
  await expect(page.getByTestId('quotation-catalog-footer')).toContainText('已选 0 项')
  expect(await results.allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/结构示例|模拟|Mock|DEV/)]))

  const paint = await tape.evaluate(el => {
    const card = getComputedStyle(el)
    const title = getComputedStyle(el.querySelector('.quotation-content__catalog-item-title')!)
    const price = getComputedStyle(el.querySelector('.quotation-content__catalog-item-price-value')!)
    return {
      radius: parseFloat(card.borderTopLeftRadius),
      titleSize: parseFloat(title.fontSize),
      priceSize: parseFloat(price.fontSize),
      background: card.backgroundColor,
    }
  })
  expect(paint.radius).toBeGreaterThanOrEqual(11)
  expect(paint.titleSize).toBeGreaterThanOrEqual(15)
  expect(paint.priceSize).toBeGreaterThanOrEqual(16)
  expect(paint.background).toBe('rgb(255, 255, 255)')

  const image = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q03-roof-materials-375x667.png'), image)
  await info.attach('Q03 actual commercial catalogue, 375x667', { body: image, contentType: 'image/png' })

  await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-butyl-tape').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('quotation-repair-group-quotation-group-1')).toContainText('丁基防水密封胶带')
  await page.getByTestId('quotation-browse-quotation-group-1').click()
  await page.getByTestId('quotation-catalog-kind-material').click()
  await expect(page.getByTestId('quotation-catalog-selected-material-mock-catalog-material-butyl-tape'))
    .toContainText('已选')
  await expect(page.getByTestId('quotation-catalog-footer')).toContainText('已选 1 项')
  const selectedImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q03-item-selected-375x667.png'), selectedImage)
  await info.attach('Q03 selected material / reversible navigation', { body: selectedImage, contentType: 'image/png' })
  await page.getByTestId('quotation-catalog-return').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  expect(remote).toEqual([])
  expect(errors).toEqual([])
  const reportDir = resolve('test-results/q03-commercial-baseline')
  await mkdir(reportDir, { recursive: true })
  await writeFile(resolve(reportDir, 'metrics.json'), JSON.stringify({
    viewport: '375x667', source: 'real uni-app, DEV Mock via adapter',
    materialPrices: [38.6, 26.8], tabs: { packageTabs, materialTabs }, paint, remote, errors,
    head: process.env.GITHUB_SHA ?? 'local',
  }, null, 2))
})
