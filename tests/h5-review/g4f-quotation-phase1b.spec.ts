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

async function openPackageConfigurationFromEditableGroup(page: Page): Promise<void> {
  await openScenario(page, 'empty')
  await page.getByTestId('quotation-add-group').click()
  await page.getByText('屋面', { exact: true }).click()
  await page.getByTestId('quotation-browse-quotation-group-1-package').click()
  await expect(page.getByTestId('quotation-catalog-sheet')).toBeVisible()
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
  await expect(page.getByTestId('quotation-draft-empty')).toContainText('还没有维修部位组')
  await expect(page.getByTestId('quotation-add-group')).toBeVisible()
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await page.getByTestId('quotation-draft-empty').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '01-empty-draft.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1F browses all catalog kinds and explicitly adds only direct selections to the opened repair group', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await mkdir(output, { recursive: true })
  await openScenario(page, 'empty')
  await page.getByTestId('quotation-add-group').click()
  await page.getByText('屋面', { exact: true }).click()
  const groupId = 'quotation-group-1'
  let selectionCount = 0
  for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
    await page.getByTestId(`quotation-browse-${groupId}-${kind}`).click()
    await expect(page.getByTestId('quotation-catalog-sheet')).toBeVisible()
    await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
    const labels = {
      package: 'Mock 服务方案 A',
      procedure: 'Mock 施工工序 A',
      material: 'Mock 材料 A',
      measure: 'Mock 机措 A',
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
    await expect(page.getByTestId('quotation-catalog-sheet')).toHaveCount(0)
    await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(selectionCount)
    await expect(page.getByTestId(`quotation-group-section-${groupId}-${kind}`)).toContainText(labels[kind])
  }
  await page.getByTestId('quotation-draft-groups').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, '02-grouped-draft-direct-selections.png'), animations: 'disabled' })
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await expect(page.getByTestId('dynamic-form-save')).toHaveCount(0)
  await expectSafe(page, diagnostics)
})

test('isolated Phase 1B review harness keeps blocked local preview separate from real Order submission', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openScenario(page, 'empty')
  await page.getByTestId('quotation-add-group').click()
  await page.getByText('屋面', { exact: true }).click()
  const groupId = 'quotation-group-1'

  for (const kind of ['procedure', 'material'] as const) {
    await page.getByTestId(`quotation-browse-${groupId}-${kind}`).click()
    await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
    const itemId = kind === 'procedure' ? 'mock-catalog-procedure-seal' : 'mock-catalog-material-sealant'
    await page.getByTestId(`quotation-catalog-add-${kind}-${itemId}`).click()
  }

  await page.getByTestId(`quotation-group-description-${groupId}`).locator('textarea').fill('合成测试部位描述')
  await page.getByTestId(`quotation-group-quantity-${groupId}`).locator('input').fill('12.5')
  await expect(page.getByTestId('quotation-engine-blocked')).toContainText('指导单价缺失')
  await expect(page.getByTestId('quotation-engine-blocked')).toContainText('材料单价缺失')
  await expect(page.getByTestId('quotation-engine-local-only')).toContainText('只有单独确认')
  await expect(page.getByTestId('quotation-engine-local-only')).toContainText('不会完成当前工单工作流')
  await expect(page.getByTestId('quotation-local-gross-total')).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
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
  await expect(page.getByTestId('quotation-catalog-sheet')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-kind-package')).toBeVisible()
  await expect(page.getByTestId('quotation-catalog-item-package-mock-catalog-package-basic')).toContainText('Mock 服务方案 A')
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  await expect(page.getByTestId('quotation-package-detail')).toContainText('配置后只会保存在目标维修部位组的本机草稿中')
  await expect(page.getByTestId('quotation-material-layer-string:mock-layer-1')).toContainText('Mock 材料 A')
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(0)
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await page.getByTestId('quotation-catalog-sheet').screenshot({ path: resolve(output, '03-catalog-detail-readonly.png'), animations: 'disabled' })
  await expectSafe(page, diagnostics)
})

test('Phase 1G configures a Package locally after exactly one Material is chosen per supplied layer', async ({ page }) => {
  const diagnostics = await installSafetyGuards(page)
  await openPackageConfigurationFromEditableGroup(page)
  await expect(page.getByTestId('quotation-package-detail')).toContainText('目标维修部位组的本机草稿')
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
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)

  await commit.click()
  await expect(page.getByTestId('quotation-catalog-sheet')).toHaveCount(0)
  const configured = page.getByTestId('quotation-configured-package-quotation-selection-1')
  await expect(page.getByText('Mock 服务方案 A', { exact: true })).toBeVisible()
  await expect(configured).toContainText('Mock 施工工序 A')
  await expect(configured).toContainText('Mock 材料 A')
  await expect(configured).toContainText('Mock 材料 B（数值层）')
  await expect(configured).toContainText('Mock 机措 A')
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
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
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
