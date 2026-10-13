import { expect, test, type Page } from '@playwright/test'
import { captureReviewFrame, finishReviewSession, type ReviewSession } from './review-sheet'

type Audit = {
  external: string[]
  localHttpFailures: string[]
  pageErrors: string[]
  consoleErrors: string[]
}

/** A source-backed rendered H5 screenshot is NOT a Production business record. */
async function installNoNetworkGuard(page: Page): Promise<Audit> {
  const evidence: Audit = { external: [], localHttpFailures: [], pageErrors: [], consoleErrors: [] }
  page.on('pageerror', error => evidence.pageErrors.push(error.name))
  page.on('console', msg => {
    if (msg.type() === 'error') evidence.consoleErrors.push(msg.text().slice(0, 120))
  })
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.origin === 'http://localhost:5174' && response.status() >= 400) {
      evidence.localHttpFailures.push(response.status() + ' ' + url.pathname)
    }
  })
  // No silent external requests, including failed attempts. No cookies,
  // tokens, request payloads, API responses, or real account data.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    evidence.external.push(route.request().method() + ' ' + url.origin + url.pathname)
    await route.abort('blockedbyclient')
  })
  return evidence
}

function assertSafe(evidence: Audit): void {
  expect(evidence.external, 'even a blocked Production request is a capture failure').toEqual([])
  expect(evidence.localHttpFailures).toEqual([])
  expect(evidence.pageErrors).toEqual([])
  expect(evidence.consoleErrors).toEqual([])
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test('S2 actual main-App mobile UX Review Sheet / ' + viewport.width, async ({ page, browser }, info) => {
    await page.setViewportSize(viewport)
    const audit = await installNoNetworkGuard(page)
    const session: ReviewSession = { viewport, frames: [] }
    const capture = async (
      id: string, stage: 'W' | 'A' | 'S' | 'Q' | 'C',
      label: string, description: string,
      status: 'accepted_baseline' | 'review_candidate' = 'review_candidate',
    ) => {
      assertSafe(audit)
      await captureReviewFrame(page, session, { id, stage, label, description, status })
    }

    try {
      // Already accepted W/A are shown only as visual reference, NOT redesigned.
      await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.home-page')).toBeVisible()
      await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
      await page.locator('.work-orders-entry').click()
      await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
      await expect(page.locator('.work-order-card').first()).toBeVisible()
      await capture('01-work-orders', 'W', '工单列表', '既有商业化基线', 'accepted_baseline')

      await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('mock-continuous-journey-entry')).toContainText('MOCK-019')
      await page.getByTestId('mock-continuous-journey-entry').click()
      await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
      await expect(page.locator('.action-content-title')).toContainText('预约信息')
      await capture('02-appointment', 'A', '预约上门', '用户认可的交互样板', 'accepted_baseline')
      await page.locator('.action-content-field--note textarea').fill('S2审查：屋面维修')
      await page.getByTestId('mock-journey-advance').click()

      await expect(page).toHaveURL(/pages\/work-orders\/detail/)
      await expect(page.locator('.summary-number')).toContainText('MOCK-019')
      await expect(page.locator('.current-task-card')).toContainText('现场勘察')
      await page.locator('.primary-task-action').click()
      await expect(page.locator('.uni-page-head__title')).toContainText('现场勘查')
      await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
      // Dependent fields become available AFTER selecting a repair part,
      // so capture the genuine initial Survey first, not a fabricated state.
      await capture('03-survey-overview', 'S', '现场勘察', '动态字段与页面结构')

      const parts = page.getByTestId('survey-repair-part-selector')
      if (await parts.isVisible()) {
        await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
        await expect(page.getByTestId('survey-repair-part-children')).toBeVisible()
        await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
      }
      await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('14.5')
      await capture('04-survey-filled', 'S', '勘察填写状态', '部位/面积与操作层级')
      await page.getByTestId('mock-journey-advance').click()

      await expect(page).toHaveURL(/pages\/work-orders\/detail/)
      await expect(page.locator('.current-task-card')).toContainText('报价')
      await page.locator('.primary-task-action').click()
      await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
      await expect(page.getByTestId('mock-journey-context-survey')).toContainText('14.5')
      await capture('05-quote-entry', 'Q', '报价工作台', '首次进入与工单上下文')
      await expect(page.getByTestId('mock-survey-quote-adopt')).toBeVisible()
      await page.getByTestId('mock-survey-quote-adopt').click()
      await page.getByTestId('quotation-first-step-description').locator('textarea').fill('S2审查：屋面修缮报价')
      await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
      await page.getByTestId('quotation-first-step-select-products').click()
      await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
      await page.getByTestId('quotation-catalog-kind-material').click()
      const ordinary = 'mock-catalog-material-ordinary-1'
      await expect(page.getByTestId('quotation-catalog-item-material-' + ordinary)).toBeVisible()
      await expect(page.getByTestId('quotation-material-options-' + ordinary)).toHaveCount(0)
      await capture('06-quote-catalog', 'Q', '报价材料目录', '普通材料无需 SKU 的真实结构')

      await page.getByTestId('quotation-catalog-add-material-' + ordinary).click()
      await expect(page.getByTestId('quotation-group-section-quotation-group-1-material'))
        .toContainText('普通防水辅材（结构示例）')
      await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
      await capture('07-quote-group', 'Q', '报价分组', '已选普通材料、提交仍受限')

      await expect(page.getByTestId('mock-journey-signing-review')).toBeVisible()
      await page.getByTestId('mock-journey-signing-review').click()
      await expect(page.getByTestId('signing-mock-workbench')).toBeVisible()
      await expect(page.getByTestId('signing-mock-no-contract')).toBeVisible()
      await capture('08-signing-empty', 'C', '签约合同空态', '独立正式订单样本；无真实合同')
      await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()
      await expect(page.getByTestId('signing-mock-state')).toContainText('签署中')
      await capture('09-signing-progress', 'C', '签署中', '合同状态与不可执行操作')
      await page.getByTestId('signing-mock-scenario-expired').click()
      await expect(page.getByTestId('signing-mock-state')).toContainText('过期')
      await expect(page.getByTestId('signing-mock-apply-disabled')).toHaveAttribute('disabled', 'true')
      await capture('10-signing-expired', 'C', '合同过期', '异常态，无业务写入及盲重试')

      assertSafe(audit)
      const output = await finishReviewSession(browser, session)
      await info.attach('s2-review-manifest', {
        body: Buffer.from(JSON.stringify({
          viewport, scenes: session.frames.map(f => f.id),
          evidence: 'DEV_MOCK_ONLY', generatedPath: output,
          externalIntentCount: audit.external.length,
          businessWriteCount: 0, productionReadCount: 0,
        }, null, 2)),
        contentType: 'application/json',
      })
    } finally {
      await info.attach('s2-capture-safety-evidence', {
        body: Buffer.from(JSON.stringify({
          ...audit, capturedFrames: session.frames.map(f => f.id),
          result: info.status, workOrder: 'MOCK-019',
          actualOrderCreated: false, actualSigningTriggered: false,
        }, null, 2)),
        contentType: 'application/json',
      })
    }
  })
}
