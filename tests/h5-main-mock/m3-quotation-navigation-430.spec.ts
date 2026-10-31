import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Actual uni-app, protocol-shaped synthetic Mock; no Production/Beta traffic.
test('M3 Q02/Q03: restore a configured package, retain target group and edit it at 430×932', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    remote.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  const openQuotation = async () => {
    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('qa-console')).toBeVisible()
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  }

  await openQuotation()
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('平屋面泛水节点维修')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('18.6')
  await page.getByTestId('quotation-first-step-select-products').click()
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-config-focus'))
    .toContainText('选择材料后确认加入当前维修部位组')
  await page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0').click()
  await page.getByTestId('quotation-package-material-choice-number:2-0').click()
  await page.getByTestId('quotation-package-configure-commit').click()
  const firstGroup = page.getByTestId('quotation-repair-group-quotation-group-1')
  await expect(firstGroup).toContainText('平屋面泛水节点维修')
  await expect(firstGroup).toContainText('平屋面节点防水维修套餐')

  // Group 2 receives its own catalog selection. No lines may leak to group 1.
  await page.getByTestId('quotation-add-group').click()
  const secondGroup = page.getByTestId('quotation-repair-group-quotation-group-2')
  await expect(secondGroup).toBeVisible()
  await secondGroup.getByTestId('quotation-repair-part-selector-quotation-group-2')
    .getByText('屋面', { exact: true }).click()
  await secondGroup.getByTestId('quotation-group-description-quotation-group-2')
    .locator('textarea').fill('天沟局部修补')
  await secondGroup.getByTestId('quotation-group-quantity-quotation-group-2')
    .locator('input').fill('6.2')
  await page.getByTestId('quotation-browse-quotation-group-2').click()
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('天沟局部修补')
  await page.getByTestId('quotation-catalog-kind-material').click()
  await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-butyl-tape').click()
  await expect(secondGroup).toContainText('丁基防水密封胶带')
  await expect(firstGroup).not.toContainText('丁基防水密封胶带')

  // A fresh catalog store must resolve the list before reopening a saved
  // package's details. The previous implementation blocked this valid path.
  await page.getByTestId('quotation-review-orders').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await openQuotation()
  await expect(firstGroup).toContainText('平屋面节点防水维修套餐')
  await page.getByTestId('quotation-package-edit-quotation-group-1-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-detail')).toBeVisible()
  await expect(page.getByTestId('quotation-package-detail-error')).toHaveCount(0)
  await expect(page.getByTestId('quotation-package-config-focus'))
    .toContainText('本次修改需确认保存到当前维修部位组')
  await expect(page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0'))
    .toHaveAttribute('aria-pressed', 'true')

  const dir = resolve('.review/m3-p0b')
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, 'q03-package-restored-430x932.png'), animations: 'disabled' })
  await page.getByTestId('quotation-package-detail-back').click()
  await page.getByTestId('quotation-catalog-return').click()
  await expect(secondGroup).toContainText('丁基防水密封胶带')
  expect(remote).toEqual([])
  expect(errors).toEqual([])
})
