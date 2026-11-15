import { test, expect, type Page } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const phase = process.env.NODE_REVIEW_PHASE === 'before' ? 'before' : 'after'
const base = phase === 'before' ? `.review/存档/雨虹动态节点接入前/${brand}` : `.review/雨虹完整业务流程-20261115/02-动态表单与节点操作/${brand}`
async function open(page: Page, kind: 'forms' | 'repeat') {
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, kind === 'forms' ? '020' : '021')).click()
  await enterDevMockDynamicFormWorkspace(page)
  await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
}
async function fill(page: Page, value: string) {
  await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill(value)
  await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
}
async function shot(page: Page, folder: string, name: string, anchor?: string) {
  if (anchor) await page.getByTestId(anchor).scrollIntoViewIfNeeded()
  if (phase === 'after') {
    const footer = (await page.locator('.action-workspace-footer').boundingBox())!
    expect(footer.y + footer.height).toBeLessThanOrEqual(933)
    expect((await page.getByTestId('special-form-workspace-back').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  expect(await page.locator('body').innerText()).not.toMatch(/DEV|Mock|fixture|SYNTHETIC|源协议|事务协议/)
  await page.screenshot({ path: `${base}/${folder}/${name}.png`, animations: 'disabled', caret: 'hide' })
}
test.beforeEach(async ({ page, baseURL }) => {
  page.on('pageerror', error => { throw error })
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    throw new Error('External request prohibited in synthetic node review')
  })
})
for (const kind of ['forms', 'repeat'] as const) test(`${kind}: real task navigation, CRUD, draft recovery and node completion`, async ({ page }) => {
  await open(page, kind)
  await expect(page.getByTestId('a-special-form-validation')).toBeVisible()
  await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'true')
  await shot(page, kind, '01-记录列表与必填未完成')
  await shot(page, kind, '01b-必填校验与禁用保存', 'a-special-form-validation')
  await fill(page, '现场记录：已核对本次任务信息')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
  if (brand === 'yuhong' && phase === 'after') {
    await expect(page.getByTestId('a-special-field-inspectionResult').locator('.app-choice--selected')).toHaveCSS('color', 'rgb(200, 32, 43)')
    await expect(page.getByTestId('a-special-save')).toHaveCSS('background-color', 'rgb(200, 32, 43)')
    await expect(page.getByTestId('special-form-workspace-back')).toHaveClass(/app-button--secondary/)
  }
  await shot(page, kind, '02-填写-仅本机草稿', 'a-special-save')
  await page.reload()
  await expect(page.getByTestId('a-special-field-inspectionSummary').locator('textarea')).toHaveValue('现场记录：已核对本次任务信息')
  await shot(page, kind, '03-刷新恢复-尚未保存记录', 'a-special-local-draft')
  await page.getByTestId('a-special-save').click()
  const id = `mock-special-form-data-${kind}-1`, row = page.getByTestId('a-special-row-' + id)
  await expect(row).toContainText('现场记录：已核对本次任务信息')
  await shot(page, kind, '04-保存记录并回读', 'a-special-row-' + id)
  await page.getByTestId('a-special-edit-' + id).click()
  await fill(page, '现场记录：补充核对意见')
  await shot(page, kind, '05-编辑已保存记录', 'a-special-save')
  await page.getByTestId('a-special-save').click()
  await expect(row).toContainText('现场记录：补充核对意见')
  await fill(page, '补充记录：处理意见已复核')
  await page.getByTestId('a-special-save').click()
  await expect(page.getByTestId(`a-special-row-mock-special-form-data-${kind}-2`)).toContainText('补充记录：处理意见已复核')
  await shot(page, kind, '06-多条记录列表', 'a-special-row-' + id)
  await page.getByTestId('a-special-delete-' + id).click()
  await shot(page, kind, '07-删除记录确认', 'a-special-confirm-delete-' + id)
  await page.getByTestId('a-special-confirm-delete-' + id).click()
  if (kind === 'forms') await expect(row).toContainText('已删除')
  else await expect(row).toHaveCount(0)
  await shot(page, kind, '08-删除后仍保留有效记录', `a-special-row-mock-special-form-data-${kind}-2`)
  await page.getByTestId('a-special-finish-request').click()
  await shot(page, kind, '09-完成当前节点确认', 'a-special-finish-confirm')
  await page.getByTestId('a-special-finish-confirm').click()
  await expect(page.getByTestId('a-special-complete')).toBeVisible()
  await expect(page.getByTestId('a-special-save')).toHaveCount(0)
  await shot(page, kind, '10-当前节点完成-非整单完工', 'a-special-complete')
  await page.reload()
  await expect(page.getByTestId('a-special-complete')).toBeVisible()
  await shot(page, kind, '11-重新进入已完成记录', 'a-special-complete')
})
test('outdated edit conflicts and preserves the authoritative saved record', async ({ page, context }) => {
  await open(page, 'forms'); await fill(page, '原始记录'); await page.getByTestId('a-special-save').click()
  const id = 'mock-special-form-data-forms-1'
  await expect(page.getByTestId('a-special-row-' + id)).toBeVisible()
  const other = await context.newPage()
  await other.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174' ? route.continue() : route.abort())
  await open(other, 'forms')
  await page.getByTestId('a-special-edit-' + id).click(); await other.getByTestId('a-special-edit-' + id).click()
  await fill(page, '已保存的新版本'); await page.getByTestId('a-special-save').click()
  await expect(page.getByTestId('a-special-row-' + id)).toContainText('已保存的新版本')
  await fill(other, '尚未提交的旧版本修改'); await other.getByTestId('a-special-save').click()
  await expect(other.getByTestId('a-special-operation-feedback')).toContainText('记录已被其他编辑器更新')
  await shot(other, '辅助异常', '12-编辑版本冲突-未覆盖新版本', 'a-special-operation-feedback')
  await other.reload(); await expect(other.getByTestId('a-special-row-' + id)).toContainText('已保存的新版本')
})

