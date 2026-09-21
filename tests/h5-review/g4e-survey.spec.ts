import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const reviewPath = '/__review/g4e-survey.html'
const screenshotDirectory = resolve(process.cwd(), '.review/g4e-product-gate/generated')

type VisualScenarioContract = {
  readonly scenario: string
  readonly focusTestId: string
  readonly screenshotName?: string
  readonly additionalScreenshots?: readonly { readonly focusTestId: string; readonly screenshotName: string }[]
  readonly preparation?: 'open-leakage-cause' | 'trigger-validation' | 'wait-saved'
}

/** One review-only contract drives scenario smoke coverage and focused capture. */
const visualScenarioContracts: readonly VisualScenarioContract[] = [
  { scenario: 'survey-overview', focusTestId: 'action-workspace-context', screenshotName: '01-overview.png' },
  { scenario: 'required-fields', focusTestId: 'dynamic-form-action-content' },
  {
    scenario: 'part-dependent-fields',
    focusTestId: 'survey-repair-part-selector',
    screenshotName: '02-repair-part.png',
    additionalScreenshots: [{ focusTestId: 'dynamic-form-presentation-gap2', screenshotName: '12-gap.png' }],
  },
  { scenario: 'leakage-cause', focusTestId: 'survey-leakage-cause-panel', screenshotName: '03-leakage-cause.png', preparation: 'open-leakage-cause' },
  { scenario: 'required-media-empty', focusTestId: 'dynamic-media-images1', screenshotName: '04-media-empty.png' },
  { scenario: 'media-local-pending', focusTestId: 'dynamic-media-images1', screenshotName: '05-media-pending.png' },
  { scenario: 'media-retryable-failure', focusTestId: 'dynamic-media-images1', screenshotName: '06-media-failure.png' },
  { scenario: 'media-ambiguous', focusTestId: 'dynamic-media-images1', screenshotName: '07-media-ambiguous.png' },
  { scenario: 'media-uploaded', focusTestId: 'dynamic-media-images1', screenshotName: '08-media-uploaded.png' },
  { scenario: 'validation-error', focusTestId: 'action-workspace-feedback', screenshotName: '09-validation.png', preparation: 'trigger-validation' },
  { scenario: 'saved-ready-to-complete', focusTestId: 'action-workspace-submit', screenshotName: '10-save-complete.png', preparation: 'wait-saved' },
  { scenario: 'deferred-fields-absent', focusTestId: 'dynamic-form-action-content', screenshotName: '11-deferred-absent.png' },
]

type BrowserEvidence = {
  readonly consoleErrors: string[]
  readonly pageErrors: string[]
  readonly unexpectedRequests: string[]
}

function allowedRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true
  if (url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ws:' || parsed.protocol === 'wss:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && (parsed.port === '' || parsed.port === '5173')
  } catch {
    return false
  }
}

function installBrowserSafetyGuards(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    consoleErrors: [],
    pageErrors: [],
    unexpectedRequests: [],
  }

  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => evidence.pageErrors.push(error.stack ?? error.message))
  page.on('request', (request) => {
    if (!allowedRequest(request.url())) evidence.unexpectedRequests.push(request.url())
  })
  void page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!allowedRequest(url)) {
      evidence.unexpectedRequests.push(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })

  return evidence
}

async function assertHealthy(page: Page, evidence: BrowserEvidence): Promise<void> {
  expect(evidence.pageErrors, 'pageerror output').toEqual([])
  expect(evidence.consoleErrors, 'console.error output').toEqual([])
  expect(evidence.unexpectedRequests, 'unexpected external requests').toEqual([])
  await expect(page.locator('body')).not.toContainText('G4-E H5 review harness is development-only')
}

