import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const directory = `.review/雨虹预约执行工作台/${brand}/430x932`

test('appointment real navigation, time selection, cancellation, confirmation and draft recovery', async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method()); return route.abort('blockedbyclient')
  })
  const shot = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    const footer = page.locator('.action-workspace-footer')
    if (await footer.count()) {
      const box = (await footer.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(933)
      expect(box.y).toBeGreaterThan(500)
    }
    await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26019', customer: '蒋女士' })).click()
  await page.getByTestId('task-focus-action').click()
  const submit = page.getByTestId('action-workspace-submit')
  await expect(submit).toHaveAttribute('aria-disabled', 'true')
  await shot('01-预约填写-未选择')
  await page.locator('.action-content-field--choice').getByText('需要上门', { exact: true }).click()
  if (brand === 'yuhong') await expect(page.locator('.app-choice--selected')).toHaveCSS('border-color', 'rgb(200, 32, 43)')
  const note = page.locator('.action-content-field--note textarea')
  await note.fill('已与客户沟通，请到达前联系。')
  await page.locator('.appointment-time-selector').click()
  await expect(page.locator('.time-selection-submit')).toHaveAttribute('aria-disabled', 'true')
  await shot('02-预约选时-未选择')
  await page.locator('.date-shortcut').nth(1).click()
  await page.locator('.time-slot').filter({ hasText: '14:00' }).click()
  await expect(page.locator('.time-slot--selected')).toHaveCSS('color', brand === 'yuhong' ? 'rgb(200, 32, 43)' : 'rgb(40, 120, 242)')
  await shot('03-预约选时-已选择')
  await page.locator('.time-selection-submit').click()
  await expect(page.locator('.confirmation-note')).toHaveText('已与客户沟通，请到达前联系。')
  await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
  await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
  await expect(page.locator('.appointment-time-selected-value')).toContainText('14:00')
  await expect(submit).toHaveAttribute('aria-disabled', 'true')
  await expect(submit).toHaveAttribute('disabled', 'true')
  await shot('04-预约填写-已回填')
  await page.locator('.appointment-time-selector').click()
  await page.locator('.time-slot').first().click()
  await page.locator('.uni-page-head-hd').click()
  await expect(page.locator('.appointment-time-selected-value')).toContainText('14:00')
  await page.locator('.appointment-time-selector').click()
  await page.locator('.time-slot').filter({ hasText: '14:00' }).click()
  await page.locator('.time-selection-submit').click()
  await expect(page.locator('.confirmation-note')).toHaveText('已与客户沟通，请到达前联系。')
  await shot('05-预约确认-返回可修改')
  await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
  await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
  await page.reload()
  await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
  await shot('06-预约草稿-刷新恢复')
  await page.locator('.action-content-field--choice').getByText('暂不上门', { exact: true }).click()
  await expect(page.locator('.appointment-time-selector')).toHaveCount(0)
  await shot('07-预约填写-暂不上门')
  await page.goto('/#/pages/work-orders/action-time')
  await expect(page.locator('.workspace-state-title')).toContainText('暂不可用')
  await shot('08-选时异常-缺少工单上下文')
  expect(external).toEqual([]); expect(errors).toEqual([])
})
