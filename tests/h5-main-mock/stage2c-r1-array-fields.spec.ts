import { expect, test } from '@playwright/test'

/** R1 legacy extForm checkbox[]/cascade[] on the real App, isolated from
 * ordinary commercial Mock and every Production business-write adapter. */
test.describe('Stage 2C source-backed array FormDef round-trip', () => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true'
    || process.env.VITE_XLINK_R1_STAGE2C_ARRAYS !== 'true',
  'The 020/021 and opt-in R1 array fixture are required.')

  test('430×932: checkbox and cascade save, edit, restart and readback', async ({ page }, info) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(route.request().method() + ' ' + url.origin + url.pathname)
      await route.abort('blockedbyclient')
    })
    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await page.locator('.work-orders-entry').click()
    await page.getByTestId('app-search-bar').locator('input').fill('MOCK-020')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '韩先生' }).click()
    await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
    const field = (key: string) => page.getByTestId('a-special-field-' + key)
    await field('inspectionSummary').locator('textarea').fill('Stage2C 数组字段验证')
    await field('inspectionNote').locator('textarea').fill('清空前备注')
    await field('inspectionResult').locator('.app-choice').filter({ hasText: '可继续施工' }).click()
    await field('inspectionChecks').locator('.app-choice').filter({ hasText: '排水口' }).click()
    await field('inspectionChecks').locator('.app-choice').filter({ hasText: '女儿墙' }).click()
    await field('inspectionLocation').locator('.app-cascade-selector__parent').filter({ hasText: '屋顶' }).click()
    await field('inspectionLocation').locator('.app-cascade-selector__child').filter({ hasText: '排水口' }).click()
    await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'false')
    await page.getByTestId('a-special-save').click()
    const row = page.getByTestId('a-special-row-mock-special-form-data-forms-1')
    await expect(row).toContainText('Stage2C 数组字段验证')
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(field('inspectionChecks').locator('.app-choice--selected')).toHaveCount(2)
    await expect(field('inspectionLocation').locator('.app-cascade-selector__child')
      .filter({ hasText: '排水口' })).toHaveAttribute('aria-pressed', 'true')
    await field('inspectionChecks').locator('.app-choice').filter({ hasText: '女儿墙' }).click()
    await field('inspectionLocation').locator('.app-cascade-selector__parent').filter({ hasText: '卫生间' }).click()
    await field('inspectionLocation').locator('.app-cascade-selector__child').filter({ hasText: '管道' }).click()
    await page.getByTestId('a-special-save').click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(row).toContainText('Stage2C 数组字段验证')
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(field('inspectionChecks').locator('.app-choice--selected')).toHaveCount(1)
    await expect(field('inspectionLocation').locator('.app-cascade-selector__child')
      .filter({ hasText: '管道' })).toHaveAttribute('aria-pressed', 'true')
    // Explicitly clear existing optional scalar/array values, then prove
    // absence survives a new page instance rather than only the draft UI.
    await field('inspectionNote').locator('textarea').fill('')
    await field('inspectionChecks').locator('.app-choice--selected').click()
    await page.getByTestId('a-special-save').click()
    await expect(row).toContainText('Stage2C 数组字段验证')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(field('inspectionNote').locator('textarea')).toHaveValue('')
    await expect(field('inspectionChecks').locator('.app-choice--selected')).toHaveCount(0)
    await expect(field('inspectionLocation').locator('.app-cascade-selector__child')
      .filter({ hasText: '管道' })).toHaveAttribute('aria-pressed', 'true')
    await page.locator('.special-forms__cancel-button .app-button').click()

    // The same commercial editor switches to another source FormDef; its
    // payload must neither inherit nor overwrite the first record's fields.
    await page.getByTestId('a-special-definition-choice').locator('.app-choice').filter({ hasText: '服务备注' }).click()
    await expect(field('inspectionSummary')).toHaveCount(0)
    await field('note').locator('textarea').fill('第二表单独立备注')
    await page.getByTestId('a-special-save').click()
    const second = page.getByTestId('a-special-row-mock-special-form-data-forms-2')
    await expect(second).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-2').click()
    await expect(field('note').locator('textarea')).toHaveValue('第二表单独立备注')
    await expect(field('inspectionSummary')).toHaveCount(0)
    await page.locator('.special-forms__cancel-button .app-button').click()
    await page.getByTestId('a-special-delete-mock-special-form-data-forms-2').click()
    await page.getByTestId('a-special-confirm-delete-mock-special-form-data-forms-2').click()
    await expect(second).toContainText('已删除')
    await expect(row).toContainText('Stage2C 数组字段验证')
    await info.attach('stage2c-arrays-430', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    expect(external).toEqual([])
    expect(errors).toEqual([])
  })
})
