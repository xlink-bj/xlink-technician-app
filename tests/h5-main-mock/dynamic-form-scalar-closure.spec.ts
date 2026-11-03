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

    // Use the ACTUAL uni-app H5 picker action sheet. The uni-picker
    // component owns the internal wheel and emits its change after "Done";
    // synthetic DOM CustomEvents do not exercise that runtime protocol.
    const finishPicker = async (root: ReturnType<typeof page.locator>) => {
      await root.click()
      // uni-picker's H5 action sheet is teleported outside the field root.
      // Select the currently visible confirmation control, not a hidden
      // sibling picker. A short timeout makes selector regressions explicit.
      const confirm = page.getByText('Done', { exact: true }).filter({ visible: true }).last()
      await expect(confirm).toBeVisible({ timeout: 5_000 })
      await confirm.click()
    }
    await finishPicker(picker('qa-date-row'))
    await finishPicker(picker('qa-time-row'))
    const dateTimeControls = picker('qa-datetime-row').locator('.app-date-time-field__picker')
    await finishPicker(dateTimeControls.nth(0))
    await finishPicker(dateTimeControls.nth(1))

    const selectedDate = (await picker('qa-date-row')
      .locator('.app-date-time-field__value').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
    const selectedTime = (await picker('qa-time-row')
      .locator('.app-date-time-field__value').innerText()).match(/\d{2}:\d{2}/)?.[0]
    const selectedDateTime = (await picker('qa-datetime-row')
      .locator('.app-date-time-field__value').first().innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
    expect(selectedDate, 'native date picker commits a valid date').toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(selectedTime, 'native time picker commits a valid time').toMatch(/^\d{2}:\d{2}$/)
    expect(selectedDateTime, 'datetime commits only after both native pickers finish')
      .toMatch(/^\d{4}-\d{2}-\d{2}$/)

    await field('qaCount').locator('input').fill('12')
    await field('qaMeasure').locator('input').fill('12.50')
    await field('qaPhone').locator('input').fill('0013800100200')
    await page.getByTestId('dynamic-form-save').click()
    // Always report the real Workspace validation/command error on failure.
    // A generic "button still says 保存表单" timeout hides the failing
    // FormDef field and can lead to incorrectly weakening Runtime guards.
    await expect.poll(async () => {
      const label = await page.getByTestId('dynamic-form-save').innerText()
      if (label.includes('已保存')) return '已保存'
      const feedback = await page.getByTestId('action-workspace-feedback').allInnerTexts()
      if (feedback.length) return '保存失败: ' + feedback.join(' | ')
      return label
    }, { timeout: 8_000 }).toBe('已保存')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
    await expect(field('qaConfirmed').locator('.app-choice').filter({ hasText: '是' }))
      .toHaveClass(/app-choice--selected/)
    await expect(field('qaScore').locator('.app-rating-field__star').nth(3))
      .toHaveAttribute('aria-pressed', 'true')
    await expect(picker('qa-date-row')).toContainText(selectedDate!)
    await expect(picker('qa-time-row')).toContainText(selectedTime!)
    await expect(picker('qa-datetime-row')).toContainText(selectedDateTime!)
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
