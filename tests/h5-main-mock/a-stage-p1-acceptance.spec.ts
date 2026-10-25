import { expect, test, type Page } from '@playwright/test'

/** A-P1: actual uni-app Main App, credential-free DEV data and zero external
 * requests. The two special rows are opt-in so the approved 12-row baseline
 * and other screenshot suites are never silently changed. */
test.describe('A-stage P1 real-H5 operator acceptance', () => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true',
    'Run only with the explicit 020/021 synthetic QA fixture enabled.')

  let external: string[]
  let errors: string[]
  test.beforeEach(async ({ page }) => {
    external = []
    errors = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
    })
  })
  test.afterEach(() => {
    expect(external, 'No attempt to reach Production or another external origin').toEqual([])
    expect(errors, 'No browser console error or uncaught JS exception').toEqual([])
  })

  async function expectDetailOverviewWithinViewport(page: Page) {
    // WeChat DevTools found the 020/021 identifier and the last quick action
    // clipped at both operator widths. Guard the same geometry in real H5.
    const viewportWidth = page.viewportSize()?.width ?? 0
    for (const element of [page.getByTestId('ds02b-detail-record-card'),
      page.locator('.summary-number'), ...await page.locator('.summary-action').all()]) {
      const rect = await element.boundingBox()
      expect(rect, 'Detail overview control must be visible').not.toBeNull()
      expect(rect!.x, 'Detail overview must not overflow left').toBeGreaterThanOrEqual(-1)
      expect(rect!.x + rect!.width, 'Detail overview must not overflow right').toBeLessThanOrEqual(viewportWidth + 1)
    }
  }

  async function openSpecial(page: Page, number: '020' | '021') {
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await page.getByTestId('app-search-bar').locator('input').fill(`MOCK-${number}`)
    await page.locator('.search-button').click()
    const card = page.locator('.work-order-card').filter({ hasText: number === '020'
      ? '多表单本机草稿走查' : '重复表单本机草稿走查' })
    await expect(card).toBeVisible()
    await card.click()
    await expect(page).toHaveURL(/pages\/work-orders\/detail/)
    await expect(page.locator('.summary-number')).toContainText(number)
    await expectDetailOverviewWithinViewport(page)
    await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
    await expect(page.getByTestId('a-stage-special-panel')).toContainText('未提交后台')
    await expect(page.getByTestId('a-special-task-state')).toContainText('正在填写')
  }

  async function open019Quotation(page: Page) {
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('mock-continuous-journey-entry').click()
    await page.locator('.action-content-field--note textarea').fill('阶段 A 移动端：平屋顶预约')
    await page.getByTestId('mock-journey-advance').click()
    await expect(page).toHaveURL(/work-orders\/detail/)
    await page.locator('.primary-task-action').click()
    const repairPart = page.getByTestId('survey-part-picker-trigger')
    await expect(repairPart).toBeVisible()
    await repairPart.click()
    await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
    await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
    await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
    await page.getByTestId('survey-part-picker-confirm').click()
    await expect(page.getByTestId('dynamic-field-squareMeter')).toBeVisible()
    await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('12')
    await page.getByTestId('mock-journey-advance').click()
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('a-stage-mock-order-panel')).toBeVisible()
  }

  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    test(`020 forms: save/edit/remove/finalize/reload @${viewport.width}`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await openSpecial(page, '020')
      await page.getByTestId('a-stage-special-panel').locator('textarea').fill('平屋顶第一条勘察记录')
      await page.getByTestId('a-special-save').click()
      const row = page.getByTestId('a-special-row-mock-special-form-data-forms-1')
      await expect(row).toContainText('平屋顶第一条勘察记录')
      await info.attach(`a-p1-forms-saved-${viewport.width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
      await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
      await page.getByTestId('a-stage-special-panel').locator('textarea').fill('女儿墙根部复核记录')
      await page.getByTestId('a-special-save').click()
      await expect(row).toContainText('女儿墙根部复核记录')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(row).toContainText('女儿墙根部复核记录')
      await page.getByTestId('a-special-delete-mock-special-form-data-forms-1').click()
      await page.getByTestId('a-special-confirm-delete-mock-special-form-data-forms-1').click()
      await expect(row).toContainText('已删除')
      await page.getByTestId('a-special-finish-request').click()
      await page.getByTestId('a-special-finish-confirm').click()
      await expect(page.getByTestId('a-special-complete')).toBeVisible()
      await expectDetailOverviewWithinViewport(page)
      await info.attach(`a-p1-forms-complete-${viewport.width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    })

    test(`021 repeat: independent saves/remove/batch finalize @${viewport.width}`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await openSpecial(page, '021')
      const entry = page.getByTestId('a-stage-special-panel').locator('textarea')
      await entry.fill('第一轮现场检查')
      await page.getByTestId('a-special-save').click()
      await expect(page.getByTestId('a-special-row-mock-special-form-data-repeat-1'))
        .toContainText('第一轮现场检查')
      await entry.fill('第二轮现场检查')
      await page.getByTestId('a-special-save').click()
      const first = page.getByTestId('a-special-row-mock-special-form-data-repeat-1')
      await expect(page.getByTestId('a-special-row-mock-special-form-data-repeat-2'))
        .toContainText('第二轮现场检查')
      await page.getByTestId('a-special-delete-mock-special-form-data-repeat-1').click()
      await page.getByTestId('a-special-confirm-delete-mock-special-form-data-repeat-1').click()
      await expect(first).toHaveCount(0)
      await page.getByTestId('a-special-finish-request').click()
      await page.getByTestId('a-special-finish-confirm').click()
      await expect(page.getByTestId('a-special-complete')).toBeVisible()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('a-special-complete')).toBeVisible()
      await expectDetailOverviewWithinViewport(page)
      await info.attach(`a-p1-repeat-complete-${viewport.width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    })

    test(`019 priced quotation: double-confirmed Mock Order/reload @${viewport.width}`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await open019Quotation(page)
      await page.getByTestId('quotation-add-group').click()
      await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
      await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').filter({ hasText: '屋面' }).click()
      await page.getByTestId('quotation-first-step-description').locator('textarea').fill('平屋顶局部修缮')
      await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
      await page.getByTestId('quotation-first-step-select-products').click()
      await page.getByTestId('quotation-catalog-kind-material').click()
      await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-ordinary-1').click()
      await page.getByTestId('quotation-browse-quotation-group-1').click()
      await page.getByTestId('quotation-catalog-kind-procedure').click()
      await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
      const panel = page.getByTestId('a-stage-mock-order-panel')
      await expect(panel).toContainText('¥ 107.00')
      await expect(page.getByTestId('a-stage-order-create')).toBeEnabled()
      await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
      await info.attach(`a-p1-quotation-ready-${viewport.width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
      await page.getByTestId('a-stage-order-create').click()
      await page.getByTestId('a-stage-order-confirm').click()
      await expect(page.getByTestId('a-stage-order-readback')).toBeVisible()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-order-mock-official-order-019-protocol'))
        .toContainText('本机 Mock 订单')
      await page.getByTestId('quotation-hub-start-new').click()
      await expect(page.getByTestId('a-stage-order-readback')).toBeVisible()
      await expect(page.getByTestId('a-stage-order-create')).toHaveCount(0)
      await expect(page.getByText('订单已提交并完成服务器核对。')).toHaveCount(0)
      await info.attach(`a-p1-order-readback-${viewport.width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    })
  }
})
