import { expect, test } from '@playwright/test'
import type { mountInputDeliveryHarness } from './fixtures/input-delivery-harness'
type HarnessWindow = Window & { inputHarness: ReturnType<typeof mountInputDeliveryHarness> }

test('rapid multiline note is saved before the appointment action unmounts its editor', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.locator('.action-content-field--note textarea')).toBeVisible()
  const gap = await page.evaluate(async () => {
    const field = document.querySelector('.action-content-field--note textarea') as HTMLTextAreaElement
    field.focus(); field.value = '先检查屋面'
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: field.value }))
    const first = performance.now()
    await new Promise(resolve => setTimeout(resolve, 22))
    field.value = '先检查屋面\n再确认墙根渗水处'
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: field.value }))
    const second = performance.now()
    ;(document.querySelector('[data-testid="mock-journey-advance"]') as HTMLElement).click()
    return second - first
  })
  expect(gap).toBeLessThan(100)
  await expect(page).toHaveURL(/work-orders\/detail/)
  const saved = await page.evaluate(() => {
    const runtime = (window as unknown as { uni: { getStorageSync(key: string): string } }).uni
    return JSON.parse(runtime.getStorageSync('xlink.dev.mock.journey.019.form-data.v1.appointment'))
  })
  expect(saved.exts.note).toBe('先检查屋面\n再确认墙根渗水处')
  expect(external).toEqual([])
})

test('rapid scalar input is saved before the normal action unmounts its editor', async ({ page }) => {
  page.setDefaultTimeout(15_000)
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.context().route('**/*', async route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); await route.abort()
  })
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await page.locator('.action-content-field--note textarea').fill('输入交付回归')
  await page.getByTestId('mock-journey-advance').click()
  await page.locator('.primary-task-action').click()
  await page.getByTestId('survey-part-picker-trigger').click()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()
  await expect(page.getByTestId('dynamic-field-squareMeter')).toBeVisible()
  // Native browser events only: do not set any Vue store, draft or mock ACK.
  // Keep the second input and normal action in the same browser task so the
  // result cannot accidentally pass merely because automation waits >100ms.
  const gap = await page.evaluate(async () => {
    const input = document.querySelector('[data-testid="dynamic-field-squareMeter"] input') as HTMLInputElement | HTMLTextAreaElement
    input.focus(); input.value = '19.25'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '19.25' }))
    const first = performance.now()
    await new Promise(resolve => setTimeout(resolve, 22))
    input.value = '27.75'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '27.75' }))
    const second = performance.now()
    ;(document.querySelector('[data-testid="mock-journey-advance"]') as HTMLElement).click()
    return second - first
  })
  expect(gap).toBeLessThan(100)
  await expect(page).toHaveURL(/work-orders\/detail/)
  const saved = await page.evaluate(() => {
    const runtime = (window as unknown as { uni: { getStorageSync(key: string): string } }).uni
    return JSON.parse(runtime.getStorageSync('xlink.dev.mock.journey.019.form-data.v1.survey'))
  })
  expect(saved.exts.squareMeter).toBe(27.75)
  expect(external).toEqual([])
})

for (const type of ['text', 'number', 'digit', 'textarea'] as const) {
  test(`actual H5 text control ${type}: native normalization, composition and stale-event boundaries`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174' ? route.continue() : route.abort())
    await page.goto('/#/pages/index/index?devReview=1')
    await page.evaluate(async kind => {
      const modulePath = '/tests/h5-main-mock/fixtures/input-delivery-harness.ts'
      const fixture = await import(modulePath)
      ;(window as unknown as HarnessWindow).inputHarness = fixture.mountInputDeliveryHarness(kind, kind === 'text' || kind === 'textarea' ? 140 : 4)
    }, type)
    const snapshot = await page.evaluate(kind => {
      const h = (window as unknown as HarnessWindow).inputHarness
      const field = document.querySelector('#input-delivery-component input, #input-delivery-component textarea') as HTMLInputElement | HTMLTextAreaElement
      const input = (value: string) => { field.value = value; field.dispatchEvent(new InputEvent('input', { bubbles: true })) }
      field.focus(); input((kind === 'text' || kind === 'textarea') ? '1' : '12.3'); input((kind === 'text' || kind === 'textarea') ? '0001234567890123456789' : '12.3456')
      return { actual: h.value(), visible: field.value }
    }, type)
    expect(snapshot.actual).toBe(snapshot.visible)
    expect(snapshot.actual).toBe((type === 'text' || type === 'textarea') ? '0001234567890123456789' : '12.3')
    if (type === 'text' || type === 'textarea') {
      const ime = await page.evaluate(() => {
        const h = (window as unknown as HarnessWindow).inputHarness
        const field = document.querySelector('#input-delivery-component input, #input-delivery-component textarea') as HTMLInputElement | HTMLTextAreaElement
        field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        field.value = 'zhong'; field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
        const preedit = h.value(), count = h.events().length
        field.value = '中文'; field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
        field.dispatchEvent(new InputEvent('input', { bubbles: true }))
        return { preedit, value: h.value(), added: h.events().length - count }
      })
      expect(ime).toEqual({ preedit: snapshot.actual, value: '中文', added: 1 })
    }
    const externalReset = await page.evaluate(async () => {
      const h = (window as unknown as HarnessWindow).inputHarness
      await h.setModel(''); (document.querySelector('#input-delivery-component input, #input-delivery-component textarea') as HTMLInputElement).blur()
      return h.value()
    })
    expect(externalReset).toBe('')
    for (const locked of ['disabled', 'readOnly'] as const) {
      const value = await page.evaluate(async kind => {
        const h = (window as unknown as HarnessWindow).inputHarness
        await h.lock(kind)
        const field = document.querySelector('#input-delivery-component input, #input-delivery-component textarea') as HTMLInputElement | HTMLTextAreaElement
        field.value = '999'; field.dispatchEvent(new InputEvent('input', { bubbles: true }))
        return h.value()
      }, locked)
      expect(value).toBe('')
    }
    const count = await page.evaluate(() => { const h = (window as unknown as HarnessWindow).inputHarness; h.unmount(); return h.events().length })
    await page.waitForTimeout(150) // Deliberately check the old 100ms uni channel AFTER unmount.
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.events().length)).toBe(count)
  })
}

