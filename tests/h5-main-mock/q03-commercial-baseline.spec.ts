import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

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
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
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
  await expect(page.getByTestId('quotation-catalog-facets')).toHaveCount(0)
  expect(await packageCard.innerText()).not.toMatch(/示例|Mock|DEV|仿真|DEMO/)
  const entryImage = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  await writeFile(resolve(dir, 'q03-package-entry-375x667.png'), entryImage)
  await info.attach('Q03 source-shaped commercial package entry, 375x667', { body: entryImage, contentType: 'image/png' })
  await page.getByTestId('quotation-catalog-kind-material').click()
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
  await writeFile(resolve(dir, 'metrics.json'), JSON.stringify({
    viewport: '375x667', source: 'real uni-app, DEV Mock via adapter',
    materialPrices: [38.6, 26.8], paint, remote, errors,
    head: process.env.GITHUB_SHA ?? 'local',
  }, null, 2))
})
