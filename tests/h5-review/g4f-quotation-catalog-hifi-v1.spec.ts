import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-ux-phase-b0/catalog-hifi-v1/generated')

function isLocalReviewRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
      && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
      && parsed.port === '5175'
  } catch {
    return false
  }
}

async function installSafetyGuards(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const unexpectedRequests = new Set<string>()
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!isLocalReviewRequest(url)) {
      unexpectedRequests.add(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return { pageErrors, consoleErrors, unexpectedRequests }
}

async function openCatalog(page: Page, width = 390): Promise<void> {
  await page.setViewportSize({ width, height: 844 })
  await page.goto('/?scenario=empty', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await page.addStyleTag({ content: '.g4f-review-banner{display:none!important}.g4f-review-page{padding:0!important}' })
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-first-step-description').getByRole('textbox').fill('屋面檐口修复')
  await page.getByTestId('quotation-first-step-quantity').getByRole('spinbutton').fill('18')
  await page.getByTestId('quotation-first-step-select-products').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-browser')).toBeVisible()
}

async function capture(page: Page, filename: string): Promise<void> {
  await page.screenshot({ path: resolve(output, filename), animations: 'disabled' })
}

async function expectSafe(page: Page, diagnostics: Awaited<ReturnType<typeof installSafetyGuards>>): Promise<void> {
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect([...diagnostics.unexpectedRequests], 'unexpected non-local requests').toEqual([])
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth, 'catalog page must not overflow horizontally').toBeLessThanOrEqual(dimensions.width)
}

test('approved catalog page renders all four categories and matches R1 search scope', async ({ page, browser }) => {
  console.log(`[g4f-catalog-hifi-v1] Playwright ${browser.version()}`)
  await mkdir(output, { recursive: true })
  const diagnostics = await installSafetyGuards(page)
  await openCatalog(page)

  await expect(page.getByTestId('quotation-catalog-page')).toContainText('服务目录')
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面')
  await expect(page.getByTestId('quotation-catalog-kind-package')).toContainText('套餐')
  await expect(page.getByTestId('quotation-catalog-kind-procedure')).toContainText('工序')
  await expect(page.getByTestId('quotation-catalog-kind-material')).toContainText('材料')
  await expect(page.getByTestId('quotation-catalog-kind-measure')).toContainText('机措')
  await expect(page.getByTestId('quotation-catalog-search')).toHaveAttribute('aria-label', '请输入套餐名称')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('屋面防水修缮方案（示例）')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('金额待核验')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic').locator('.quotation-content__catalog-thumbnail')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic').locator('.quotation-content__catalog-art')).toHaveCount(0)
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  await capture(page, '01-catalog-package-390.png')

  const search = page.getByTestId('quotation-catalog-search')
  const searchInput = search.locator('input')
  await searchInput.fill('外墙')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-extended')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toHaveCount(0)
  await searchInput.fill('DEMO-PKG')
  await expect(page.getByTestId('quotation-catalog-empty')).toBeVisible()
  await expect(search).toHaveAttribute('aria-label', '请输入套餐名称')

  await page.getByTestId('quotation-catalog-kind-procedure').click()
  await expect(searchInput).toHaveValue('')
  await expect(search).toHaveAttribute('aria-label', '请输入工序名称')
  await searchInput.fill('檐口密封处理')
  await expect(page.getByTestId('quotation-catalog-item-procedure-mock-catalog-procedure-seal')).toBeVisible()
  await capture(page, '02-catalog-procedure-390.png')

  await page.getByTestId('quotation-catalog-kind-material').click()
  await expect(searchInput).toHaveValue('')
  await expect(search).toHaveAttribute('aria-label', '请输入材料名称或编号')
  await searchInput.fill('DEMO-MAT-001')
  await expect(page.getByTestId('quotation-catalog-item-material-mock-catalog-material-sealant')).toBeVisible()
  await capture(page, '03-catalog-material-390.png')

  await page.getByTestId('quotation-catalog-kind-measure').click()
  await expect(searchInput).toHaveValue('')
  await expect(search).toHaveAttribute('aria-label', '请输入机措名称')
  await searchInput.fill('高处作业防护')
  await expect(page.getByTestId('quotation-catalog-item-measure-mock-catalog-measure-inspection')).toBeVisible()
  await capture(page, '04-catalog-measure-390.png')
  await page.getByTestId('quotation-catalog-kind-procedure').click()
  await expect(searchInput).toHaveValue('檐口密封处理')

  await expectSafe(page, diagnostics)
})

test('catalog preserves the target group through Package configuration and direct-item return', async ({ page }) => {
  await mkdir(output, { recursive: true })
  const diagnostics = await installSafetyGuards(page)
  await openCatalog(page)

  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-detail')).toBeVisible()
  await expect(page.getByTestId('quotation-package-config-focus')).toContainText('屋面防水修缮方案（示例）')
  await expect(page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0')).toBeEnabled()
  await expect(page.getByTestId('quotation-package-material-choice-number:2-0')).toBeEnabled()
  await page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0').click()
  await page.getByTestId('quotation-package-material-choice-number:2-0').click()
  await capture(page, '05-package-configuration-390.png')
  await page.getByTestId('quotation-package-configure-commit').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('quotation-repair-group-quotation-group-1')).toContainText('屋面檐口修复')
  const configuredPackage = page.getByTestId('quotation-configured-package-quotation-selection-1')
  await expect(configuredPackage).toContainText('1 项工序 · 2 项材料 · 1 项机措')
  await page.getByTestId('quotation-package-details-toggle-quotation-selection-1').click()
  await expect(configuredPackage).toContainText('檐口密封处理（示例）')

  await page.getByTestId('quotation-browse-quotation-group-1').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await page.getByTestId('quotation-catalog-kind-procedure').click()
  await expect(page.getByTestId('quotation-catalog-item-procedure-mock-catalog-procedure-seal')).toBeVisible()
  await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-procedure')).toContainText('檐口密封处理（示例）')

  await page.getByTestId('quotation-browse-quotation-group-1').click()
  await page.getByTestId('quotation-catalog-kind-procedure').click()
  await expect(page.getByTestId('quotation-catalog-selected-procedure-mock-catalog-procedure-seal')).toContainText('已选 × 1')
  await expect(page.getByTestId('quotation-catalog-adjust-procedure-mock-catalog-procedure-seal')).toContainText('在工作台调整')
  await page.getByTestId('quotation-catalog-adjust-procedure-mock-catalog-procedure-seal').click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('quotation-repair-group-quotation-group-1')).toContainText('屋面檐口修复')
  await capture(page, '06-selected-item-return-390.png')

  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByTestId('quotation-browse-quotation-group-1').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expectSafe(page, diagnostics)
  await capture(page, '07-catalog-320.png')
})
