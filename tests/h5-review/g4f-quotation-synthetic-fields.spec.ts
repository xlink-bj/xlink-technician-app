import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-synthetic-dynamic-form')

function isLocalReviewRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.port === '5175'
  } catch {
    return false
  }
}

async function installSafetyGuards(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (!isLocalReviewRequest(request.url())) externalRequests.push(request.url())
  })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!isLocalReviewRequest(url)) {
      externalRequests.push(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return { pageErrors, consoleErrors, externalRequests }
}

async function openDynamicFields(page: Page, expectEditable = true, expandPanel = true): Promise<void> {
  await page.goto('/?scenario=dynamic-fields', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('quotation-first-repair-part-step')).toBeVisible()
  await expect(page.getByTestId('synthetic-panel-toggle')).toBeVisible()
  if (expandPanel) {
    await page.getByTestId('synthetic-panel-toggle').click()
    await expect(page.getByTestId('synthetic-extfield-review-panel')).toBeVisible()
    if (expectEditable) await expect(page.getByTestId('synthetic-editable-fields')).toBeVisible()
  }
}

async function completeQuotationGroupContext(page: Page): Promise<void> {
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('合成屋面维修描述')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
}

async function expectNoBusinessCommands(page: Page): Promise<void> {
  const counters = await page.evaluate(() => (window as unknown as {
    __G4F_REVIEW_ORDER_MUTATIONS__?: {
      dispatches: number
      workflowStarts: number
      reviewBlockedCommandCalls: number
    }
  }).__G4F_REVIEW_ORDER_MUTATIONS__)
  expect(counters).toEqual({ dispatches: 0, workflowStarts: 0, reviewBlockedCommandCalls: 0 })
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await expect(page.getByTestId('quotation-order-confirmation')).toHaveCount(0)
}

async function expectSafe(page: Page, diagnostics: Awaited<ReturnType<typeof installSafetyGuards>>): Promise<void> {
  expect(diagnostics.pageErrors, 'pageerror output').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect(diagnostics.externalRequests, 'unexpected non-local network requests').toEqual([])
}

async function captureSyntheticViewport(page: Page, filename: string): Promise<void> {
  await page.getByTestId('synthetic-extfield-review-panel').evaluate((element) => {
    element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
  })
  await page.screenshot({ path: resolve(output, filename), animations: 'disabled' })
}

async function captureFocusViewport(page: Page, testId: string, filename: string): Promise<void> {
  await page.getByTestId(testId).evaluate((element) => {
    element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
  })
  await page.screenshot({ path: resolve(output, filename), animations: 'disabled' })
}

test('synthetic ExtField UX runs the real quotation workbench, validates both phases and restores its isolated draft', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openDynamicFields(page, false, false)
  await expect(page.getByTestId('synthetic-extfield-review-panel')).toHaveCount(0)
  await expect(page.getByTestId('quotation-first-step-product-action')).toBeVisible()
  await captureFocusViewport(page, 'quotation-first-step-product-action', '00-workbench-primary-actions.png')
  await page.getByTestId('synthetic-panel-toggle').click()
  await expect(page.getByTestId('synthetic-editable-fields')).toBeVisible()

  await expect(page.getByTestId('g4f-review-title')).toContainText('报价工作区')
  await expect(page.getByTestId('quotation-repair-group-quotation-group-synthetic-dynamic-fields')).toBeVisible()
  await expect(page.getByTestId('synthetic-field-demo-conditional-required-row')).toBeVisible()
  await expect(page.getByTestId('synthetic-phase-diagnostics')).toHaveCount(0)
  await page.getByTestId('synthetic-diagnostics-toggle').click()
  await expect(page.getByTestId('synthetic-final-row-demo-waived-required-row')).toContainText('最终提交可选')
  await expect(page.getByTestId('synthetic-unsupported-demo-area-blocked-row')).toContainText('暂不支持安全编辑')
  await expect(page.getByTestId('synthetic-unsupported-demo-button-blocked-row')).toBeVisible()
  await expect(page.getByTestId('synthetic-unsupported-demo-provider-select-blocked-row')).toBeVisible()
  await expect(page.getByTestId('synthetic-unsupported-demo-provider-cascade-blocked-row')).toBeVisible()
  await expect(page.getByTestId('synthetic-submit-final-row-demo-media-blocked-row')).toContainText('规则或控件待核验')
  await expect(page.getByTestId('synthetic-unsupported-demo-media-blocked-row')).toBeVisible()
  await expect(page.getByTestId('synthetic-input-demo-area-blocked-row')).toHaveCount(0)
  await expect(page.getByTestId('synthetic-input-demo-provider-select-blocked-row')).toHaveCount(0)
  await expect(page.getByTestId('quotation-synthetic-submit-disabled')).toBeVisible()
  await expectNoBusinessCommands(page)
  await page.getByTestId('synthetic-diagnostics-toggle').click()

  await captureSyntheticViewport(page, '01-synthetic-fields-and-phase-rules.png')

  await completeQuotationGroupContext(page)
  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('synthetic-entry-validation-error')).toContainText('专项说明内容')
  await captureSyntheticViewport(page, '02-entry-required-validation.png')

  await page.getByTestId('synthetic-input-demo-conditional-required-row').locator('textarea').fill('合成必填说明')
  await page.getByTestId('synthetic-input-demo-shared-visible-yes-row').locator('input').fill('共享 valueKey 的合成值')
  await page.getByTestId('synthetic-input-demo-mode-row').locator('input').fill('否')
  await expect(page.getByTestId('synthetic-field-demo-conditional-required-row')).toHaveCount(0)
  await expect(page.getByTestId('synthetic-input-demo-shared-visible-no-row').locator('input')).toHaveValue('共享 valueKey 的合成值')
  await page.getByTestId('synthetic-diagnostics-toggle').click()
  await expect(page.getByTestId('synthetic-final-row-demo-conditional-required-row')).toContainText('已填写')
  await page.getByTestId('synthetic-diagnostics-toggle').click()
  await page.getByTestId('synthetic-input-demo-mode-row').locator('input').fill('是')
  await expect(page.getByTestId('synthetic-field-demo-conditional-required-row')).toBeVisible()
  await expect(page.getByTestId('synthetic-input-demo-conditional-required-row').locator('textarea')).toHaveValue('合成必填说明')

  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('synthetic-entry-validation-error')).toContainText('目录进入必填示例')
  await page.getByTestId('synthetic-diagnostics-toggle').click()
  await expect(page.getByTestId('synthetic-final-row-demo-waived-required-row')).toContainText('最终提交可选')
  await page.getByTestId('synthetic-diagnostics-toggle').click()
  await page.getByTestId('synthetic-input-demo-waived-required-row').locator('textarea').fill('目录进入必填；最终提交满足豁免条件')
  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expectNoBusinessCommands(page)

  await page.getByTestId('quotation-catalog-close').click()
  await expect(page.getByTestId('quotation-first-repair-part-step')).toBeVisible()
  await expect(page.getByTestId('synthetic-input-demo-conditional-required-row').locator('textarea')).toHaveValue('合成必填说明')
  await expect(page.getByTestId('synthetic-input-demo-waived-required-row').locator('textarea')).toHaveValue('目录进入必填；最终提交满足豁免条件')
  await expect(page.getByTestId('synthetic-draft-saved')).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('synthetic-panel-toggle').click()
  await expect(page.getByTestId('synthetic-extfield-review-panel')).toBeVisible()
  await expect(page.getByTestId('synthetic-input-demo-mode-row').locator('input')).toHaveValue('是')
  await expect(page.getByTestId('synthetic-input-demo-conditional-required-row').locator('textarea')).toHaveValue('合成必填说明')
  await expect(page.getByTestId('synthetic-input-demo-waived-required-row').locator('textarea')).toHaveValue('目录进入必填；最终提交满足豁免条件')
  await expect(page.getByTestId('synthetic-draft-saved')).toBeVisible()
  await expectNoBusinessCommands(page)
  await captureSyntheticViewport(page, '03-restored-synthetic-draft.png')
  await expectSafe(page, diagnostics)
})