async function openScenario(page: Page, scenario: string, evidence: BrowserEvidence): Promise<void> {
  await page.goto(`${reviewPath}?scenario=${scenario}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4e-review-harness')).toBeVisible()
  await expect(page.getByTestId('g4e-review-scenario')).toHaveValue(scenario)
  await expect(page.getByTestId('g4e-review-workspace')).toBeVisible()
  await assertHealthy(page, evidence)
}

test.beforeAll(async ({ browser }) => {
  console.log(`[g4e-review] Playwright browser: ${browser.browserType().name()} ${browser.version()}`)
  await mkdir(screenshotDirectory, { recursive: true })
})

async function prepareVisualScenario(page: Page, preparation: VisualScenarioContract['preparation']): Promise<void> {
  if (preparation === 'open-leakage-cause') {
    await page.getByRole('button', { name: /选择渗漏原因|修改选择/ }).click()
    await expect(page.getByTestId('survey-leakage-cause-panel')).toBeVisible()
    await expect(page.getByTestId('survey-leakage-cause-options')).toContainText('演示原因：屋面节点')
  }
  if (preparation === 'trigger-validation') {
    await page.getByTestId('dynamic-form-save').click()
    await expect(page.getByTestId('action-workspace-feedback')).toBeVisible()
  }
  if (preparation === 'wait-saved') {
    await expect(page.getByTestId('dynamic-form-save')).toHaveText('已保存，可完成勘查')
    await expect(page.getByTestId('action-workspace-submit')).toHaveText('完成勘查')
  }
}

for (const contract of visualScenarioContracts) {
  test(`renders ${contract.scenario} without browser/runtime errors`, async ({ page }) => {
    const evidence = installBrowserSafetyGuards(page)
    await openScenario(page, contract.scenario, evidence)
    await prepareVisualScenario(page, contract.preparation)
    if (!contract.screenshotName) return
    const focus = page.getByTestId(contract.focusTestId)
    await expect(focus).toBeVisible()
    await focus.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(screenshotDirectory, contract.screenshotName), animations: 'disabled' })
    for (const additional of contract.additionalScreenshots ?? []) {
      const additionalFocus = page.getByTestId(additional.focusTestId)
      await expect(additionalFocus).toBeVisible()
      await additionalFocus.scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(screenshotDirectory, additional.screenshotName), animations: 'disabled' })
    }
  })
}

test('overview mounts the real review path and is not the production guard', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'survey-overview', evidence)
  await expect(page.getByTestId('g4e-review-h5-label')).toHaveText('H5_VISUAL_PROXY')
  await expect(page.getByTestId('g4e-review-mock-label')).toHaveText('MOCK_PRODUCT_REVIEW')
  await expect(page.getByTestId('g4e-review-title')).toContainText('Survey / 勘查')
  await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
  await expect(page.getByText('现场勘查', { exact: true })).toBeVisible()
  await expect(page.getByTestId('g4e-review-scenario')).toBeVisible()
  await assertHealthy(page, evidence)
})

test('Leakage Cause uses the controlled experience, not unsupported fallback', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'leakage-cause', evidence)
  await expect(page.getByTestId('survey-leakage-cause')).toBeVisible()
  await expect(page.getByTestId('dynamic-form-unsupported')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /选择渗漏原因|修改选择/ })).toBeVisible()
  await assertHealthy(page, evidence)
})

test('media local pending is not presented as uploaded', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'media-local-pending', evidence)
  await expect(page.getByTestId('dynamic-media-status-images1')).toHaveText('本地已保存，等待上传')
  await expect(page.getByTestId('dynamic-media-images1')).not.toContainText('已上传')
  await assertHealthy(page, evidence)
})

test('media presentation keeps status and primary action in separate regions', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'media-local-pending', evidence)
  const status = page.getByTestId('dynamic-media-status-images1')
  const actions = page.getByTestId('dynamic-media-actions-images1')
  await expect(status).toBeVisible()
  await expect(actions).toBeVisible()
  await expect(status.evaluate((node) => node.parentElement?.dataset.testid ?? '')).not.toBe('dynamic-media-actions-images1')
  await expect(page.getByTestId('dynamic-media-local-images1')).toBeVisible()
  await assertHealthy(page, evidence)
})

test('retryable media failure exposes the real retry affordance', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'media-retryable-failure', evidence)
  await expect(page.getByTestId('dynamic-media-status-images1')).toHaveText('上传失败，可点击重试')
  await expect(page.getByRole('button', { name: '继续处理' })).toBeVisible()
  await assertHealthy(page, evidence)
})

test('ambiguous media requires verification and has no blind retry', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'media-ambiguous', evidence)
  await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('待核查')
  await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('请勿重复提交')
  await expect(page.getByRole('button', { name: '继续处理' })).toHaveCount(0)
  await assertHealthy(page, evidence)
})

test('uploaded media shows confirmed state and a real preview', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'media-uploaded', evidence)
  await expect(page.getByTestId('dynamic-media-status-images1')).toHaveText('已上传')
  const preview = page.getByTestId('dynamic-media-preview-images1').locator('image, img')
  await expect(preview).toHaveCount(1)
  await expect(preview).toHaveAttribute('src', /mock-upload\.invalid\/review\/images1\.jpg/)
  await expect(page.getByRole('button', { name: '重新选择' })).toBeVisible()
  await assertHealthy(page, evidence)
})

test('gap presentation is empty, ordered, and not an editable field', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'part-dependent-fields', evidence)
  const gap = page.getByTestId('dynamic-form-presentation-gap2')
  await expect(gap).toBeVisible()
  await expect(gap).toHaveText('')
  await expect(page.getByText('分隔槽', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('dynamic-field-gap2')).toHaveCount(0)
  const renderedIds = await page.getByTestId('dynamic-form-action-content').locator('[data-testid]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')).filter((value): value is string => Boolean(value)),
  )
  expect(renderedIds.indexOf('dynamic-form-presentation-gap2')).toBeGreaterThan(-1)
  expect(renderedIds.indexOf('dynamic-form-presentation-gap2')).toBeLessThan(renderedIds.indexOf('dynamic-form-presentation-gap3'))
  await assertHealthy(page, evidence)
})

test('media count uses verified max only and never fabricates the R1 default', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'media-uploaded', evidence)
  await expect(page.getByTestId('dynamic-media-count-images1')).toHaveText('已选 1 项')
  await expect(page.getByTestId('dynamic-media-count-images1')).not.toContainText('/ 20')
  const infrared = page.getByTestId('dynamic-media-count-infraredImageList')
  if (await infrared.count()) await expect(infrared).toContainText('/ 4')
  await assertHealthy(page, evidence)
})

test('saved state keeps Save and Complete as distinct Runtime actions', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'saved-ready-to-complete', evidence)
  await expect(page.getByTestId('dynamic-form-save')).toHaveText('已保存，可完成勘查')
  await expect(page.getByTestId('action-workspace-submit')).toHaveText('完成勘查')
  await expect(page.getByTestId('action-workspace-submit')).toBeEnabled()
  await assertHealthy(page, evidence)
})

test('deferred capabilities and LBS check-in are absent from the Survey form', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'deferred-fields-absent', evidence)
  await expect(page.getByTestId('dynamic-field-serviceGoods')).toHaveCount(0)
  await expect(page.getByTestId('dynamic-field-surveyDrawing')).toHaveCount(0)
  await expect(page.getByText('现场打卡', { exact: true })).toHaveCount(0)
  await assertHealthy(page, evidence)
})
