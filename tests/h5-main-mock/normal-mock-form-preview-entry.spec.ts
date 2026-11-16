import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

async function localOnly(page: Page) {
  const unexpected: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === 'http://localhost:5174' && request.method() === 'GET') return route.continue()
    unexpected.push(request.method() + ' ' + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === 'localhost:5174') socket.connectToServer()
    else { unexpected.push('websocket'); socket.close() }
  })
  return () => { expect(unexpected).toEqual([]); expect(errors).toEqual([]) }
}
async function capture(page: Page, name: string) {
  const dir = process.env.XLINK_FORM_ENTRY_SCREENSHOTS
  if (!dir || page.viewportSize()?.width !== 430) return
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, name + '.png'), animations: 'disabled', caret: 'hide',
    style: '[data-testid="mock-journey-progress"]{visibility:hidden !important}' })
}
async function openListed(page: Page, orderNum: string, customer: string) {
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum, customer })).click()
  await expect(page.locator('.summary-number')).toContainText(orderNum)
}

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`normal 26019 detail opens existing local appointment preview; time actions fit first viewport / ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const assertLocal = await localOnly(page)
    // Enter through the ordinary List/Detail, with no QA console or forced click.
    await openListed(page, '26019', '蒋女士')
    const action = page.getByTestId('task-focus-action')
    await expect(action).toHaveAttribute('aria-disabled', 'false')
    await capture(page, '详情-26019-预约节点')
    await action.click()
    await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
    await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('aria-disabled', 'true')
    await page.locator('.action-content-field--note textarea').fill('预约后上门检查屋面渗漏')
    await page.locator('.action-content-field--choice').getByText('需要上门', { exact: true }).click()
    await page.locator('.appointment-time-selector').click()
    const submit = page.locator('.time-selection-submit')
    await expect(page.locator('.time-selection-title')).toHaveText('选择上门时间')
    // Check before any scrollIntoView or click can repair the initial viewport.
    await expect(submit).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    const rect = await submit.boundingBox()
    expect(rect!.y).toBeGreaterThanOrEqual(44)
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height + 0.1)
    await capture(page, '02c-预约-选择日期与时段')
    await page.locator('.date-shortcut').first().click()
    await page.locator('.time-slot').first().click()
    await expect(submit).toBeInViewport({ ratio: 1 })
    await capture(page, '02d-预约-已选时间')
    await capture(page, '02d2-预约-选时按钮首屏')
    await submit.click()
    await expect(page.locator('.confirmation-card-title').first()).toHaveText('预约信息')
    // Read/local draft availability does not upgrade the R1 Workflow command.
    await expect(page.locator('.confirmation-action').filter({ hasText: '确认预约' }))
      .toHaveAttribute('aria-disabled', 'true')
    await capture(page, '02e-预约-确认信息')
    await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
    await expect(page.locator('.action-content-field--note textarea')).toHaveValue('预约后上门检查屋面渗漏')
    await expect(page.getByTestId('mock-journey-progress')).toHaveCount(0)
    await expect(page.getByTestId('appointment-draft-note')).toContainText('尚未确认预约')
    await expect(page.getByTestId('appointment-gate-reason')).toContainText('填写预览，预约确认尚未开放')
    await page.reload()
    await expect(page.locator('.action-content-field--note textarea')).toHaveValue('预约后上门检查屋面渗漏')
    await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('aria-disabled', 'true')
    assertLocal()
  })
}

test('ordinary forms without a configured read host and foreign-role nodes remain closed', async ({ page }) => {
  const assertLocal = await localOnly(page)
  await openListed(page, '09077', '张先生')
  await expect(page.getByTestId('task-focus-action')).toHaveAttribute('aria-disabled', 'true')
  await openListed(page, '16204', '王女士')
  await expect(page.getByTestId('task-focus-action')).toHaveCount(0)
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-017-survey-success')
  await page.reload()
  await expect(page.locator('.summary-number')).toContainText('19017')
  await expect(page.getByTestId('task-focus-action')).toHaveAttribute('aria-disabled', 'true')
  await capture(page, '详情-19017-现场勘察节点')
  // Its source forms contract must not fall through to the ordinary one-record encoder.
  await page.goto('/#/pages/work-orders/action-workspace?id=mock-work-order-017-survey-success&node=mock-workflow-node-017-inspection&action=interact_with_form')
  await expect(page.getByText('当前操作暂不可用', { exact: true })).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  assertLocal()
})
