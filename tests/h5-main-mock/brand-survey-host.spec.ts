import { test, expect, type Page } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { normalWorkspaceFixture } from '../support/normal-workspace-fixture'
import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const phase = process.env.XLINK_SURVEY_HOST_PHASE === 'before' ? 'before' : 'after'
async function enter(page: Page) {
  await page.goto('/#/pages/index/index')
  await page.locator('.launch-cta').click()
  await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await page.locator('.work-order-card').click()
  await enterNormalFormWorkspace(page)
}
const notice = (page: Page) => page.getByTestId('r1-normal-form-read-message')
const neutralColor = brand === 'yuhong' ? 'rgb(85, 94, 100)' : 'rgb(104, 120, 143)'
const errorColor = brand === 'yuhong' ? 'rgb(180, 35, 24)' : neutralColor
const successColor = brand === 'yuhong' ? 'rgb(40, 101, 73)' : neutralColor
const read = (page: Page) => page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' })
async function shot(page: Page, width: number, state: string) {
  const panel = page.getByTestId('r1-normal-form-read')
  expect(await panel.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `.review/brand-survey-host/${brand}/${phase}/${width}/${state}.png`, animations: 'disabled', caret: 'hide' })
}
for (const width of [430, 375]) {
  test(`${brand} survey host real navigation create, saved read, failure and explicit recovery at ${width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: width === 430 ? 932 : 667 })
    const f = await normalWorkspaceFixture(page, baseURL!)
    Object.assign(f.workOrder, { name: '王女士', orderNum: '26019', address: '示例路 18 号 · 现场服务中心 2 栋 1203 室' })
    f.node.nodeDef.name = '现场勘查'
    const specs = [
      { name: 'area', type: 'digit', nameDisp: '测量面积（㎡）', required: '1' },
      { name: 'length', type: 'number', nameDisp: '测量长度（m）', required: '0' },
      { name: 'note', type: 'textarea', nameDisp: '现场说明', required: '0' },
    ]
    f.fields.forEach((field, i) => { Object.assign(field, specs[i], { multiple: false, frontEndConfig: '{}' }); delete field.valueOption })
    await enter(page); await shot(page, width, '01-unread')
    await read(page).click()
    const input = (key: string) => page.getByTestId(`r1-normal-input-${key}`).locator('input,textarea')
    await expect(input('area')).toBeVisible()
    await expect(notice(page)).toContainText('0 条记录')
    await expect(notice(page)).toHaveCSS('color', neutralColor)
    await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'true')
    await shot(page, width, '02-empty-create')
    await input('area').fill('18.75'); await input('length').fill('3')
    await input('note').fill('已核对屋面接缝及墙角渗漏位置，测量结果与现场一致。')
    await input('note').blur()
    await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'false')
    await expect(page.getByTestId('r1-normal-draft-status').locator('.form-read__hint')).toHaveCSS('color', neutralColor)
    await shot(page, width, '03-filled-create')
    const save = page.getByTestId('r1-normal-save')
    await save.scrollIntoViewIfNeeded()
    const saveBox = await save.boundingBox()
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(width === 430 ? 932 : 667)
    await shot(page, width, '03b-save-action')
    await page.getByTestId('r1-normal-save').click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('当前节点尚未完成')
    await expect(page.getByTestId('r1-normal-value-area')).toHaveText('18.75')
    await expect(page.getByTestId('r1-normal-create')).toHaveCount(0)
    await expect(notice(page)).toHaveCSS('color', successColor)
    if (brand === 'yuhong') {
      await expect(page.locator('.app-task-heading__status').first()).toHaveCSS('color', neutralColor)
      await expect(page.getByTestId('r1-normal-value-area')).toHaveCSS('color', 'rgb(25, 27, 30)')
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    if (phase === 'after' && brand === 'yuhong') {
      await expect(page.getByTestId('r1-normal-value-area')).toHaveCSS('font-size', '16px')
      await expect(page.getByTestId('r1-normal-value-area')).toHaveCSS('color', 'rgb(25, 27, 30)')
      await expect(page.locator('.form-read__group').first()).toHaveCSS('border-radius', '8px')
    }
    await shot(page, width, '04-saved-readonly')
    await read(page).click()
    await expect(notice(page)).toContainText('1 条记录')
    await expect(notice(page)).toHaveCSS('color', neutralColor)
    await shot(page, width, '04a-reread-neutral')
    await page.getByTestId('r1-normal-edit-saved').click()
    await expect(input('area')).toHaveValue('18.75')
    await input('note').fill('复核墙角渗漏位置，暂未提交修改。'); await input('note').blur()
    await page.getByTestId('r1-normal-create').scrollIntoViewIfNeeded()
    await shot(page, width, '04b-existing-edit')
    await page.getByTestId('r1-normal-edit-cancel').click()
    await expect(page.getByTestId('r1-normal-create')).toHaveCount(0)
    f.state.failRead = true; await read(page).click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('无法完整核实')
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0)
    await expect(notice(page)).toHaveCSS('color', errorColor)
    await expect(read(page)).toHaveAttribute('aria-disabled', 'false')
    await shot(page, width, '05-read-failed')
    f.state.failRead = false
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0)
    await read(page).click(); await expect(page.getByTestId('r1-normal-value-area')).toHaveText('18.75')
    await expect(notice(page)).toHaveCSS('color', neutralColor)
    await shot(page, width, '06-recovered')
    expect(f.state.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(f.state.payloads[0]).toMatchObject({ area: 18.75, length: 3 })
    expect(f.state.unexpected).toEqual([]); expect(f.state.errors).toEqual([])
    await info.attach('scope', { body: JSON.stringify({ navigation: 'login/home/list/detail/task/workspace', transport: 'intercepted local synthetic R1-shaped Mock', realBackend: false, realUpload: false, signing: false, calls: f.state.calls, writes: f.state.writes }), contentType: 'application/json' })
  })
}

// A failed/unknown command must never acquire a saved-success presentation.
test(`${brand} uncertain save keeps text, prevents replay and never reports success`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const f = await normalWorkspaceFixture(page, baseURL!)
  // Keep this failure scenario on the same supported scalar create contract.
  f.fields.forEach(field => { Object.assign(field, { type: 'text', preset: 0, multiple: false, frontEndConfig: '{}' }); delete field.valueOption })
  let attempts = 0
  await page.route('**/xlink/wm/biz/extForm/upsert/e', route => { attempts++; return route.abort('failed') })
  await enter(page); await read(page).click()
  await page.getByTestId('r1-normal-input-memo').locator('input,textarea').fill('等待核对保存结果，勿重复提交。')
  await page.getByTestId('r1-normal-save').click()
  await expect(notice(page)).toContainText('保存未完成或结果尚未核实，请勿重复提交。')
  await expect(notice(page)).toHaveCSS('color', errorColor)
  await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-draft-status').locator('.form-read__hint')).toHaveCSS('color', neutralColor)
  await shot(page, 430, '07-save-uncertain')
  await read(page).click()
  await expect(notice(page)).toContainText('0 条记录')
  await expect(notice(page)).toHaveCSS('color', neutralColor)
  await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
  expect(attempts).toBe(1)
  expect(f.state.writes).toEqual([])
  expect(f.state.unexpected).toEqual([]); expect(f.state.errors).toEqual([])
})
