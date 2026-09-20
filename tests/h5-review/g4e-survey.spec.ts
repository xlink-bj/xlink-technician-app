import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const reviewPath = '/__review/g4e-survey.html'
const screenshotDirectory = resolve(process.cwd(), '.review/g4e-product-gate/generated')

const scenarioScreenshots: Record<string, string> = {
  'survey-overview': '01-overview.png',
  'required-fields': '02-required-fields.png',
  'leakage-cause': '03-leakage-cause.png',
  'required-media-empty': '04-media-empty.png',
  'media-local-pending': '05-media-pending.png',
  'media-retryable-failure': '06-media-failure.png',
  'media-ambiguous': '07-media-ambiguous.png',
  'media-uploaded': '08-media-uploaded.png',
  'validation-error': '09-validation.png',
  'saved-ready-to-complete': '10-save-complete.png',
  'deferred-fields-absent': '11-deferred-absent.png',
}

const scenarios = Object.keys(scenarioScreenshots)

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

for (const scenario of scenarios) {
  test(`renders ${scenario} without browser/runtime errors`, async ({ page }) => {
    const evidence = installBrowserSafetyGuards(page)
    await openScenario(page, scenario, evidence)
    await page.screenshot({
      path: join(screenshotDirectory, scenarioScreenshots[scenario]),
      animations: 'disabled',
    })
  })
}

test('overview mounts the real review path and is not the production guard', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'survey-overview', evidence)
  await expect(page.getByTestId('g4e-review-h5-label')).toHaveText('H5_VISUAL_PROXY')
  await expect(page.getByTestId('g4e-review-mock-label')).toHaveText('MOCK_PRODUCT_REVIEW')
  await expect(page.getByTestId('g4e-review-title')).toContainText('Survey / 勘查')
  await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
  await expect(page.getByText('现场勘察', { exact: true })).toBeVisible()
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

test('saved state keeps Save and Complete as distinct Runtime actions', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openScenario(page, 'saved-ready-to-complete', evidence)
  await expect(page.getByTestId('dynamic-form-save')).toHaveText('已保存，可完成勘察')
  await expect(page.getByTestId('action-workspace-submit')).toHaveText('完成勘察')
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