test('fast synthetic panel unmount and re-entry restores the draft without waiting for the saved indicator', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openDynamicFields(page)
  const editedValue = '快速离开并返回保留的合成值'
  await page.getByTestId('synthetic-input-demo-shared-visible-yes-row').locator('input').fill(editedValue)
  await expect(page.getByTestId('synthetic-draft-saved')).toHaveCount(0)

  await page.getByTestId('g4f-review-fast-reentry').click()
  await expect(page.getByTestId('synthetic-extfield-review-panel')).toBeVisible()
  await expect(page.getByTestId('synthetic-input-demo-shared-visible-yes-row').locator('input')).toHaveValue(editedValue)
  await expectNoBusinessCommands(page)
  await expectSafe(page, diagnostics)
})

test('corrupt synthetic localStorage remains untouched and locks the isolated editor', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const storageKey = [
    'g4f-synthetic-review:v1:g4f-synthetic-order-extfield:v1',
    'g4f-mock-review-user',
    'mock-work-order-018-quotation-foundation',
    'mock-workflow-node-018-place-order',
    'place_order',
    'dynamic-fields',
    'order-extfield-fixture-v1',
  ].join(':')
  await page.evaluate((key) => window.localStorage.setItem(key, 'not-json-corrupt-review-record'), storageKey)
  await openDynamicFields(page, false)
  await expect(page.getByTestId('synthetic-draft-corrupt')).toBeVisible()
  await expect(page.getByTestId('synthetic-input-demo-mode-row')).toHaveCount(0)
  await expectNoBusinessCommands(page)
  expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe('not-json-corrupt-review-record')
  await expectSafe(page, diagnostics)
})
