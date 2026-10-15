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
      // Actual S2 UX: keep DEV upstream data available, but folded so the
      // commercial dynamic form is not buried below diagnostic prose.
      await expect(page.getByTestId('mock-journey-context-toggle')).toBeVisible()
      await expect(page.getByTestId('mock-journey-context-appointment')).toBeHidden()
      await page.getByTestId('mock-journey-context-toggle').click()
      await expect(page.getByTestId('mock-journey-context-appointment')).toBeVisible()
      await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('S2审查')
      await page.getByTestId('mock-journey-context-toggle').click()
      await expect(page.getByTestId('mock-journey-context-appointment')).toBeHidden()
      // Scroll back to the task header: previous DEV-context expansion
      // must not turn the S01 overview into a screenshot of the page tail.
      await page.getByTestId('action-workspace-context').scrollIntoViewIfNeeded()
      const surveyAction = await page.getByTestId('action-workspace-submit').boundingBox()
      expect(surveyAction, 'Survey must keep its fixed completion bar visible').not.toBeNull()
      expect(surveyAction!.y + surveyAction!.height, 'Survey completion button must fit within mobile H5 viewport')
        .toBeLessThanOrEqual(viewport.height)
      // Dependent fields become available AFTER selecting a repair part,
      // so capture the genuine initial Survey first, not a fabricated state.
      await capture('03-survey-overview', 'S', '现场勘察', '动态字段与页面结构')

      const parts = page.getByTestId('survey-part-picker-trigger')
      if (await parts.isVisible()) {
        await parts.click()
        await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
        const parentColumn = await page.getByTestId('survey-repair-part-parents').boundingBox()
        const childColumn = await page.getByTestId('survey-repair-part-children').boundingBox()
        expect(parentColumn, 'S02 category column is visible').not.toBeNull()
        expect(childColumn, 'S02 subcategory column is visible').not.toBeNull()
        expect(childColumn!.x, 'S02 must place children to the right of their parents')
          .toBeGreaterThan(parentColumn!.x + parentColumn!.width - 2)
        expect(childColumn!.y, 'S02 two columns must start at the same vertical level')
          .toBeLessThanOrEqual(parentColumn!.y + 35)
        await capture('03-survey-parts', 'S', 'S02 维修部位', '底部级联选择')
        await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
        await expect(page.getByTestId('survey-repair-part-children')).toBeVisible()
        const firstChild = page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first()
        await firstChild.click()
        await expect(firstChild.locator('.app-cascade-selector__choice-indicator--selected')).toBeVisible()
        await expect(page.getByTestId('survey-part-picker-current')).not.toContainText('尚未选择')
        await capture('03-survey-parts-selected', 'S', 'S02 维修部位已选', '单选反馈、当前路径与确认操作')
        await page.getByTestId('survey-part-picker-confirm').click()
        await expect(page.getByTestId('survey-part-picker-panel')).toHaveCount(0)
      }
      await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('14.5')
      await expect(page.getByTestId('survey-part-section')).toBeVisible()
      await expect(page.getByTestId('survey-measure-section')).toBeVisible()
      await expect(page.getByTestId('survey-media-section').first()).toBeVisible()
      await expect(page.getByTestId('survey-media-section').first().locator('.dynamic-action-block__title')).toContainText('现场照片')
      // Adjacent fields are one business photo section, not separate outer cards.
      const mediaFields = page.getByTestId('survey-media-section').first().locator('.dynamic-action-field--survey-media')
      expect(await mediaFields.count()).toBeGreaterThanOrEqual(2)
      const firstMedia = await mediaFields.nth(0).boundingBox()
      const secondMedia = await mediaFields.nth(1).boundingBox()
      expect(firstMedia).not.toBeNull()
      expect(secondMedia).not.toBeNull()
      expect(Math.abs(firstMedia!.y - secondMedia!.y), 'photo fields share one visual row').toBeLessThanOrEqual(4)
      await capture('04-survey-filled', 'S', '勘察填写状态', '部位/面积与操作层级')
      const mediaPanel = page.locator('.dynamic-action-media').first()
      await expect(mediaPanel).toBeVisible()
      // FormDef may model a photo-bearing field as file rather than image.
      // The capture audits the actual media UI, not a hardcoded media type.
      await expect(mediaPanel.locator('.dynamic-action-media-title')).toContainText('拍摄或上传')
      await expect(mediaPanel.locator('.dynamic-action-media-grid')).toBeVisible()
      await mediaPanel.scrollIntoViewIfNeeded()
      await capture('04-survey-media', 'S', '勘察媒体', '主表单直接上传与查看状态')
      const reason = page.getByTestId('survey-leakage-cause-trigger')
      await expect(reason).toBeVisible()
      await reason.click()
      await expect(page.getByTestId('survey-leakage-cause-panel')).toBeVisible()
      await expect(page.getByTestId('survey-leakage-cause-options')).toBeVisible()
      await capture('04-survey-reasons', 'S', 'S03 渗漏原因', '分类多选，返回表单')
      const firstCause = page.getByTestId('survey-leakage-cause-option').first()
      await firstCause.click()
      await expect(firstCause).toHaveClass(/survey-leakage-cause__option--selected/)
      await expect(page.getByTestId('survey-leakage-cause-selected')).toContainText('已选 1 项')
      await expect(page.locator('.survey-leakage-cause__chip')).toHaveCount(1)
      await capture('04-survey-reasons-selected', 'S', 'S03 渗漏原因已选', '真实分组多选状态反馈')
      // Cancel must not write provisional choice into the underlying Form Runtime.
      await page.locator('.survey-leakage-cause__close').click()
      await expect(reason).toContainText('请选择渗漏原因')
      await reason.click()
      await expect(page.getByTestId('survey-leakage-cause-panel')).toBeVisible()
      await expect(page.getByTestId('survey-leakage-cause-selected')).toContainText('已选 0 项')
      await page.getByTestId('survey-leakage-cause-option').first().click()
      await page.locator('.survey-leakage-cause__done').click()
      await expect(reason).toContainText('已选择 1 项')
      await page.getByTestId('mock-journey-advance').click()

      await expect(page).toHaveURL(/pages\/work-orders\/detail/)
      await expect(page.locator('.current-task-card')).toContainText('报价')
      await page.locator('.primary-task-action').click()
      await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-create-unverified')).toBeEnabled()
      await capture('05-quote-orders', 'Q', 'Q00 订单读取失败', '当前源未返回可核验的服务器订单')
      // Real uni-app UI with explicitly labelled DEV-only view data.
      // Never assert these records came from the provider read port.
      await page.goto(page.url() + '&q00Preview=empty', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('quotation-hub-design-sample')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-no-records')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-empty-create')).toBeEnabled()
      await capture('05-quote-orders-empty', 'Q', 'Q00 无订单空状态', '明确标注合成数据的空状态视觉评审')
      await page.goto(page.url().replace('q00Preview=empty', 'q00Preview=orders'), { waitUntil: 'domcontentloaded' })
      // Changing only the hash query can reuse the same uni-app page instance.
      // Reload so onLoad consumes the exact new DEV preview option.
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('quotation-hub-design-sample')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-records')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-records').locator('.quotation-hub__order')).toHaveCount(2)
      await capture('05-quote-orders-sample', 'Q', 'Q00 已有订单', '明确标注合成数据的多订单列表视觉评审')
      await page.getByTestId('quotation-hub-add-inline').click()
      await expect(page.getByTestId('quotation-hub-mode')).toBeVisible()
      await expect(page.getByText('基于已有订单复制')).toBeVisible()
      await capture('05-quote-order-method', 'Q', 'Q00 选择下单方式', '只允许新建；不具备契约的复制能力明确禁用')
      await page.getByTestId('quotation-hub-mode-next').click()
      await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
      await expect(page.getByTestId('mock-journey-context-survey')).toContainText('14.5')
      await expect(page.getByTestId('mock-journey-context-survey')).toBeHidden()
      await expect(page.getByTestId('mock-survey-quote-adopt')).toBeVisible()
      // Q01: compact preceding DEV data without hiding provenance or the adopt control.
      await expect(page.locator('.journey-context--task-focus')).toBeVisible()
      await expect(page.locator('.journey-context--task-focus')).toContainText('未提交后台')
      await expect(page.locator('.journey-context__focus-suggestion')).toBeVisible()
      await expect(page.locator('.journey-context__focus-suggestion')).toContainText('屋面 / 有保护平屋面')
      await expect(page.getByTestId('mock-journey-context-survey')).toBeHidden()
      const firstAction = await page.getByTestId('quotation-add-group').boundingBox()
      const taskFooter = await page.getByTestId('quotation-footer-summary').boundingBox()
      expect(firstAction, 'quote add-repair-part action must be visible').not.toBeNull()
      expect(taskFooter, 'quote safety footer must remain visible').not.toBeNull()
      expect(firstAction!.height, 'quote primary task target must be at least 44px high').toBeGreaterThanOrEqual(44)
      expect(firstAction!.y + firstAction!.height, 'primary task must be above footer').toBeLessThan(taskFooter!.y)
      const quote = await page.getByTestId('quotation-action-content').boundingBox()
      const nextStage = await page.getByTestId('mock-journey-signing-review').boundingBox()
      expect(quote).not.toBeNull()
      expect(nextStage).not.toBeNull()
      expect(nextStage!.y).toBeGreaterThan(quote!.y)
      await capture('05-quote-entry', 'Q', '报价工作台', '首次进入与工单上下文')
      await expect(page.getByTestId('quotation-quote-process')).toContainText('费用与优惠')
      await expect(page.getByTestId('quotation-submit-disabled-preview')).toBeDisabled()
      await expect(page.getByTestId('mock-survey-quote-adopt')).toBeVisible()
      await page.getByTestId('mock-survey-quote-adopt').click()
      await page.getByTestId('quotation-first-step-description').locator('textarea').fill('S2审查：屋面修缮报价')
      await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
      await expect(page.getByTestId('quotation-cost-adjustments')).toContainText('折扣')
      await expect(page.getByTestId('quotation-cost-adjustments')).toContainText('优惠金额')
      await page.getByTestId('quotation-first-repair-part-step').scrollIntoViewIfNeeded()
      await capture('05-quote-fields', 'Q', 'Q01 维修部位表单', '维修部位、描述、工程量、费用分组已标准化')
      await page.getByTestId('quotation-first-step-select-products').click()
      await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
      await page.getByTestId('quotation-catalog-kind-material').click()
      const ordinary = 'mock-catalog-material-ordinary-1'
      await expect(page.getByTestId('quotation-catalog-item-material-' + ordinary)).toBeVisible()
      // Category marks convey catalog type; faux generic product artwork
      // or decorative '示意' photos do not masquerade as real SKU assets.
      await expect(page.getByTestId('quotation-catalog-item-material-' + ordinary).locator('.quotation-content__catalog-thumbnail-mark')).toBeVisible()
      await expect(page.getByTestId('quotation-catalog-item-material-' + ordinary).locator('.quotation-content__catalog-art')).toHaveCount(0)
      await expect(page.getByTestId('quotation-material-options-' + ordinary)).toHaveCount(0)
      const addMaterial = page.getByTestId('quotation-catalog-add-material-' + ordinary)
      await expect(addMaterial).toBeEnabled()
      const addSize = await addMaterial.boundingBox()
      expect(addSize, 'catalog direct material CTA should have a usable tap target').not.toBeNull()
      expect(addSize!.height).toBeGreaterThanOrEqual(44)
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
      // The contract status card is below the fold on mobile. A screenshot
      // of the top developer-control buttons is NOT useful signing evidence.
      await page.getByTestId('signing-mock-contract').scrollIntoViewIfNeeded()
      await capture('09-signing-progress', 'C', '签署中', '实际滚动至合同状态区域')
      await page.getByTestId('signing-mock-scenario-expired').click()
      await expect(page.getByTestId('signing-mock-state')).toContainText('过期')
      await expect(page.getByTestId('signing-mock-apply-disabled')).toHaveAttribute('disabled', 'true')
      await page.getByTestId('signing-mock-contract').scrollIntoViewIfNeeded()
      await capture('10-signing-expired', 'C', '合同过期', '状态区域、禁用签约操作')

      // Actual commercial signing-read component, NOT the detached developer
      // status harness. This is a separate synthetic official Order fixture;
      // never promote a local quotation draft to a formal Order.
      await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
      await page.locator('.work-orders-entry').click()
      await page.locator('.search-input input').fill('04009')
      await page.locator('.search-button').click()
      await page.locator('.work-order-card').filter({ hasText: '演示客户乙' }).click()
      await expect(page.locator('.summary-number')).toContainText('04009')
      await page.evaluate(() => {
        const uni = (window as Window & {
          uni?: { navigateTo: (options: { url: string }) => void }
        }).uni
        if (!uni) throw new Error('Real uni-app navigation unavailable for signing review')
        uni.navigateTo({
          url: '/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=mock-official-order-001',
        })
      })
      await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
      await expect(page.getByTestId('signing-command-preflight-toggle')).toBeVisible()
      await expect(page.getByTestId('signing-command-preflight-details')).toBeHidden()
      await expect(page.getByTestId('signing-order-read-display-number'))
        .toContainText('DEV-SYNTHETIC-NOT-SUBMITTED')
      await expect(page.getByTestId('signing-contract-fixture-label')).toContainText('非真实订单')
      await capture('11-signing-actual-order', 'C', '签约只读工作台', '真正的主 App 订单核验页面')
      await page.getByTestId('signing-contract-read-request').click()
      await expect(page.getByTestId('signing-contract-matched')).toContainText('DEV-SYNTHETIC-CONTRACT')
      await expect(page.getByTestId('signing-read-stage-title')).toContainText('签约处理中')
      await page.getByTestId('signing-order-read-contract-status').scrollIntoViewIfNeeded()
      await capture('12-signing-actual-contract', 'C', '合同核验反馈', '来源受限且真实签约仍不可执行')

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
