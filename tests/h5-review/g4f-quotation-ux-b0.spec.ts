import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-ux-phase-b0/after')

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

async function createGroup(page: Page, groupId: string, part: '屋面' | '卫生间', description: string, area: string, collapseContext = true): Promise<void> {
  await page.getByTestId('quotation-add-group').last().click()
  const group = page.getByTestId(`quotation-repair-group-${groupId}`)
  await expect(group).toBeVisible()
  await group.getByText(part, { exact: true }).click()
  await group.getByTestId(`quotation-group-description-${groupId}`).locator('textarea').fill(description)
  await group.getByTestId(`quotation-group-quantity-${groupId}`).locator('input').fill(area)
  if (collapseContext) {
    await group.getByTestId(`quotation-group-context-toggle-${groupId}`).click()
    await expect(group.getByTestId(`quotation-group-context-${groupId}`)).toBeHidden()
  }
}

async function openGroupCatalog(page: Page, groupId: string): Promise<void> {
  const trigger = page.getByTestId(`quotation-browse-${groupId}`)
  await trigger.scrollIntoViewIfNeeded()
  await expect(trigger).toBeEnabled()
  const remainsAboveFooter = await trigger.evaluate((element) => {
    const triggerRect = element.getBoundingClientRect()
    const footer = document.querySelector('.action-workspace-footer')
    return footer !== null && triggerRect.bottom <= footer.getBoundingClientRect().top
  })
  expect(remainsAboveFooter, 'group catalog action must remain clear of the fixed action footer').toBe(true)
  await trigger.click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
}

async function addDirectItem(page: Page, groupId: string, kind: 'procedure' | 'material' | 'measure'): Promise<void> {
  const itemIds = {
    procedure: 'mock-catalog-procedure-seal',
    material: 'mock-catalog-material-sealant',
    measure: 'mock-catalog-measure-inspection',
  } as const
  await openGroupCatalog(page, groupId)
  await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
  const itemId = itemIds[kind]
  await expect(page.getByTestId(`quotation-catalog-item-${kind}-${itemId}`)).toBeVisible()
  await page.getByTestId(`quotation-catalog-add-${kind}-${itemId}`).click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  await expect(page.getByTestId(`quotation-repair-group-${groupId}`)).toBeInViewport()
}

async function captureFocusedViewport(page: Page, testId: string, filename: string): Promise<void> {
  const focus = page.getByTestId(testId)
  await expect(focus).toBeVisible()
  await focus.scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, filename), animations: 'disabled' })
}

