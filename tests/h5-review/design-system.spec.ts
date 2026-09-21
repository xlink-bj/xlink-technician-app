import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { designSystemScreenshotContracts } from '../../__review/design-system-gallery-fixtures'

const galleryPath = '/__review/design-system.html'
const screenshotDirectory = resolve(process.cwd(), '.review/design-system/generated')
const sectionIds = [
  '01-foundations',
  '02-actions',
  '03-fields-inputs',
  '04-selection',
  '05-feedback',
  '06-complex-patterns',
  '07-action-workspace-footer',
] as const

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
      && (parsed.port === '' || parsed.port === '5173')
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
  await expect(page.locator('body')).not.toContainText('Design System Gallery is development-only')
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

async function openGallery(page: Page, evidence: BrowserEvidence): Promise<void> {
  await page.goto(galleryPath, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('design-system-gallery')).toBeVisible()
  await expect(page.getByTestId('gallery-notice')).toContainText('不连接 API')
  await assertHealthy(page, evidence)
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true })
})

test('Design System Gallery mounts all sections without network or runtime errors', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openGallery(page, evidence)
  for (const sectionId of sectionIds) await expect(page.getByTestId(`gallery-section-${sectionId}`)).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await assertHealthy(page, evidence)
})

test('Gallery exposes real shared component states and independent footer actions', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openGallery(page, evidence)

  const unsaved = page.getByTestId('gallery-action-state-unsaved')
  await expect(unsaved.getByTestId('dynamic-form-save')).toHaveText('保存表单')
  await expect(unsaved.getByTestId('action-workspace-submit')).toBeDisabled()

  const saved = page.getByTestId('gallery-action-state-saved')
  await expect(saved.getByTestId('dynamic-form-save')).toHaveText('已保存')
  await expect(saved.getByTestId('dynamic-form-save')).toBeDisabled()
  await expect(saved.getByTestId('action-workspace-submit')).toBeEnabled()

  const textarea = page.getByTestId('gallery-textarea-empty')
  await expect(textarea).toBeVisible()
  const textareaMetrics = await textarea.evaluate((element) => ({
    minHeight: Number.parseFloat(getComputedStyle(element).minHeight),
    height: element.getBoundingClientRect().height,
  }))
  expect(textareaMetrics.minHeight).toBeGreaterThan(40)
  expect(textareaMetrics.height).toBeGreaterThan(40)
  await expect(page.getByTestId('gallery-textarea-populated')).toBeVisible()
  const longInformation = page.getByTestId('gallery-information-long').locator('.app-information-row__value')
  await expect(longInformation).toContainText('演示区域的一段较长说明文字')
  const longInformationMetrics = await longInformation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }))
  expect(longInformationMetrics.clientHeight).toBeGreaterThanOrEqual(longInformationMetrics.lineHeight)
  const longOption = page.getByRole('button', { name: '通用中文选项的较长展示文本' }).first()
  await expect(longOption).toBeVisible()
  const longOptionFits = await longOption.evaluate((element) => element.scrollWidth <= element.clientWidth)
  expect(longOptionFits).toBe(true)
  await assertHealthy(page, evidence)
})

test('Gallery remains usable at compact 320px width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const evidence = installBrowserSafetyGuards(page)
  await openGallery(page, evidence)
  await assertNoHorizontalOverflow(page)
  await expect(page.getByTestId('gallery-section-07-action-workspace-footer')).toBeVisible()
  await expect(page.getByTestId('gallery-action-state-saved').getByTestId('dynamic-form-save')).toBeDisabled()
  await assertHealthy(page, evidence)
})

test('captures focused Design System Gallery evidence', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openGallery(page, evidence)
  for (const screenshot of designSystemScreenshotContracts) {
    const example = page.getByTestId(`gallery-example-${screenshot.focusExampleId}`)
    await example.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(screenshotDirectory, screenshot.filename), animations: 'disabled' })
  }

  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(galleryPath, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('design-system-gallery')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(screenshotDirectory, '09-compact-320.png'), animations: 'disabled' })
  await assertNoHorizontalOverflow(page)
  await assertHealthy(page, evidence)
})
