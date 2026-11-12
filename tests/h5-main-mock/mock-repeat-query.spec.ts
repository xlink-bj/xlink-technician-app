import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
import { expect, test } from '@playwright/test'

test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true'
  || process.env.VITE_XLINK_R1_STAGE2B_FIELDS !== 'true',
  'Requires the explicit MOCK-021 and Stage2B synthetic fixture configuration')

test('normal App repeat list → exact record read → synthetic save → refresh → remove', async ({ page, baseURL }, info) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    external.push(route.request().method() + ' ' + url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, '021')).click(); await enterDevMockDynamicFormWorkspace(page)
  await expect(page.getByTestId('a-special-row-mock-form-data-021-existing-a')).toContainText('第一次复检')
  await expect(page.getByTestId('a-special-row-mock-form-data-021-existing-b')).toContainText('第二次复检')
  // Historical seed rows lack authoritative edit ownership; retain readonly.
  await expect(page.getByTestId('a-special-edit-mock-form-data-021-existing-a')).toHaveCount(0)
  const summary = page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
  await summary.fill('本轮合成记录，验证查询与刷新')
  await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
  await page.getByTestId('a-special-save').click()
  const savedId = 'mock-special-form-data-repeat-1'
  await expect(page.getByTestId(`a-special-row-${savedId}`)).toContainText('本轮合成记录')
  await page.reload()
  await page.getByTestId(`a-special-edit-${savedId}`).click()
  await expect(summary).toHaveValue('本轮合成记录，验证查询与刷新')
  await page.locator('.special-forms__cancel-button .app-button').click()
  await page.getByTestId(`a-special-delete-${savedId}`).click()
  await page.getByTestId(`a-special-confirm-delete-${savedId}`).click()
  await expect(page.getByTestId(`a-special-row-${savedId}`)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId(`a-special-row-${savedId}`)).toHaveCount(0)
  await expect(page.getByTestId('a-special-row-mock-form-data-021-existing-a')).toContainText('第一次复检')
  expect(external).toEqual([])
  expect(errors).toEqual([])
  await info.attach('request-and-error-counts', { body: JSON.stringify({ externalRequests: external.length,
    pageErrors: errors.length, scope: 'normal App + in-memory synthetic Mock; no real backend' }), contentType: 'application/json' })
})


test('normal App repeat 21-row boundary saves, reloads and explicitly finishes the complete set', async ({ page, baseURL }, info) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    external.push(route.request().method() + ' ' + url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, '021')).click(); await enterDevMockDynamicFormWorkspace(page)
  for (let n = 1; n <= 19; n++) {
    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill(`完整分页记录${n}`)
    await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
    await page.getByTestId('a-special-save').click()
    await expect(page.getByTestId(`a-special-row-mock-special-form-data-repeat-${n}`)).toContainText(`完整分页记录${n}`)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
  }
  await expect(page.locator('[data-testid^="a-special-row-"]')).toHaveCount(21)
  await page.reload()
  await expect(page.locator('[data-testid^="a-special-row-"]')).toHaveCount(21)
  await expect(page.getByTestId('a-special-task-state')).toContainText('正在填写')
  await page.getByTestId('a-special-finish-request').click()
  await page.getByTestId('a-special-finish-confirm').click()
  // The accepted detail page unmounts its editor on verified completion.
  await expect(page.getByTestId('a-special-complete')).toBeVisible()
  await expect(page.getByTestId('a-stage-special-panel')).toHaveCount(0)
  await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
  await page.reload()
  // The accepted detail page unmounts its editor on verified completion.
  await expect(page.getByTestId('a-special-complete')).toBeVisible()
  await expect(page.getByTestId('a-stage-special-panel')).toHaveCount(0)
  expect(external).toEqual([]); expect(errors).toEqual([])
  await info.attach('complete-set-evidence', { body: JSON.stringify({ records: 21, ownRecords: 19,
    externalRequests: 0, pageErrors: 0, scope: 'synthetic Mock only; no real Process request' }), contentType: 'application/json' })
})
