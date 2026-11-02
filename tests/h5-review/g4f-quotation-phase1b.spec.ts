import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-ux-phase-b0/repair-part-step-v1/after/regression/phase1b')

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
  if (scenario === 'catalog' || scenario === 'catalog-empty' || scenario === 'catalog-error') {
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await completeFirstRepairPartContext(page, '屋面檐口修复', '18')
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await expect(page.getByTestId('quotation-catalog-browser')).toBeVisible()
    await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面檐口修复')
    return
  }
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  if (scenario === 'empty') {
    await expect(page.getByTestId('quotation-initial-empty-workbench')).toBeVisible()
  } else {
    // The draft workbench's authored header is scoped to local grouped editing;
    // the action-shell page title remains 报价工作台 on the commercial route.
    await expect(page.getByTestId('quotation-workbench-heading')).toContainText('报价草稿 · 按部位组织')
  }
  if (scenario !== 'empty') {
    await expect(page.getByTestId('quotation-workbench-summary')).toContainText('维修部位报价')
  }
}

async function completeFirstRepairPartContext(page: Page, description: string, quantity: string): Promise<void> {
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').getByRole('textbox').fill(description)
  await page.getByTestId('quotation-first-step-quantity').getByRole('spinbutton').fill(quantity)
  await page.getByTestId('quotation-first-step-select-products').click()
}

async function openCatalogForGroup(page: Page, groupId: string): Promise<void> {
  const catalogPage = page.getByTestId('quotation-catalog-page')
  if (await catalogPage.isVisible()) return

  const firstPartStepAction = page.getByTestId('quotation-first-step-select-products')
  if (await firstPartStepAction.isVisible()) {
    await firstPartStepAction.click()
  } else {
    await page.getByTestId(`quotation-browse-${groupId}`).click()
  }
  await expect(catalogPage).toBeVisible()
}

async function openCatalogKind(page: Page, groupId: string, kind: 'package' | 'procedure' | 'material' | 'measure'): Promise<void> {
  await openCatalogForGroup(page, groupId)
  await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
}

async function openPackageConfigurationFromEditableGroup(page: Page): Promise<void> {
  await openScenario(page, 'empty')
  await page.getByTestId('quotation-add-group').click()
  await completeFirstRepairPartContext(page, '屋面配置测试', '18')
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-detail')).toBeVisible()
}

async function expectSafe(page: Page, diagnostics: Awaited<ReturnType<typeof installSafetyGuards>>): Promise<void> {
  expect(diagnostics.pageErrors, 'pageerror output').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect(diagnostics.externalRequests, 'unexpected non-local network requests').toEqual([])
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(width.scroll, 'review viewport must not horizontally overflow').toBeLessThanOrEqual(width.viewport)
}

test('Phase 1D empty quotation draft starts from a repair-part group', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'empty')
  await expect(page.getByTestId('g4f-review-scenario-selector')).toBeVisible()
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toContainText('请选择维修部位')
  await expect(page.getByTestId('quotation-add-group')).toBeVisible()
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  await page.getByTestId('quotation-initial-empty-workbench').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '01-empty-draft.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1F browses all catalog kinds and explicitly adds only direct selections to the opened repair group', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'empty')
  await page.getByTestId('quotation-add-group').click()
  await completeFirstRepairPartContext(page, '屋面檐口修复', '18')
  const groupId = 'quotation-group-1'
  let selectionCount = 0
  for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
    await openCatalogForGroup(page, groupId)
    await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
    const labels = {
      package: '平屋面节点防水维修套餐',
      procedure: '檐口与泛水节点密封处理',
      material: '聚氨酯建筑密封胶',
      measure: '高处作业安全防护',
    } as const
    await expect(page.getByTestId('quotation-catalog-list')).toContainText(labels[kind])
    await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(selectionCount)
    if (kind === 'package') {
      await expect(page.getByTestId('quotation-catalog-add-package-mock-catalog-package-basic')).toHaveCount(0)
      await expect(page.getByTestId('quotation-package-detail-mock-catalog-package-basic')).toBeVisible()
      await page.getByTestId('quotation-catalog-close').click()
      continue
    }
    const catalogIds = {
      procedure: 'mock-catalog-procedure-seal',
      material: 'mock-catalog-material-sealant',
      measure: 'mock-catalog-measure-inspection',
    } as const
    const itemId = catalogIds[kind]
    await expect(page.getByTestId(`quotation-catalog-add-${kind}-${itemId}`)).toBeEnabled()
    await page.getByTestId(`quotation-catalog-add-${kind}-${itemId}`).click()
    selectionCount += 1
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(selectionCount)
    await expect(page.getByTestId(`quotation-group-section-${groupId}-${kind}`)).toContainText(labels[kind])
  }
  await page.getByTestId('quotation-draft-groups').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '02-grouped-draft-direct-selections.png'), animations: 'disabled' })
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('dynamic-form-save')).toHaveCount(0)
  await expectSafe(page, diagnostics)
})

