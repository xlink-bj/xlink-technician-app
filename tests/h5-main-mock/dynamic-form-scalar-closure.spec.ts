import { expect, test } from '@playwright/test'

/**
 * The REAL main App + GenericDynamicFormActionContent; not a component
 * screenshot harness. Only an explicit isolated DEV flag replaces the
 * historical 61-row Survey FormDef with synthetic source-shaped scalar rows.
 *
 * These events drive the same H5 picker change handlers as a user selection;
 * browser-native picker chrome is device-specific and remains a separate
 * WeChat/MP native gate. Save/readback runs through the normal Action
 * Workspace, Mock Adapter and FormData lifecycle, never external APIs.
 */
test.describe('Dynamic scalar QA: real H5 FormDef → FormData → readback', () => {
  test.skip(process.env.VITE_XLINK_DYNAMIC_SCALAR_QA !== 'true',
    'Only run with the dedicated, opt-in synthetic FormDef.')

  test('430×932: dependent switch, rating, native picker events, save and reload', async ({ page }, info) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
    })

    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.getByTestId('mock-continuous-journey-entry').click()
    await page.locator('.action-content-field--note textarea').fill('合成预约，验证通用表单控件')
    await page.getByTestId('mock-journey-advance').click()
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
    const field = (key: string) => page.getByTestId(`dynamic-field-${key}`)
    const picker = (fieldId: string) => page.getByTestId(`dynamic-date-time-${fieldId}`)

    // The optional dependent is not editable until the controlling switch
    // satisfies R1 showField/showValue; never inject it by field name.
    await expect(field('qaDependent')).toHaveCount(0)
    await field('qaConfirmed').locator('.app-choice').filter({ hasText: '是' }).click()
    await expect(field('qaDependent')).toBeVisible()
    await field('qaDependent').locator('input').fill('屋顶已复核')
    await field('qaScore').locator('.app-rating-field__star').nth(3).click()
    await expect(field('qaScore').locator('.app-rating-field__star').nth(3))
      .toHaveAttribute('aria-pressed', 'true')

    // Dispatch a verified native picker change at the actual compiled H5
    // picker root. The Form Runtime, not the test, determines value validity.
    const selectPickerValue = async (testId: string, value: string, child?: number) => {
      await page.evaluate(({ testId, value, child }) => {
        const root = document.querySelector(`[data-testid="${testId}"]`)
        const target = child === undefined ? root : root?.querySelectorAll('uni-picker')[child]
        if (!target) throw new Error(`Picker is not rendered: ${testId}, child ${child}`)
        target.dispatchEvent(new CustomEvent('change', {
          bubbles: true, detail: { value },
        }))
      }, { testId, value, child })
    }
    await selectPickerValue('dynamic-date-time-qa-date-row', '2026-11-03')
    await selectPickerValue('dynamic-date-time-qa-time-row', '14:30')
    await selectPickerValue('dynamic-date-time-qa-datetime-row', '2026-11-04', 0)
    await selectPickerValue('dynamic-date-time-qa-datetime-row', '15:20', 1)
    await expect(picker('qa-datetime-row')).toContainText('2026-11-04')
    await expect(picker('qa-datetime-row')).toContainText('15:20')
    await expect(picker('qa-date-row')).toContainText('2026-11-03')
    await expect(picker('qa-time-row')).toContainText('14:30')

    // An impossible calendar date must fail at shared Runtime even when a
    // synthetic event bypasses the native picker widget's own date bounds.
    await selectPickerValue('dynamic-date-time-qa-date-row', '2026-02-30')
    await expect(picker('qa-date-row')).toContainText('2026-11-03')

    await field('qaCount').locator('input').fill('12')
    await field('qaMeasure').locator('input').fill('12.50')
    await field('qaPhone').locator('input').fill('0013800100200')
    await page.getByTestId('dynamic-form-save').click()
    await expect(page.getByTestId('dynamic-form-save')).toContainText('已保存')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
    await expect(field('qaConfirmed').locator('.app-choice').filter({ hasText: '是' }))
      .toHaveClass(/app-choice--selected/)
    await expect(field('qaScore').locator('.app-rating-field__star').nth(3))
      .toHaveAttribute('aria-pressed', 'true')
    await expect(picker('qa-date-row')).toContainText('2026-11-03')
    await expect(picker('qa-time-row')).toContainText('14:30')
    await expect(picker('qa-datetime-row')).toContainText('2026-11-04')
    await expect(field('qaCount').locator('input')).toHaveValue('12')
    await expect(field('qaMeasure').locator('input')).toHaveValue('12.5')
    await expect(field('qaPhone').locator('input')).toHaveValue('0013800100200')
    await expect(field('qaDependent').locator('input')).toHaveValue('屋顶已复核')
    await info.attach('dynamic-scalar-real-app-430', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    expect(external, 'no external requests, including Production API or uploads').toEqual([])
    expect(errors, 'main App must not emit browser runtime errors').toEqual([])
  })
})
