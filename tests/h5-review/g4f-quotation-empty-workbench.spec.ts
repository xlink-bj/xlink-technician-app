import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-ux-phase-b0/empty-workbench-approved-v1/after')

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

async function openEmptyScenario(page: Page): Promise<void> {
  await page.goto('/?scenario=empty', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toBeVisible()
}

async function assertNoHorizontalOverflow(page: Page, width: number): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const sizes = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(sizes.viewport).toBe(width)
  expect(sizes.document, 'document must not overflow horizontally').toBeLessThanOrEqual(width)
  expect(sizes.body, 'body must not overflow horizontally').toBeLessThanOrEqual(width)
}

test('approved first-use workbench uses the shared shell and fits 390px and 320px viewports', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await openEmptyScenario(page)

  // Hide only the review harness controls; the captured page remains the real uni-app Action Workspace.
  await page.addStyleTag({ content: '.g4f-review-banner{display:none!important}.g4f-review-page{padding:0!important}' })
  await expect(page.getByTestId('action-workspace-context')).toHaveCount(1)
  await expect(page.getByTestId('action-workspace-context')).toBeVisible()
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toContainText('维修部位报价')
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toContainText('暂无维修部位')
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toContainText('添加维修部位')
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toContainText('当前为本机报价草稿')
  await expect(page.getByTestId('quotation-workbench-heading')).toHaveCount(0)
  await expect(page.getByTestId('quotation-workbench-summary')).toHaveCount(0)
  await expect(page.getByTestId('quotation-draft-empty')).toHaveCount(0)
  await expect(page.getByTestId('quotation-add-group')).toHaveCount(1)
  await expect(page.getByText('报价流程', { exact: true })).toHaveCount(0)

  const footer = page.getByTestId('quotation-footer-summary')
  await expect(footer).toContainText('0 项 · 0 个部位组')
  await expect(footer).toContainText('待核验')
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('action-workspace-submit')).toBeVisible()
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  const submitBounds = await page.getByTestId('action-workspace-submit').boundingBox()
  expect(submitBounds).not.toBeNull()
  expect(submitBounds!.y + submitBounds!.height).toBeLessThanOrEqual(844)
  await assertNoHorizontalOverflow(page, 390)
  await page.screenshot({ path: resolve(output, '01-first-empty-workbench-390.png'), animations: 'disabled' })

  await page.setViewportSize({ width: 320, height: 844 })
  await assertNoHorizontalOverflow(page, 320)
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toBeVisible()
  await expect(page.getByTestId('quotation-add-group')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  const compactSubmitBounds = await page.getByTestId('action-workspace-submit').boundingBox()
  expect(compactSubmitBounds).not.toBeNull()
  expect(compactSubmitBounds!.y + compactSubmitBounds!.height).toBeLessThanOrEqual(844)
  await page.screenshot({ path: resolve(output, '02-first-empty-workbench-320.png'), animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('quotation-add-group').click()
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toHaveCount(0)
  await expect(page.getByTestId('quotation-repair-part-selector-quotation-group-1')).toBeVisible()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  const firstGroup = page.getByTestId('quotation-repair-group-quotation-group-1')
  await expect(firstGroup).toContainText('屋面')
  await firstGroup.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: resolve(output, '03-after-first-repair-part-added.png'),
    animations: 'disabled',
  })

  expect(diagnostics.pageErrors, 'pageerror output').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect(diagnostics.externalRequests, 'unexpected external requests').toEqual([])
})

test('restored, legacy, and invalid local drafts never render the first-use empty state', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  for (const [scenario, expectedState] of [
    ['restored', 'quotation-draft-groups'],
    ['legacy', 'quotation-draft-legacy'],
    ['invalid', 'quotation-draft-invalid'],
  ] as const) {
    await page.goto(`/?scenario=${scenario}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId(expectedState)).toBeVisible()
    await expect(page.getByTestId('quotation-initial-empty-workbench')).toHaveCount(0)
  }
  expect(diagnostics.pageErrors, 'pageerror output').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect(diagnostics.externalRequests, 'unexpected external requests').toEqual([])
})