for (const kind of ['text', 'textarea'] as const) test(`Apple ${kind} target replacement and external reset keep model and DOM in sync`, async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174' ? route.continue() : route.abort())
  await page.goto('/#/pages/index/index?devReview=1')
  const result = await page.evaluate(async type => {
    Object.defineProperty(navigator, 'vendor', { configurable: true, value: 'Apple Computer, Inc.' })
    const modulePath = '/tests/h5-main-mock/fixtures/input-delivery-harness.ts'
    const fixture = await import(modulePath)
    const h = fixture.mountInputDeliveryHarness(type)
    await Promise.resolve(); await Promise.resolve()
    const field = () => document.querySelector('#input-delivery-component input, #input-delivery-component textarea') as HTMLInputElement | HTMLTextAreaElement
    const input = (value: string) => { field().value = value; field().dispatchEvent(new InputEvent('input', { bubbles: true })) }
    field().focus()
    input('19.25'); await new Promise(resolve => setTimeout(resolve, 22)); input('27.75')
    const countBeforeReset = h.events().length
    await h.setModel('')
    await new Promise(resolve => setTimeout(resolve, 150))
    const reset = { model: h.value(), dom: field().value, added: h.events().length - countBeforeReset, focused: document.activeElement === field() }
    const replacements = []
    for (const kind of ['disabled', 'readOnly'] as const) {
      const original = field()
      await h.lock(kind); await h.unlock()
      input('31.5'); input('42.75')
      replacements.push({ replaced: original !== field(), model: h.value(), dom: field().value })
    }
    const hasNativeStateSetter = h.hasNativeStateSetter()
    h.unmount()
    return { reset, replacements, hasNativeStateSetter, appleBranch: CSS.supports('image-orientation:from-image') }
  }, kind)
  expect(result.appleBranch).toBe(true)
  expect(result.hasNativeStateSetter).toBe(true)
  expect(result.reset).toEqual({ model: '', dom: '', added: 0, focused: true })
  expect(result.replacements).toEqual(Array(2).fill({ replaced: true, model: '42.75', dom: '42.75' }))
})

test('textarea keeps native maxlength, external line endings, auto-height and final clear', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174' ? route.continue() : route.abort())
  await page.goto('/#/pages/index/index?devReview=1')
  await page.evaluate(async () => {
    const modulePath = '/tests/h5-main-mock/fixtures/input-delivery-harness.ts'
    const fixture = await import(modulePath)
    ;(window as unknown as HarnessWindow).inputHarness = fixture.mountInputDeliveryHarness('textarea', 4)
  })
  const field = page.locator('#input-delivery-component textarea')
  await field.pressSequentially('abcdef') // Browser keyboard, not a forged over-limit value.
  await expect(field).toHaveValue('abcd')
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.value())).toBe('abcd')
  await page.evaluate(async () => {
    ;(window as unknown as HarnessWindow).inputHarness.unmount()
    const modulePath = '/tests/h5-main-mock/fixtures/input-delivery-harness.ts'
    const fixture = await import(modulePath)
    ;(window as unknown as HarnessWindow).inputHarness = fixture.mountInputDeliveryHarness('textarea')
  })
  await field.fill('首行')
  const height = await field.evaluate(el => el.getBoundingClientRect().height)
  const lines = '首行\r\n\r\n三\r\n四\r\n五\r\n六\r\n末行\r\n'
  const count = await page.evaluate(async value => {
    const h = (window as unknown as HarnessWindow).inputHarness
    const native = document.querySelector('#input-delivery-component textarea') as HTMLTextAreaElement
    native.value = '暂存首行'; native.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 22))
    native.value = '暂存首行\n暂存末行'; native.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await h.setModel(value)
    return h.events().length
  }, lines)
  await page.waitForTimeout(150) // A pending uni tail must not undo the external value.
  await expect(field).toHaveValue(lines.replace(/\r\n/g, '\n'))
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.value())).toBe(lines)
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.events().length)).toBe(count)
  await expect.poll(() => field.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(height)
  await field.fill('首行\n\n末行\n')
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.value())).toBe('首行\n\n末行\n')
  await field.fill('')
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.value())).toBe('')
  await page.evaluate(() => (window as unknown as HarnessWindow).inputHarness.unmount())
})

