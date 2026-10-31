import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * M3-P1: one Owner viewport, actual uni-app main shell, entirely local R1-shaped
 * Mock. The 019 local quote must NEVER be presented as a formal Order; the
 * independent 04009 formal-Order fixture is verified under its own identity.
 */
test('430×932 Appointment → Survey → Quotation, then scoped Order/C01 read-only', async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  const evidenceDir = resolve('.review/m3-p1')
  await mkdir(evidenceDir, { recursive: true })
  const captureCommercialScreen = async (name: string) => {
    // DEV QA is a launch mechanism, never part of the commercial screen.
    await expect(page.getByTestId('qa-console')).toHaveCount(0)
    await expect(page.getByTestId('mock-commerce-handoff')).toHaveCount(0)
    const screenshot = await page.screenshot({ animations: 'disabled', caret: 'hide' })
    await writeFile(resolve(evidenceDir, `${name}-430x932.png`), screenshot)
    await info.attach(name, { body: screenshot, contentType: 'image/png' })
  }

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
  await page.locator('.action-content-field--note textarea').fill('平屋顶渗漏勘察，需核查排水口和防水层交接处')
  await page.locator('.action-content-field--choice').getByText('需要上门', { exact: true }).click()
  await page.locator('.appointment-time-selector').click()
  await expect(page.locator('.time-selection-title')).toContainText('选择上门时间')
  await page.locator('.date-shortcut').first().click()
  await page.locator('.time-slot').first().click()
  await page.locator('.time-selection-submit').click()
  await expect(page.locator('.action-workspace-footer')).toBeInViewport({ ratio: 1 })
  await expect(page.locator('.confirmation-card-title').first()).toContainText('预约信息')
  await expect(page.getByText('预约时间', { exact: true })).toBeVisible()
  await expect(page.locator('.action-workspace-footer')).toBeInViewport({ ratio: 1 })
  await captureCommercialScreen('01a-appointment-confirmation')
  // Do NOT trigger the real appointment-completion command; this is a
  // credential-free Mock acceptance of the form and confirmation UX only.
  // uni-app renders the label inside a custom <uni-button>; click the actual
  // touch target, not the nested text node which the parent intercepts.
  await page.locator('.confirmation-action').filter({ hasText: '返回修改' }).click()
  await expect(page.locator('.appointment-time-selected')).toBeVisible()
  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await captureCommercialScreen('01-appointment')
  await page.getByTestId('mock-journey-advance').click()

  await expect(page.locator('.summary-number')).toContainText('#26019')
  await expect(page.locator('.current-task-card')).toContainText('现场勘察')
  await captureCommercialScreen('02-work-order-survey')
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('平屋顶渗漏勘察')
  await page.getByTestId('survey-part-picker-trigger').click()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()
  await expect(page.getByTestId('dynamic-media-add-images1')).toBeVisible()
  await expect(page.getByTestId('dynamic-media-add-images2')).toBeVisible()
  await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('18.5')
  await captureCommercialScreen('03-survey')
  await page.getByTestId('mock-journey-advance').click()

  await expect(page.locator('.current-task-card')).toContainText('报价')
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await expect(page.getByTestId('quotation-hub-signing-mock-official-order-001')).toHaveCount(0)
  await page.getByTestId('quotation-hub-create-unverified').click()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await page.getByTestId('mock-journey-context-toggle').click()
  await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('平屋顶渗漏勘察')
  await expect(page.getByTestId('mock-journey-context-survey')).toContainText('18.5')
  await page.getByTestId('mock-journey-context-toggle').click()
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('平屋面泛水节点维修')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('18.5')
  await page.getByTestId('quotation-first-step-select-products').click()
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0').click()
  await page.getByTestId('quotation-package-material-choice-number:2-0').click()
  await page.getByTestId('quotation-package-configure-commit').click()
  const firstGroup = page.getByTestId('quotation-repair-group-quotation-group-1')
  await expect(firstGroup).toContainText('平屋面泛水节点维修')
  await expect(firstGroup).toContainText('平屋面节点防水维修套餐')
  // Persist is debounced: never simulate a hard reload while the page still
  // explicitly reports that local changes have not finished saving.
  await expect(page.getByTestId('quotation-commercial-draft-badge')).toContainText('草稿已保存')
  await captureCommercialScreen('04-quotation')
  await page.reload({ waitUntil: 'domcontentloaded' })
  // A fresh reload intentionally returns to the scoped Order hub: it must
  // explain that the persisted local draft is NOT a formal Order, then offer
  // an explicit resume affordance before restoring editing state.
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await expect(page.getByTestId('quotation-hub-local-draft')).toContainText('非正式订单')
  await page.getByTestId('quotation-hub-create-unverified').click()
  // The confirmed saved draft must reopen at the persisted detail stage.
  await expect(page.getByTestId('quotation-first-step-next')).toHaveCount(0)
  await expect(firstGroup).toContainText('平屋面节点防水维修套餐')
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)

  // A local draft cannot be forged into a signed/official Order.
  await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=mock-work-order-019-continuous-journey&orderId=forged-order', {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByTestId('signing-order-read-blocked')).toBeVisible()
  await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
  await captureCommercialScreen('05-forged-order-blocked')

  // A separate source-backed synthetic Order belongs to WorkOrder 04009.
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.locator('.work-orders-entry').click()
  await page.locator('.search-input input').fill('04009')
  await page.locator('.search-button').click()
  await page.locator('.work-order-card').filter({ hasText: '陈女士' }).click()
  await expect(page.locator('.summary-number')).toContainText('04009')
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('quotation-hub-order-mock-official-order-001')).toBeVisible()
  await page.getByTestId('quotation-hub-signing-mock-official-order-001').click()
  await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
  await expect(page.getByTestId('signing-order-read-display-number')).toContainText('BJ202610260001')
  await page.getByTestId('signing-contract-read-request').click()
  await expect(page.getByTestId('signing-contract-matched')).toContainText('HT202610260001')
  await expect(page.getByTestId('signing-order-read-no-write')).toContainText('全程只读')
  await page.getByTestId('signing-read-operations-toggle').click()
  await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('signing-order-read-contract-disabled')).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('signing-read-operations-toggle').click()
  await captureCommercialScreen('06-signing-readonly')

  expect(external, 'zero external requests').toEqual([])
  expect(errors, 'zero console or browser errors').toEqual([])
})
