import { expect, test } from '@playwright/test'

/**
 * Real main-App Dynamic Form action, entirely synthetic and offline.
 * The task presentation preset may be reused by other business forms:
 * controls must dispatch from verified field type/options, never purpose/key.
 */
test('Field registry: 430×932 task cascade and cross-group choices preserve R1 semantics', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const externalRequests: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    externalRequests.push(route.request().method() + ' ' + url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await page.locator('.action-content-field--note textarea').fill('模拟现场勘查：验证共享动态字段，不进行真实操作')
  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await page.getByTestId('mock-journey-advance').click()
  await expect(page.locator('.current-task-card')).toContainText('现场勘察')
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
  await expect(page.getByTestId('survey-part-picker-trigger')).toBeVisible()

  await page.getByTestId('survey-part-picker-trigger').click()
  await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()
  await expect(page.getByTestId('survey-part-picker-panel')).toHaveCount(0)
  await expect(page.getByTestId('survey-part-picker-trigger')).toContainText('屋面')

  const trigger = page.getByTestId('survey-leakage-cause-trigger')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const panel = page.getByTestId('survey-leakage-cause-panel')
  await expect(panel).toBeVisible()
  const groups = panel.locator('.survey-leakage-cause__group')
  await expect.poll(() => groups.count()).toBeGreaterThan(1)
  // R1 uses selected part only to prioritise the *initial* group. Other
  // provider groups remain selectable and are never silently filtered out.
  await groups.nth(1).click()
  const choice = page.getByTestId('survey-leakage-cause-option').first()
  await expect(choice).toBeVisible()
  await choice.click()
  await expect(page.getByTestId('survey-leakage-cause-selected')).toContainText('已选 1 项')
  await panel.locator('.survey-leakage-cause__done').click()
  await expect(panel).toHaveCount(0)
  await expect(trigger).toContainText('已选择 1 项')

  // Reopening and cancelling must preserve the confirmed FormData-local IDs.
  await trigger.click()
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('survey-leakage-cause-selected')).toContainText('已选 1 项')
  await panel.locator('.survey-leakage-cause__close').click()
  await expect(panel).toHaveCount(0)
  await expect(trigger).toContainText('已选择 1 项')
  expect(externalRequests, 'no production API/upload or external asset may be called').toEqual([])
  expect(errors, 'the shared controls should not produce runtime errors').toEqual([])
})
