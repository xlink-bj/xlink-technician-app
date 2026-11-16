import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id


for (const [width, height] of [[430, 932], [375, 667], [390, 844]]) test(`appointment recovery and gates ${brand} ${width}x${height}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height })
  const directory = `.review/雨虹UIUX优化-20261116/B/after/${brand}/${width}x${height}`
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
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
      expect(box.y).toBeGreaterThan(height / 2)
      await expect(footer).toHaveClass(/app-action-bar/)
      await expect(footer.locator('.app-action-bar')).toHaveCount(0)
      if (brand === 'yuhong') {
        await expect(footer).toHaveCSS('padding-top', '12px')
        await expect(footer).toHaveCSS('padding-bottom', '12px')
      }
    }
    await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await shot('00-首页')
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.work-order-card').first()).toBeVisible()
  await shot('00b-列表')
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
  await expect(page.locator('.date-shortcut--selected .uni-icons')).toHaveCount(1)
  await expect(page.locator('.date-shortcut--selected')).toHaveAttribute('aria-pressed', 'true')
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
  await expect(page.getByTestId('appointment-gate-reason')).toHaveText('当前为填写预览，预约确认尚未开放。')
  await shot('05-预约确认-返回可修改')
  await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
  await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
  await page.reload()
  await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
  await expect(page.getByTestId('appointment-draft-note')).toContainText('请核对预约日期和时间')
  await expect(page.getByTestId('mock-journey-advance')).toHaveCount(0)
  await expect(page.getByTestId('appointment-gate-reason')).toBeVisible()
  await shot('06-预约草稿-刷新恢复')
  await note.scrollIntoViewIfNeeded()
  const fieldBox = (await note.boundingBox())!, footerBox = (await page.locator('.action-workspace-footer').boundingBox())!
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(footerBox.y + 1)
  await shot('06b-末字段可达')
  // Replay a local historical date through the real Store, with no command dispatch.
  await page.evaluate(async () => {
    const modulePath = '/src/features/work-orders/action-workspace.ts'
    const { useActionWorkspaceStore } = await import(modulePath)
    const store = useActionWorkspaceStore()
    store.setAppointmentTime('2026-11-15 11:00')
    await store.flushDraft()
  })
  await page.reload()
  await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
  await expect(page.locator('.appointment-time-selected-date')).toContainText('11月15日')
  await expect(page.locator('.appointment-time-selected-value')).toHaveText('11:00')
  await expect(page.getByTestId('appointment-draft-note')).toContainText('请核对预约日期和时间')
  await shot('06c-旧日期原值恢复')
  await page.locator('.action-content-field--choice').getByText('暂不上门', { exact: true }).click()
  await expect(page.locator('.appointment-time-selector')).toHaveCount(0)
  await shot('07-预约填写-暂不上门')
  for (const [route, name] of [['action-time', '08-选时异常-缺少工单上下文'], ['action-confirmation', '09-确认异常-返回保留草稿']]) {
    await page.goto('/#/pages/work-orders/' + route)
    await expect(page.locator('.workspace-state-title')).toContainText('暂不可用')
    await shot(name)
    await page.goBack()
    await expect(note).toHaveValue('已与客户沟通，请到达前联系。')
    await expect(page.locator('.action-content-field--choice')).toBeVisible()
  }
  expect(external).toEqual([]); expect(errors).toEqual([])
})

test('home account confirmation, list contact isolation and independent DEV entry', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method()); return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.work-orders-entry')).toHaveCount(1)
  await expect(page.locator('.section-link')).toHaveCount(0)
  await page.locator('.home-footer .secondary').click()
  await expect(page.locator('.uni-modal')).toBeVisible()
  await page.locator('.uni-modal__btn').filter({ hasText: '取消' }).click()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.card-phone-button').first()).toBeVisible()
  // Intercept only the platform dial boundary: the actual page and Store still run.
  await page.evaluate(() => { (window as any).__dialCount = 0; (window as any).uni.makePhoneCall = (options: any) => {
    (window as any).__dialCount++; options.success?.({ errMsg: 'makePhoneCall:ok' }); options.complete?.({ errMsg: 'makePhoneCall:ok' })
  } })
  const phone = page.locator('.card-phone-button').first()
  await expect(phone).toContainText('联系')
  const box = (await phone.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
  await phone.click()
  await expect(page).toHaveURL(/work-orders\/work-orders/)
  await expect.poll(() => page.evaluate(() => (window as any).__dialCount)).toBe(1)
  await page.locator('.work-order-card').first().click()
  await expect(page).toHaveURL(/work-orders\/detail/)
  await page.goto('/#/pages/dev/qa-console')
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.getByTestId('mock-journey-progress')).toBeVisible()
  await expect(page.getByTestId('mock-journey-progress')).toContainText('独立测试旅程')
  await page.goto('/#/pages/index/index')
  await page.locator('.home-footer .secondary').click()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.login-page')).toBeVisible()
  expect(external).toEqual([])
})
