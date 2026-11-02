import { expect, test } from '@playwright/test'

/** Full H5 app composition on synthetic 020, no real backend requests. */
test.describe('Stage 2A source-driven FormDef multi-field round-trip', () => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true', 'Synthetic 020 fixture required')

  test('430×932: required radio, optional note, read-only image, save/edit/reload', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
    })
    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await page.getByTestId('app-search-bar').locator('input').fill('MOCK-020')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '韩先生' }).click()

    const panel = page.getByTestId('a-stage-special-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('a-special-reference-inspectionPhoto')).toContainText('只读')
    const summary = page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
    const result = page.getByTestId('a-special-field-inspectionResult')
    const note = page.getByTestId('a-special-field-inspectionNote').locator('textarea')
    await summary.fill('Stage2A 现场多字段记录')
    await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('a-special-form-validation')).toContainText('勘察结论')
    await result.locator('.app-choice').filter({ hasText: '需要跟进' }).click()
    await note.fill('材料验收待确认')
    await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'false')
    await page.getByTestId('a-special-save').click()
    const row = page.getByTestId('a-special-row-mock-special-form-data-forms-1')
    await expect(row).toContainText('Stage2A 现场多字段记录')

    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(summary).toHaveValue('Stage2A 现场多字段记录')
    await expect(result.locator('.app-choice').filter({ hasText: '需要跟进' })).toHaveClass(/app-choice--selected/)
    await expect(note).toHaveValue('材料验收待确认')
    await summary.fill('Stage2A 复核后的现场内容')
    await result.locator('.app-choice').filter({ hasText: '可继续施工' }).click()
    await page.getByTestId('a-special-save').click()
    await expect(row).toContainText('Stage2A 复核后的现场内容')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(row).toContainText('Stage2A 复核后的现场内容')
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(result.locator('.app-choice').filter({ hasText: '可继续施工' })).toHaveClass(/app-choice--selected/)
    await expect(note).toHaveValue('材料验收待确认')
    expect(external).toEqual([])
    expect(errors).toEqual([])
  })
})