test('isolated Phase 1B review harness keeps blocked local preview separate from real Order submission', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openScenario(page, 'empty')
  await page.getByTestId('quotation-add-group').click()
  await completeFirstRepairPartContext(page, '屋面局部修复', '12.5')
  const groupId = 'quotation-group-1'

  for (const kind of ['procedure', 'material'] as const) {
    await openCatalogKind(page, groupId, kind)
    const itemId = kind === 'procedure' ? 'mock-catalog-procedure-seal' : 'mock-catalog-material-sealant'
    await page.getByTestId(`quotation-catalog-add-${kind}-${itemId}`).click()
  }

  await page.getByTestId(`quotation-group-description-${groupId}`).locator('textarea').fill('合成测试部位描述')
  await page.getByTestId(`quotation-group-quantity-${groupId}`).locator('input').fill('12.5')
  await expect(page.getByTestId('quotation-engine-blocked')).toContainText('材料单价缺失')
  await expect(page.getByTestId('quotation-engine-local-only')).toContainText('只有确认提交后')
  await expect(page.getByTestId('quotation-engine-local-only')).toContainText('报价提交不代表工单完成')
  await expect(page.getByTestId('quotation-local-gross-total')).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('quotation-order-confirmation')).toHaveCount(0)
  await expect(page.getByTestId('dynamic-form-save')).toHaveCount(0)
  await page.getByTestId('quotation-engine-readiness').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '04-engine-blocked-source-prices.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1E package detail displays only observed child data grouped by supplied material layer', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'catalog')
  await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-kind-package')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('平屋面节点防水维修套餐')
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-detail')).toContainText('选择材料后确认加入当前维修部位组，尚未提交正式报价')
  await expect(page.getByTestId('quotation-package-detail')).toContainText('0/2 个材料层级已选')
  await expect(page.getByTestId('quotation-material-layer-string:mock-layer-1')).toContainText('材料层级 1')
  await expect(page.getByTestId('quotation-material-layer-string:mock-layer-1')).not.toContainText('mock-layer-1')
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(0)
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  await page.getByTestId('quotation-catalog-page').screenshot({ path: resolve(output, '03-catalog-detail-readonly.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1G configures a Package locally after exactly one Material is chosen per supplied layer', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openPackageConfigurationFromEditableGroup(page)
  await expect(page.getByTestId('quotation-package-detail')).toContainText('选择材料后确认加入当前维修部位组，尚未提交正式报价')
  await expect(page.getByTestId('quotation-package-detail')).toContainText('0/2 个材料层级已选')
  await expect(page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0')).toBeEnabled()
  await expect(page.getByTestId('quotation-package-material-choice-number:2-0')).toBeEnabled()

  const commit = page.getByTestId('quotation-package-configure-commit')
  // uni-app H5 renders this shared AppButton as a <uni-button> custom element,
  // so Playwright's native-button disabled matcher does not apply. Assert the
  // platform-rendered disabled attribute directly.
  await expect(commit).toHaveAttribute('disabled', 'true')
  await page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0').click()
  await expect(commit).toHaveAttribute('disabled', 'true')
  await page.getByTestId('quotation-package-material-choice-number:2-0').click()
  await expect(commit).not.toHaveAttribute('disabled')
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')

  await commit.click()
  await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
  const configured = page.getByTestId('quotation-configured-package-quotation-selection-1')
  await expect(page.getByText('平屋面节点防水维修套餐', { exact: true })).toBeVisible()
  await expect(configured).toContainText('1 项工序 · 2 项材料 · 1 项机措')
  await expect(configured).toContainText('金额关系待核验')
  await expect(configured).not.toContainText('材料层级 1')
  await page.getByTestId('quotation-package-details-toggle-quotation-selection-1').click()
  await expect(configured).toContainText('檐口与泛水节点密封处理')
  await expect(configured).toContainText('聚氨酯建筑密封胶')
  await expect(configured).toContainText('基层界面处理涂料')
  await expect(configured).toContainText('高处作业安全防护')
  await expect(configured).toContainText('金额关系待核验')
  await expect(configured).toContainText('材料层级 1')
  await expect(configured).not.toContainText('mock-layer-1')
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(1)
  await expectSafe(page, diagnostics)
})

test('Phase 1G blocks local Package commit until all layers are configured', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openPackageConfigurationFromEditableGroup(page)
  const commit = page.getByTestId('quotation-package-configure-commit')
  await expect(commit).toHaveAttribute('disabled', 'true')
  await page.getByTestId('quotation-package-material-choice-string:mock-layer-1-0').click()
  await expect(commit).toHaveAttribute('disabled', 'true')
  await commit.click()
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(0)
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  await expectSafe(page, diagnostics)
})

test('Phase 1D restores grouped drafts and preserves legacy flat drafts for explicit handling', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openScenario(page, 'populated')
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(4)
  await openScenario(page, 'restored')
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(4)
  await expect(page.getByText('已恢复本地报价分组草稿。')).toBeVisible()
  await expectSafe(page, diagnostics)

  await page.goto('/?scenario=invalid', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('quotation-draft-invalid')).toBeVisible()
  await expect(page.getByTestId('quotation-add-group')).toHaveCount(0)
  await page.goto('/?scenario=legacy', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('quotation-draft-legacy')).toContainText('不会自动迁移、覆盖或清除')
  await expect(page.getByTestId('quotation-add-group')).toHaveCount(0)
  await expectSafe(page, diagnostics)
})
