import { expect, test } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = process.env.VITE_XLINK_BRAND || 'xlink'
for (const width of [430, 375]) test(`${brand} catalog actions fit their labels at ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: width === 430 ? 932 : 667 })
  const remote: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === baseURL
    ? route.continue() : (remote.push(route.request().method()), route.abort('blockedbyclient')))
  await page.goto('/#/pages/index/index')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await page.getByTestId('task-focus-action').click()
  await page.getByTestId('quotation-hub-create-unverified').click()
  if (brand === 'yuhong') {
    await expect(page.locator('.quotation-content__initial-empty-heading')).toHaveCSS('display', 'flex')
    await expect(page.locator('.quotation-content__initial-field-label').first()).toHaveCSS('display', 'block')
    await expect(page.getByTestId('quotation-empty-illustration')).not.toBeVisible()
  }
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByRole('dialog', { name: '选择维修部位' }).locator('.app-cascade-selector__parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('落水口周边局部修缮')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
  await page.getByTestId('quotation-first-step-select-products').click()
  const configure = page.getByTestId('quotation-package-detail-mock-catalog-package-basic')
  await expect(configure).toBeVisible()
  const packageGeometry = await configure.evaluate(el => {
    const label = el.querySelector('.app-button__label')!, box = el.getBoundingClientRect()
    const textNode=Array.from(label.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())!
    const range=document.createRange();range.selectNodeContents(textNode)
    return { width: box.width, height: box.height, textLines: Array.from(range.getClientRects()).filter(r=>r.width>0).length, maxWidth: getComputedStyle(el).maxWidth }
  })
  expect(packageGeometry.height).toBeGreaterThanOrEqual(44)
  if (brand === 'yuhong') {
    expect(packageGeometry.textLines).toBe(1)
  }
  await page.getByTestId('quotation-catalog-kind-material').click()
  const item = page.getByTestId('quotation-catalog-item-material-mock-catalog-material-sealant')
  await expect(item).toBeVisible()
  for (const id of ['quotation-material-options-mock-catalog-material-sealant', 'quotation-catalog-add-material-mock-catalog-material-sealant']) {
    const action = page.getByTestId(id), box = (await action.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
    if (brand === 'yuhong') expect(await action.locator('.app-button__label').evaluate(el => el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(1)
  }
  await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-sealant').click()
  if (await page.getByTestId('quotation-catalog-close').isVisible()) await page.getByTestId('quotation-catalog-close').click()
  await page.getByTestId('quotation-browse-quotation-group-1').click()
  await page.getByTestId('quotation-catalog-kind-material').click()
  await page.getByTestId('quotation-material-options-mock-catalog-material-sealant').click()
  await page.getByTestId('quotation-sku-option-thickness-2').click()
  await page.getByTestId('quotation-sku-option-color-black').click()
  await page.getByTestId('quotation-sku-save-local').click()
  await page.getByTestId('quotation-catalog-close').click()
  if (await page.getByTestId('quotation-group-collapsed-summary-quotation-group-1').isVisible()) {
    await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  }
  await expect(page.locator('[data-testid^="quotation-material-skus-"]')).toContainText('厚度：2毫米 / 颜色：黑色')
  await expect(page.getByTestId('quotation-commercial-draft-badge')).toContainText('草稿已保存')
  await page.reload()
  await page.getByTestId('quotation-hub-create-unverified').click()
  if (await page.getByTestId('quotation-group-collapsed-summary-quotation-group-1').isVisible()) {
    await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  }
  await expect(page.locator('[data-testid^="quotation-material-skus-"]')).toContainText('厚度：2毫米 / 颜色：黑色')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  expect(remote).toEqual([]); expect(errors).toEqual([])
})