async function openPackage(page: Page, groupId: string): Promise<void> {
  await openGroupCatalog(page, groupId)
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
  await expect(page.getByTestId('quotation-workbench-amount')).toContainText(/待核验|暂不可计算/)
  await expect(page.getByTestId('quotation-footer-summary')).toContainText(/待核验|暂不可计算/)
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId(`quotation-browse-${groupId}`)).toHaveCount(1)
  await expect(page.locator(`[data-testid^="quotation-browse-${groupId}-"]`)).toHaveCount(0)
  await expect(page.getByText(/¥0(?:\.00)?/)).toHaveCount(0)
  await captureFocusedViewport(page, `quotation-group-composition-${groupId}`, 'b01-workbench-quote-list-390.png')

  await openGroupCatalog(page, groupId)
  await page.getByTestId('quotation-catalog-kind-package').click()
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('维修部位组 1')
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面檐口修复')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('Mock 服务方案 A')
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('价格依据待核验')
  await expect(page.getByTestId('quotation-catalog-search')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-footer')).toContainText('2 项已选')
  await captureFocusedViewport(page, 'quotation-catalog-item-package-mock-catalog-package-basic', 'b02-visual-catalog-390.png')

  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-config-focus')).toBeVisible()
  await expect(page.getByTestId('quotation-package-procedures')).toContainText('Mock 施工工序 A')
  await expect(page.getByTestId('quotation-package-materials')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-package-measures')).toContainText('Mock 机措 A')
  const layerOne = page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0')
  const layerTwo = page.getByTestId('quotation-package-material-choice-number:2-0')
  await layerOne.click()
  await expect(page.getByTestId('quotation-package-configure-commit')).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('quotation-package-detail')).not.toContainText('mock-layer-1')
  await captureFocusedViewport(page, 'quotation-material-layer-string:mock-layer-1', 'b03-package-configuration-390.png')

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
  const configuredPackage = page.getByTestId('quotation-configured-package-quotation-selection-3')
  await expect(configuredPackage).toContainText('材料层级 1')
  await expect(configuredPackage).toContainText('材料层级 2')
  await expect(configuredPackage).toContainText('计价关系待核验')
  await expect(configuredPackage).not.toContainText('mock-layer-1')
  await expect(page.getByTestId(`quotation-group-section-${groupId}-material`)).toContainText('Mock 材料 A')

  const packageQuantity = page.getByTestId('quotation-selection-quantity-quotation-selection-3').locator('input')
  await packageQuantity.fill('2')
  await expect(packageQuantity).toHaveValue('2')
  await captureFocusedViewport(page, `quotation-group-composition-${groupId}`, 'b04-workbench-package-and-standalone-material-390.png')

  await page.getByTestId(`quotation-group-details-toggle-${groupId}`).click()
  await expect(page.getByTestId(`quotation-group-collapsed-summary-${groupId}`)).toContainText('Mock 服务方案 A')
  await expect(page.getByTestId(`quotation-group-section-${groupId}-package`)).toBeHidden()
  await page.getByTestId(`quotation-group-details-toggle-${groupId}`).click()
  await expect(page.getByTestId(`quotation-group-section-${groupId}-package`)).toBeVisible()

  // Removal/re-entry remains a local, explicit operation scoped to group 1.
  const procedureRemove = page.getByTestId('quotation-selection-remove-quotation-selection-1')
  await procedureRemove.click()
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-procedure')).toBeHidden()
  await addDirectItem(page, groupId, 'procedure')
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-procedure')).toContainText('Mock 施工工序 A')

  // A second group can independently use the same provider item identity.
  const secondGroupId = 'quotation-group-2'
  await createGroup(page, secondGroupId, '卫生间', '卫生间墙地交界', '6')
  await addDirectItem(page, secondGroupId, 'material')
  await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-group-section-quotation-group-2-material')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-draft-groups').locator('[data-testid="quotation-composition-selection"]')).toHaveCount(4)

  await page.getByTestId(`quotation-group-details-toggle-${groupId}`).click()
  await page.getByTestId(`quotation-group-details-toggle-${secondGroupId}`).click()
  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByTestId('quotation-repair-group-quotation-group-1').evaluate((element) => {
    element.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(width.document, 'compact quote workspace must not horizontally overflow').toBeLessThanOrEqual(width.viewport)
  await page.screenshot({ path: resolve(output, 'b05-two-group-compact-320.png'), animations: 'disabled' })
  await expectNoRuntimeOrNetworkErrors(diagnostics)
})

test('Phase B0 empty and retryable catalog states are explicit and recoverable', async ({ page }) => {
  const diagnostics = await installReviewSafety(page)
  await openReview(page, 'catalog-empty')
  await createGroup(page, 'quotation-group-1', '屋面', '屋面檐口修复', '18', false)
  await expect(page.getByTestId('quotation-group-context-quotation-group-1')).toBeVisible()
  await openGroupCatalog(page, 'quotation-group-1')
  await page.getByTestId('quotation-catalog-kind-package').click()
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面檐口修复')
  await expect(page.getByTestId('quotation-catalog-empty')).toContainText('当前目录暂无项目')
  await captureFocusedViewport(page, 'quotation-catalog-empty', 'b06-catalog-empty-390.png')

  await openReview(page, 'catalog-error')
  await createGroup(page, 'quotation-group-1', '屋面', '屋面檐口修复', '18', false)
  await expect(page.getByTestId('quotation-group-context-quotation-group-1')).toBeVisible()
  await openGroupCatalog(page, 'quotation-group-1')
  await page.getByTestId('quotation-catalog-kind-package').click()
  await expect(page.getByTestId('quotation-catalog-list-error')).toContainText('暂时无法读取目录')
  const retry = page.getByTestId('quotation-catalog-list-retry')
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(page.getByTestId('quotation-catalog-list-error')).toContainText('暂时无法读取目录')
  await captureFocusedViewport(page, 'quotation-catalog-list-error', 'b07-catalog-retryable-error-390.png')
  await expectNoRuntimeOrNetworkErrors(diagnostics)
})
