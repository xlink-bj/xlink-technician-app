import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
import { expect, test } from '@playwright/test'

/** Isolated Stage 2B FormDef variant. Both fixture flags must be explicit.
 * The normal 020/021 commercial Mock screen remains unchanged. */
test.describe('Stage 2B R1 primitive FormDef types on real H5 App', () => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true'
    || process.env.VITE_XLINK_R1_STAGE2B_FIELDS !== 'true',
  'Both 020/021 and the Stage 2B field variant must be enabled.')

  test('430×932: primitive input, typed readback, edit and reload with zero external traffic', async ({ page }, info) => {
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
    await (await searchMockWorkOrder(page, '020')).click(); await enterDevMockDynamicFormWorkspace(page)
    await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
    const field = (key: string) => page.getByTestId(`a-special-field-${key}`)
    await field('inspectionSummary').locator('textarea').fill('Stage2B 现场类型验证')
    await field('inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
    await field('inspectionContactPhone').locator('input').fill('0013800100200')
    await field('inspectionIdentityNumber').locator('input').fill('000100200300400500')
    const count = field('inspectionPointCount').locator('input')
    const area = field('inspectionMeasuredArea').locator('input')
    await count.fill('9007199254740993')
    await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'true')
    await count.fill('12')
    await expect(area).toHaveAttribute('type', 'number')
    // Native numeric inputs expose an unfinished '-' as value='' + badInput;
    // Playwright fill('-') cannot represent that real keyboard intermediate.
    await area.press('-')
    const partial = await area.evaluate(input => ({ value: (input as HTMLInputElement).value,
      badInput: (input as HTMLInputElement).validity.badInput }))
    await info.attach('native-numeric-intermediate', { body: JSON.stringify(partial), contentType: 'application/json' })
    expect(partial).toEqual({ value: '', badInput: true })
    await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'true')
    await area.press('1')
    await expect(area).toHaveValue('-1')
    await area.fill('12.50')
    await field('inspectionConfirmed').locator('.app-choice').filter({ hasText: '否' }).click()
    await field('inspectionCategory').locator('.app-choice').filter({ hasText: '屋面' }).click()
    await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'false')
    await page.getByTestId('a-special-save').click()

    const row = page.getByTestId('a-special-row-mock-special-form-data-forms-1')
    await expect(row).toContainText('Stage2B 现场类型验证')
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(field('inspectionContactPhone').locator('input')).toHaveValue('0013800100200')
    await expect(field('inspectionIdentityNumber').locator('input')).toHaveValue('000100200300400500')
    await expect(count).toHaveValue('12')
    await expect(area).toHaveValue('12.5')
    await expect(field('inspectionConfirmed').locator('.app-choice').filter({ hasText: '否' }))
      .toHaveClass(/app-choice--selected/)
    await count.fill('14')
    await area.fill('14.25')
    await field('inspectionConfirmed').locator('.app-choice').filter({ hasText: '是' }).click()
    await field('inspectionCategory').locator('.app-choice').filter({ hasText: '外墙' }).click()
    await page.getByTestId('a-special-save').click()
    // This case checks a completed save surviving reload. A click only starts
    // the async transaction; reloading before its cleanup finishes correctly
    // leaves the durable uncertain fence and cannot permit another edit.
    await expect(count).toHaveValue('')
    await expect(page.getByTestId('a-special-save')).toHaveText('保存记录')
    await expect(page.getByTestId('a-special-local-submission-pending')).toHaveCount(0)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(row).toContainText('Stage2B 现场类型验证')
    await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
    await expect(count).toHaveValue('14')
    await expect(area).toHaveValue('14.25')
    await expect(field('inspectionConfirmed').locator('.app-choice').filter({ hasText: '是' }))
      .toHaveClass(/app-choice--selected/)
    await expect(field('inspectionCategory').locator('.app-choice').filter({ hasText: '外墙' }))
      .toHaveClass(/app-choice--selected/)
    await info.attach('stage2b-synthetic-form-430', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    expect(external).toEqual([])
    expect(errors).toEqual([])
  })
})