test('forms save-and-complete confirms the current node and retains the saved record', async ({ page }) => {
  await open(page, 'forms'); await fill(page, '本次记录与处理意见已核对')
  await page.getByTestId('a-special-save-finish-request').click()
  await shot(page, '保存并完成', '13-保存并完成当前节点-确认', 'a-special-save-finish-confirm')
  await page.getByTestId('a-special-save-finish-confirm').click()
  await expect(page.getByTestId('a-special-complete')).toBeVisible()
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText('本次记录与处理意见已核对')
  await shot(page, '保存并完成', '14-记录已保存且当前节点完成', 'a-special-complete')
  const completed = await page.evaluate(() => (window as any).uni.getStorageSync('xlink.dev.mock.r1-special.020-021.v1'))
  await page.reload()
  await expect(page.getByTestId('a-special-complete')).toBeVisible()
  await expect(page.getByTestId('a-special-save')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).uni.getStorageSync('xlink.dev.mock.r1-special.020-021.v1'))).toEqual(completed)
})
test('local draft storage failure retains the editor and never claims record submission', async ({ page }) => {
  await open(page, 'forms')
  const snapshot = () => page.evaluate(() => (window as any).uni.getStorageSync('xlink.dev.mock.r1-special.020-021.v1'))
  const before = await snapshot()
  await page.evaluate(() => {
    const api = (window as any).uni, original = api.setStorage.bind(api)
    api.setStorage = (request: any) => request.key.startsWith('draft:') ? request.fail?.({ errMsg: 'synthetic local storage failure' }) : original(request)
  })
  await fill(page, '本机未安全保存的记录')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('本机保存失败')
  if (brand === 'yuhong') await expect(page.getByTestId('a-special-local-draft')).toHaveCSS('color', 'rgb(180, 35, 24)')
  await page.getByTestId('special-form-workspace-back').click()
  await expect(page.getByRole('alert')).toContainText('尚未安全保存')
  await expect(page).toHaveURL(/action-workspace/)
  await expect(page.getByTestId('a-special-field-inspectionSummary').locator('textarea')).toHaveValue('本机未安全保存的记录')
  expect(await snapshot()).toEqual(before)
  await shot(page, '辅助异常', '15-本机保存失败-保留原页面', 'a-special-local-draft')
})
