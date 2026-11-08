import { expect, test } from '@playwright/test'
import type { mountInputDeliveryHarness } from './fixtures/input-delivery-harness'
type HarnessWindow = Window & { inputHarness: ReturnType<typeof mountInputDeliveryHarness> }

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
    const input = document.querySelector('[data-testid="dynamic-field-squareMeter"] input') as HTMLInputElement
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

for (const type of ['text', 'number', 'digit'] as const) {
  test(`actual H5 AppInput ${type}: native normalization, composition and stale-event boundaries`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174' ? route.continue() : route.abort())
    await page.goto('/#/pages/index/index?devReview=1')
    await page.evaluate(async kind => {
      const modulePath = '/tests/h5-main-mock/fixtures/input-delivery-harness.ts'
      const fixture = await import(modulePath)
      ;(window as unknown as HarnessWindow).inputHarness = fixture.mountInputDeliveryHarness(kind, kind === 'text' ? 140 : 4)
    }, type)
    const snapshot = await page.evaluate(kind => {
      const h = (window as unknown as HarnessWindow).inputHarness
      const field = document.querySelector('#input-delivery-component input') as HTMLInputElement
      const input = (value: string) => { field.value = value; field.dispatchEvent(new InputEvent('input', { bubbles: true })) }
      field.focus(); input(kind === 'text' ? '1' : '12.3'); input(kind === 'text' ? '0001234567890123456789' : '12.3456')
      return { actual: h.value(), visible: field.value }
    }, type)
    expect(snapshot.actual).toBe(snapshot.visible)
    expect(snapshot.actual).toBe(type === 'text' ? '0001234567890123456789' : '12.3')
    if (type === 'text') {
      const ime = await page.evaluate(() => {
        const h = (window as unknown as HarnessWindow).inputHarness
        const field = document.querySelector('#input-delivery-component input') as HTMLInputElement
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
      await h.setModel(''); (document.querySelector('#input-delivery-component input') as HTMLInputElement).blur()
      return h.value()
    })
    expect(externalReset).toBe('')
    for (const locked of ['disabled', 'readOnly'] as const) {
      const value = await page.evaluate(async kind => {
        const h = (window as unknown as HarnessWindow).inputHarness
        await h.lock(kind)
        const field = document.querySelector('#input-delivery-component input') as HTMLInputElement
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

test('Apple native target replacement and external reset keep model and DOM in sync', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:5174' ? route.continue() : route.abort())
  await page.goto('/#/pages/index/index?devReview=1')
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'vendor', { configurable: true, value: 'Apple Computer, Inc.' })
    const modulePath = '/tests/h5-main-mock/fixtures/input-delivery-harness.ts'
    const fixture = await import(modulePath)
    const h = fixture.mountInputDeliveryHarness('text')
    await Promise.resolve(); await Promise.resolve()
    const field = () => document.querySelector('#input-delivery-component input') as HTMLInputElement
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
  })
  expect(result.appleBranch).toBe(true)
  expect(result.hasNativeStateSetter).toBe(true)
  expect(result.reset).toEqual({ model: '', dom: '', added: 0, focused: true })
  expect(result.replacements).toEqual(Array(2).fill({ replaced: true, model: '42.75', dom: '42.75' }))
})