import type { mountGenericNumericWorkspace } from './fixtures/generic-numeric-workspace-harness'
type GenericHarnessWindow = Window & { genericNumeric: Awaited<ReturnType<typeof mountGenericNumericWorkspace>> }
for (const type of ['number', 'digit'] as const) test(`actual Generic page numeric ${type}: partial input never saves or completes old values`, async ({ page }) => {
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.evaluate(async kind => {
    const modulePath = '/tests/h5-main-mock/fixtures/generic-numeric-workspace-harness.ts'
    const fixture = await import(modulePath)
    ;(window as unknown as GenericHarnessWindow).genericNumeric = await fixture.mountGenericNumericWorkspace(kind)
  }, type)
  const root = page.locator('#generic-numeric-workspace'), field = root.getByTestId('dynamic-field-amount').getByRole('spinbutton')
  const save = root.getByTestId('dynamic-form-save'), complete = root.getByTestId('action-workspace-submit')
  const ledger = () => page.evaluate(() => (window as unknown as GenericHarnessWindow).genericNumeric.ledger())
  await expect(field).toHaveValue('12'); await save.click()
  await expect(complete).toHaveAttribute('aria-disabled', 'false')
  const initial = await ledger(); expect(initial).toEqual([{ kind: 'save', values: { amount: 12 } }])
  // Browser-valid syntax can still be refused by R1 numeric normalization.
  // Restore the accepted model instead of displaying a rejected new literal.
  await field.fill(type === 'number' ? '1.5' : '1e2')
  await expect(field).toHaveValue('12'); expect(await ledger()).toEqual(initial)
  // Replace a previously saved valid value in one native editing operation:
  // badInput must not leave the old saved model eligible for completion.
  await field.press('ControlOrMeta+A'); await field.press('-')
  expect(await field.evaluate(input => (input as HTMLInputElement).validity.badInput)).toBe(true)
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await expect(complete).toHaveAttribute('aria-disabled', 'true')
  await save.click({ force: true }); await complete.click({ force: true }); expect(await ledger()).toEqual(initial)
  await field.fill('14'); await expect(save).toHaveAttribute('aria-disabled', 'false'); await save.click()
  await expect(complete).toHaveAttribute('aria-disabled', 'false')
  const second = await ledger()
  // Also exercise a deliberate clear followed by '-', keeping empty distinct.
  await field.fill(''); await field.press('-')
  expect(await field.evaluate(input => (input as HTMLInputElement).validity.badInput)).toBe(true)
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await save.click({ force: true }); await complete.click({ force: true }); expect(await ledger()).toEqual(second)
  await field.fill('15'); await expect(save).toHaveAttribute('aria-disabled', 'false'); await save.click()
  await expect(complete).toHaveAttribute('aria-disabled', 'false'); await complete.click()
  const confirm = root.getByTestId('survey-complete-confirm-action')
  await expect(confirm).toHaveAttribute('aria-disabled', 'false')
  const beforeConfirmationInput = await ledger()
  // A late native edit after opening confirmation must revoke the open action.
  await field.press('ControlOrMeta+A'); await field.press('-')
  expect(await field.evaluate(input => (input as HTMLInputElement).validity.badInput)).toBe(true)
  await expect(confirm).toHaveAttribute('aria-disabled', 'true')
  await confirm.click({ force: true }); expect(await ledger()).toEqual(beforeConfirmationInput)
  await root.getByTestId('survey-complete-cancel').click()
  await field.fill('16'); await expect(save).toHaveAttribute('aria-disabled', 'false'); await save.click()
  await expect(complete).toHaveAttribute('aria-disabled', 'false'); await complete.click(); await confirm.click()
  await expect.poll(ledger).toEqual([{ kind: 'save', values: { amount: 12 } }, { kind: 'save', values: { amount: 14 } }, { kind: 'save', values: { amount: 15 } }, { kind: 'save', values: { amount: 16 } }, { kind: 'complete' }])
  expect(external).toEqual([]); expect(errors).toEqual([])
  await page.evaluate(() => (window as unknown as GenericHarnessWindow).genericNumeric.unmount())
})
