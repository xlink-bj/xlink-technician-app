import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-phase1b')

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

async function openScenario(page: Page, scenario: string): Promise<void> {
  await page.goto(`/?scenario=${scenario}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page.getByText('报价方案', { exact: true })).toBeVisible()
  await expect(page.getByText('服务方案 / 报价明细')).toBeVisible()
}

async function expectSafe(page: Page, diagnostics: Awaited<ReturnType<typeof installSafetyGuards>>): Promise<void> {
  expect(diagnostics.pageErrors, 'pageerror output').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect(diagnostics.externalRequests, 'unexpected non-local network requests').toEqual([])
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(width.scroll, 'review viewport must not horizontally overflow').toBeLessThanOrEqual(width.viewport)
}

test('Phase 1B empty quotation draft is a local composition workspace', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'empty')
  await expect(page.getByTestId('g4f-review-scenario-selector')).toBeVisible()
  await expect(page.getByTestId('quotation-draft-empty')).toContainText('还没有添加报价明细')
  await expect(page.getByTestId('quotation-add-item')).toBeVisible()
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await page.getByTestId('quotation-draft-empty').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '01-empty-draft.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1B composes package, procedure, material, and measure through the real catalog UI', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'empty')
  for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
    await page.getByTestId('quotation-add-item').last().click()
    await expect(page.getByTestId('quotation-catalog-sheet')).toBeVisible()
    await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
    const ids = {
      package: 'synthetic-package-basic',
      procedure: 'synthetic-procedure-base',
      material: 'synthetic-material-demo',
      measure: 'synthetic-measure-area',
    } as const
    await page.getByTestId(`quotation-catalog-item-${ids[kind]}`).click()
  }
  await expect(page.getByTestId('quotation-composition-line')).toHaveCount(4)
  const packageQuantity = page.getByTestId('quotation-line-quantity-quotation-line-1').locator('input')
  await packageQuantity.fill('0')
  await expect(page.getByRole('alert')).toContainText('请输入大于 0 的数量')
  await packageQuantity.fill('2.5')
  await expect(page.getByText('报价草稿已保存在本机。')).toBeVisible()
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await expect(page.getByTestId('dynamic-form-save')).toHaveCount(0)
  await page.getByTestId('quotation-draft-lines').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '02-composed-draft.png'), animations: 'disabled' })
  await page.getByTestId('quotation-line-remove-quotation-line-2').click()
  await expect(page.getByTestId('quotation-composition-line')).toHaveCount(3)
  await expectSafe(page, diagnostics)
})

test('Phase 1B catalog selection is usable and synthetic only', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'catalog')
  await expect(page.getByTestId('quotation-catalog-sheet')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-kind-package')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-item-synthetic-package-basic')).toContainText('标准服务方案')
  await page.getByTestId('quotation-catalog-sheet').screenshot({ path: resolve(output, '03-catalog-selection.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1B restores only the current identity and rejects malformed local drafts', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openScenario(page, 'populated')
  await expect(page.getByTestId('quotation-composition-line')).toHaveCount(4)
  await openScenario(page, 'restored')
  await expect(page.getByTestId('quotation-composition-line')).toHaveCount(4)
  await expect(page.getByText('已恢复本地报价草稿。')).toBeVisible()
  await expectSafe(page, diagnostics)

  await page.goto('/?scenario=invalid', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('quotation-draft-invalid')).toBeVisible()
  await expect(page.getByTestId('quotation-add-item')).toHaveCount(0)
  await expectSafe(page, diagnostics)
})
