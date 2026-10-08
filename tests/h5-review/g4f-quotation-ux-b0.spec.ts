import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-ux-phase-b0')

type Diagnostics = {
  readonly pageErrors: string[]
  readonly consoleErrors: string[]
  readonly externalRequests: string[]
}

function isAllowedRequest(url: string): boolean {
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

async function installReviewSafety(page: Page): Promise<Diagnostics> {
  const diagnostics: Diagnostics = { pageErrors: [], consoleErrors: [], externalRequests: [] }
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
  })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!isAllowedRequest(url)) {
      diagnostics.externalRequests.push(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return diagnostics
}

async function openReview(page: Page, scenario: string, width = 390): Promise<void> {
  await page.setViewportSize({ width, height: 844 })
  await page.goto(`/?scenario=${scenario}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  // Hide only the review route's scenario controls; all captured app content is
  // the real Action Workspace/runtime. The app header remains in the viewport.
  await page.addStyleTag({
    content: '.g4f-review-banner{display:none!important}.g4f-review-page{padding:0!important}',
  })
}

async function createGroup(page: Page, groupId: string, part: '屋面' | '卫生间', description: string, area: string): Promise<void> {
  await page.getByTestId('quotation-add-group').last().click()
  const group = page.getByTestId(`quotation-repair-group-${groupId}`)
  await expect(group).toBeVisible()
  await group.getByText(part, { exact: true }).click()
  await group.getByTestId(`quotation-group-description-${groupId}`).locator('textarea').fill(description)
  await group.getByTestId(`quotation-group-quantity-${groupId}`).locator('input').fill(area)
}

async function addDirectItem(page: Page, groupId: string, kind: 'procedure' | 'material' | 'measure'): Promise<void> {
  const itemIds = {
    procedure: 'mock-catalog-procedure-seal',
    material: 'mock-catalog-material-sealant',
    measure: 'mock-catalog-measure-inspection',
  } as const
  await page.getByTestId(`quotation-browse-${groupId}-${kind}`).click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  const itemId = itemIds[kind]
  await expect(page.getByTestId(`quotation-catalog-item-${kind}-${itemId}`)).toBeVisible()
  await page.getByTestId(`quotation-catalog-add-${kind}-${itemId}`).click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId(`quotation-repair-group-${groupId}`)).toBeInViewport()
}

async function scrollWorkbenchTitleIntoView(page: Page): Promise<void> {
  await page.getByTestId('quotation-workbench-heading').scrollIntoViewIfNeeded()
}

async function openPackage(page: Page, groupId: string): Promise<void> {
  await page.getByTestId(`quotation-browse-${groupId}-package`).click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-target')).toContainText(`维修部位组 ${groupId.endsWith('1') ? '1' : '2'}`)
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-config-focus')).toBeVisible()
}

async function expectNoRuntimeOrNetworkErrors(diagnostics: Diagnostics): Promise<void> {
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect(diagnostics.externalRequests, 'all requests must remain in the local mock review server').toEqual([])
}

test('Phase B0 golden path: workbench → catalog → package configuration → same-group review', async ({ page, browser }) => {
  console.log(`[g4f-ux-b0] Playwright ${browser.version()}`)
  await mkdir(output, { recursive: true })
  const diagnostics = await installReviewSafety(page)
  await openReview(page, 'empty')

  const groupId = 'quotation-group-1'
  await createGroup(page, groupId, '屋面', '屋面檐口修复', '18')
  await addDirectItem(page, groupId, 'procedure')
  await addDirectItem(page, groupId, 'material')
  await expect(page.getByTestId(`quotation-group-section-${groupId}-procedure`)).toContainText('Mock 施工工序 A')
  await expect(page.getByTestId(`quotation-group-section-${groupId}-material`)).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-workbench-amount')).toContainText('待核验')
  await expect(page.getByTestId('quotation-footer-summary')).toContainText('待核验')
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  await expect(page.getByText(/¥0(?:\.00)?/)).toHaveCount(0)
  await scrollWorkbenchTitleIntoView(page)
  await page.screenshot({ path: resolve(output, '01-quotation-workbench.png'), animations: 'disabled' })

  await page.getByTestId(`quotation-browse-${groupId}-package`).click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('维修部位组 1')
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面檐口修复')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('Mock 服务方案 A')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('金额待核验')
  await expect(page.getByTestId('quotation-catalog-search')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-footer')).toContainText('2 项已选')
  await page.screenshot({ path: resolve(output, '02-visual-catalog.png'), animations: 'disabled' })

  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-config-focus')).toBeVisible()
  await expect(page.getByTestId('quotation-package-procedures')).toContainText('Mock 施工工序 A')
  await expect(page.getByTestId('quotation-package-materials')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-package-measures')).toContainText('Mock 机措 A')
  const layerOne = page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0')
  const layerTwo = page.getByTestId('quotation-package-material-choice-number:2-0')
  await layerOne.click()
  await expect(page.getByTestId('quotation-package-configure-commit')).toHaveAttribute('disabled', 'true')
  await page.screenshot({ path: resolve(output, '03-package-configuration.png'), animations: 'disabled' })

  // Back to the directory and reopen: uncommitted package choices remain in
  // this page session, but are not yet present in the grouped quote draft.
  await page.getByTestId('quotation-package-detail-back').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0')).toContainText('✓')
  await page.getByTestId('quotation-package-detail-back').click()
  await page.getByTestId('quotation-catalog-close').click()
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(2)

  await openPackage(page, groupId)
  await expect(page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0')).toContainText('✓')
  await layerTwo.click()
  const commit = page.getByTestId('quotation-package-configure-commit')
  await expect(commit).not.toHaveAttribute('disabled')
  await commit.click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(3)
  await expect(page.getByTestId('quotation-configured-package-quotation-selection-3')).toContainText('Mock 材料 B（数值层）')

  const packageQuantity = page.getByTestId('quotation-selection-quantity-quotation-selection-3').locator('input')
  await packageQuantity.fill('2')
  await expect(packageQuantity).toHaveValue('2')
  await page.getByTestId('quotation-configured-package-quotation-selection-3').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '04-workbench-after-selection.png'), animations: 'disabled' })

  // Removal/re-entry remains a local, explicit operation scoped to group 1.
  const procedureRemove = page.getByTestId('quotation-selection-remove-quotation-selection-1')
  await procedureRemove.click()
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-procedure')).toContainText('尚未添加')
  await addDirectItem(page, groupId, 'procedure')
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-procedure')).toContainText('Mock 施工工序 A')

  // A second group can independently use the same provider item identity.
  const secondGroupId = 'quotation-group-2'
  await createGroup(page, secondGroupId, '卫生间', '卫生间墙地交界', '6')
  await addDirectItem(page, secondGroupId, 'material')
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-group-section-quotation-group-2-material')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-draft-groups').locator('[data-testid="quotation-composition-selection"]')).toHaveCount(4)

  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByTestId(`quotation-repair-group-${secondGroupId}`).scrollIntoViewIfNeeded()
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(width.document, 'compact quote workspace must not horizontally overflow').toBeLessThanOrEqual(width.viewport)
  await page.screenshot({ path: resolve(output, '05-compact-two-group-quote.png'), animations: 'disabled' })
  await expectNoRuntimeOrNetworkErrors(diagnostics)
})

test('Phase B0 empty and retryable catalog states are explicit and recoverable', async ({ page }) => {
  const diagnostics = await installReviewSafety(page)
  await openReview(page, 'catalog-empty')
  await createGroup(page, 'quotation-group-1', '屋面', '屋面檐口修复', '18')
  await page.getByTestId('quotation-browse-quotation-group-1-package').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面檐口修复')
  await expect(page.getByTestId('quotation-catalog-browser')).toContainText('当前适用范围暂无目录项目')
  await page.screenshot({ path: resolve(output, '06-catalog-empty.png'), animations: 'disabled' })

  await openReview(page, 'catalog-error')
  await createGroup(page, 'quotation-group-1', '屋面', '屋面檐口修复', '18')
  await page.getByTestId('quotation-browse-quotation-group-1-package').click()
  await expect(page.getByTestId('quotation-catalog-list-error')).toContainText('暂时无法读取目录')
  const retry = page.getByTestId('quotation-catalog-list-retry')
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(page.getByTestId('quotation-catalog-list-error')).toContainText('暂时无法读取目录')
  await page.screenshot({ path: resolve(output, '07-catalog-retryable-error.png'), animations: 'disabled' })
  await expectNoRuntimeOrNetworkErrors(diagnostics)
})
