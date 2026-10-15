import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { designSystemScreenshotContracts, designSystemSections } from '../../__review/design-system-gallery-fixtures'

const reviewPath = '/#/pages/design-system/index'
const screenshotDirectory = resolve(process.cwd(), '.review/design-system-uni-h5/generated')

type BrowserEvidence = {
  readonly consoleErrors: string[]
  readonly pageErrors: string[]
  readonly unexpectedRequests: string[]
}

function allowedRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ws:' || parsed.protocol === 'wss:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && (parsed.port === '' || parsed.port === '5174')
  } catch {
    return false
  }
}

function installBrowserSafetyGuards(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = { consoleErrors: [], pageErrors: [], unexpectedRequests: [] }
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
  await expect(page.locator('body')).not.toContainText('development-only')
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  expect(overflow.documentWidth, 'document horizontal overflow').toBeLessThanOrEqual(overflow.viewportWidth)
  expect(overflow.bodyWidth, 'body horizontal overflow').toBeLessThanOrEqual(overflow.viewportWidth)
}

async function assertDisabled(control: Locator): Promise<void> {
  const disabled = await control.evaluate((element) =>
    element.getAttribute('disabled') !== null && element.getAttribute('disabled') !== 'false'
    || element.getAttribute('aria-disabled') === 'true'
    || (element as HTMLButtonElement).disabled === true,
  )
  expect(disabled, 'shared control must expose a disabled state').toBe(true)
}

async function assertEnabled(control: Locator): Promise<void> {
  const disabled = await control.evaluate((element) =>
    element.getAttribute('disabled') !== null && element.getAttribute('disabled') !== 'false'
    || element.getAttribute('aria-disabled') === 'true'
    || (element as HTMLButtonElement).disabled === true,
  )
  expect(disabled, 'shared control must not expose a disabled state').toBe(false)
}

async function openReview(page: Page, evidence: BrowserEvidence): Promise<void> {
  await page.goto(reviewPath, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('design-system-gallery')).toBeVisible()
  await expect(page.getByTestId('gallery-notice')).toContainText('不连接 API')
  await assertHealthy(page, evidence)
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true })
})

test('real uni-app H5 page mounts all gallery sections without runtime or network errors', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)
  for (const section of designSystemSections) {
    await expect(page.getByTestId(`gallery-section-${section.id}`)).toBeVisible()
  }
  await assertNoHorizontalOverflow(page)
  await assertHealthy(page, evidence)
})

test('real uni-app H5 preserves shared control states and independent footer actions', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)

  const saved = page.getByTestId('gallery-action-state-saved')
  await expect(saved.getByTestId('dynamic-form-save')).toHaveText('已保存')
  await assertDisabled(saved.getByTestId('dynamic-form-save'))
  await assertEnabled(saved.getByTestId('action-workspace-submit'))

  const textarea = page.getByTestId('gallery-textarea-populated')
  await expect(textarea).toBeVisible()
  const textareaMetrics = await textarea.evaluate((element) => ({
    minHeight: Number.parseFloat(getComputedStyle(element).minHeight),
    height: element.getBoundingClientRect().height,
  }))
  expect(textareaMetrics.minHeight).toBeGreaterThan(40)
  expect(textareaMetrics.height).toBeGreaterThan(40)

  await expect(page.getByTestId('gallery-information-long')).toContainText('演示区域的一段较长说明文字')
  // uni H5 exposes the shared choice control as a generated uni-button
  // element, so assert the visible option text rather than a browser role.
  await expect(page.getByText('通用中文选项的较长展示文本', { exact: true }).first()).toBeVisible()
  await assertHealthy(page, evidence)
})

test('real uni-app H5 remains usable at the compact 320px width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)
  await assertNoHorizontalOverflow(page)
  await expect(page.getByTestId('gallery-section-07-action-workspace-footer')).toBeVisible()
  await assertDisabled(page.getByTestId('gallery-action-state-saved').getByTestId('dynamic-form-save'))
  await assertHealthy(page, evidence)
})

test('captures the uni-app H5 visual review evidence without establishing baselines', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)
  for (const screenshot of designSystemScreenshotContracts) {
    const example = page.getByTestId(`gallery-example-${screenshot.focusExampleId}`)
    await example.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(screenshotDirectory, screenshot.filename), animations: 'disabled' })
  }

  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(reviewPath, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('design-system-gallery')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(screenshotDirectory, '09-compact-320.png'), animations: 'disabled' })
  await assertNoHorizontalOverflow(page)
  await assertHealthy(page, evidence)
})


test('DS-01 shared commercial controls: 320/375/390px, states, geometry, one tap and no overflow', async ({ page }) => {
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const evidence = installBrowserSafetyGuards(page)
    await openReview(page, evidence)
    const button = page.getByTestId('ds01-button-primary')
    const compact = page.getByTestId('ds01-button-compact')
    const large = page.getByTestId('ds01-button-large')
    const disabled = page.getByTestId('ds01-button-disabled')
    const loading = page.getByTestId('ds01-button-loading')
    const long = page.getByTestId('ds01-button-long')
    const actionBar = page.getByTestId('ds01-action-dual')
    await expect(button).toBeVisible()
    await assertDisabled(disabled)
    await assertDisabled(loading)
    const metrics = await Promise.all([button, compact, large, long].map(element =>
      element.evaluate(node => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        scrollWidth: node.scrollWidth,
        fontSize: parseFloat(getComputedStyle(node).fontSize),
      })),
    ))
    for (const metric of metrics) {
      expect(metric.height, 'button hit target >=44px').toBeGreaterThanOrEqual(43.5)
      expect(metric.width, 'button must fit mobile viewport').toBeLessThanOrEqual(width)
      expect(metric.scrollWidth, 'button text should not clip horizontally').toBeLessThanOrEqual(metric.width + 1)
    }
    expect(metrics[2].height).toBeGreaterThan(metrics[0].height)
    await expect(actionBar).toBeVisible()
    const dual = await actionBar.getByTestId('ds01-action-primary').boundingBox()
    const secondary = await actionBar.getByTestId('ds01-action-secondary').boundingBox()
    expect(dual).not.toBeNull()
    expect(secondary).not.toBeNull()
    expect(dual!.height).toBeGreaterThanOrEqual(43.5)
    expect(secondary!.height).toBeGreaterThanOrEqual(43.5)
    expect(dual!.x).toBeGreaterThan(secondary!.x)
    expect(dual!.x + dual!.width).toBeLessThanOrEqual(width)
    await expect(page.getByTestId('ds01-button-tap-count')).toHaveText('0')
    await disabled.click({ force: true })
    await loading.click({ force: true })
    await expect(page.getByTestId('ds01-button-tap-count')).toHaveText('0')
    await button.click()
    await expect(page.getByTestId('ds01-button-tap-count')).toHaveText('1')
    await assertNoHorizontalOverflow(page)
    await page.getByTestId('gallery-example-buttons').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(screenshotDirectory, `ds01-buttons-${width}.png`),
      animations: 'disabled',
    })
    await actionBar.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(screenshotDirectory, `ds01-action-bar-${width}.png`),
      animations: 'disabled',
    })
    await assertHealthy(page, evidence)
  }
})
