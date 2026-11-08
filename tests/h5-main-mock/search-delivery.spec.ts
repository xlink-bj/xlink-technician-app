import { expect, test, type Page } from '@playwright/test'

async function openWorkOrders(page: Page) {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.context().route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.card-customer').filter({ hasText: '李先生' })).toBeVisible()
  return external
}

for (const action of ['button', 'enter'] as const) {
  test(`rapid search ${action} queries the last input, not the 100ms old draft`, async ({ page }, info) => {
    const external = await openWorkOrders(page)
    // The last input and normal search activation share one browser task.
    // Only native events: no Vue instance, store, draft or mocked response writes.
    const gap = await page.evaluate(async mode => {
      const field = document.querySelector('[data-testid="app-search-bar"] input') as HTMLInputElement
      const input = (value: string) => {
        field.value = value
        field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
      }
      field.focus(); input('李先生')
      const first = performance.now()
      await new Promise(resolve => setTimeout(resolve, 22))
      input('张先生')
      const second = performance.now()
      if (mode === 'button') (document.querySelector('.search-button') as HTMLElement).click()
      else field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      return second - first
    }, action)
    expect(gap).toBeLessThan(100)
    await expect(page.locator('.card-customer')).toHaveText(['张先生'])
    await expect(page.locator('[data-testid="app-search-bar"] input')).toHaveValue('张先生')
    await info.attach(`search-${action}-430`, { body: await page.screenshot(), contentType: 'image/png' })
    expect(external).toEqual([])
  })
}

// Search remains caller-owned: input alone never queries, and the list owns trim/reset.
test('committed IME, rapid empty search and external clear survive the uni trailing event', async ({ page }) => {
  const external = await openWorkOrders(page)
  const customers = page.locator('.card-customer')
  const initialCount = await customers.count()
  const field = page.locator('[data-testid="app-search-bar"] input')
  await field.evaluate(node => {
    const input = node as HTMLInputElement
    input.focus()
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = 'zhang'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
  })
  await expect(customers).toHaveCount(initialCount)
  await field.evaluate(node => {
    const input = node as HTMLInputElement
    input.value = '张先生'
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '张先生' }))
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
  })
  await expect(customers).toHaveText(['张先生'])
  const gap = await field.evaluate(async node => {
    const input = node as HTMLInputElement
    input.value = '李先生'; input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const first = performance.now()
    await new Promise(resolve => setTimeout(resolve, 22))
    input.value = ''; input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const second = performance.now()
    ;(document.querySelector('.search-button') as HTMLElement).click()
    return second - first
  })
  expect(gap).toBeLessThan(100)
  await expect(customers).toHaveCount(initialCount)
  await expect(field).toHaveValue('')
  await field.fill('no-synthetic-customer')
  await page.locator('.search-button').click()
  await expect(page.getByText('没有找到匹配工单', { exact: true })).toBeVisible()
  // This normal clear action resets the parent model while old uni events remain queued.
  const resetGap = await field.evaluate(async node => {
    const input = node as HTMLInputElement
    input.value = '李先生'; input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const first = performance.now()
    await new Promise(resolve => setTimeout(resolve, 22))
    input.value = '张先生'; input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const second = performance.now()
    const clear = Array.from(document.querySelectorAll('uni-button, button')).find(button => button.textContent?.trim() === '清除搜索') as HTMLElement
    if (!clear) throw new Error('Expected the normal clear-search action')
    clear.click()
    return second - first
  })
  expect(resetGap).toBeLessThan(100)
  await expect(customers).toHaveCount(initialCount)
  await page.waitForTimeout(150) // Observe the old timer AFTER the action, never before it.
  await expect(field).toHaveValue('')
  await field.fill('  张先生  ')
  await field.press('Enter')
  await expect(customers).toHaveText(['张先生'])
  await expect(field).toHaveValue('张先生')
  expect(external).toEqual([])
})

test('Apple disabled-target replacement preserves repeated rapid searches', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'vendor', { configurable: true, value: 'Apple Computer, Inc.' }))
  const external = await openWorkOrders(page)
  const replacements: boolean[] = []
  for (const value of ['张先生', '李先生', '王女士']) {
    const result = await page.evaluate(async term => {
      const field = document.querySelector('[data-testid="app-search-bar"] input') as HTMLInputElement
      const windowRef = window as unknown as { previousSearchField?: HTMLInputElement }
      const replaced = windowRef.previousSearchField !== undefined && field !== windowRef.previousSearchField
      windowRef.previousSearchField = field
      field.focus(); field.value = 'unknown'; field.dispatchEvent(new InputEvent('input', { bubbles: true }))
      const first = performance.now()
      await new Promise(resolve => setTimeout(resolve, 22))
      field.value = term; field.dispatchEvent(new InputEvent('input', { bubbles: true }))
      const second = performance.now()
      ;(document.querySelector('.search-button') as HTMLElement).click()
      return { replaced, gap: second - first }
    }, value)
    expect(result.gap).toBeLessThan(100)
    replacements.push(result.replaced)
    await expect(page.locator('.card-customer')).toHaveText([value])
    await expect(page.locator('[data-testid="app-search-bar"] input')).toHaveValue(value)
  }
  expect(replacements).toEqual([false, true, true])
  expect(external).toEqual([])
})

for (const apple of [false, true]) {
  test(`IME preedit Enter keeps focus and does not query before commit${apple ? ' after Apple target replacement' : ''}`, async ({ page }) => {
    if (apple) await page.addInitScript(() => Object.defineProperty(navigator, 'vendor', { configurable: true, value: 'Apple Computer, Inc.' }))
    const external = await openWorkOrders(page)
    const customers = page.locator('.card-customer')
    const field = page.locator('[data-testid="app-search-bar"] input')
    // A later search disables/re-enables the input. On Apple this replaces its
    // native target, so subsequent iterations must use a newly attached guard.
    for (const [value, compositionStart, isComposing] of [
      ['张先生', true, true], ['王女士', true, false], ['张先生', false, true],
    ] as const) {
      const before = await customers.allTextContents()
      await field.fill('李先生')
      await page.waitForTimeout(150) // Settle the earlier draft only, without searching.
      const focus = await field.evaluate((node, flags) => {
        const input = node as HTMLInputElement
        input.focus()
        if (flags.compositionStart) input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        input.value = 'preedit'
        input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, isComposing: flags.isComposing }))
        return document.activeElement === input
      }, { compositionStart, isComposing })
      expect(focus).toBe(true)
      await page.waitForTimeout(900) // Observe delayed queries/tails AFTER Enter, not before it.
      await expect(customers).toHaveText(before)
      await expect(field).toBeFocused()
      await expect(field).toHaveValue('preedit')
      await field.evaluate((node, term) => {
        const input = node as HTMLInputElement
        input.value = term
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: term }))
        input.dispatchEvent(new InputEvent('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
      }, value)
      await expect(customers).toHaveText([value])
      await expect(field).toHaveValue(value)
    }
    expect(external).toEqual([])
  })
}
