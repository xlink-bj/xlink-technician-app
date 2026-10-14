import { expect, test } from '@playwright/test'

/**
 * I7 candidate: REAL main App navigation, credential-free DEV Mock fixtures.
 * The login is a synthetic authenticated shell; a quotation draft is NEVER
 * converted to a type=1 Order and signing is a separate synthetic review.
 */
for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test('I7 six-stage synthetic navigation / work-order isolation at ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const forbidden: string[] = []
    const failedLocal: string[] = []
    let pageErrors = 0
    let consoleErrors = 0
    page.on('pageerror', () => { pageErrors += 1 })
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors += 1 })
    page.on('response', res => {
      if (res.status() >= 400 && new URL(res.url()).origin === 'http://localhost:5174') {
        failedLocal.push(res.status() + ' ' + new URL(res.url()).pathname)
      }
    })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') {
        await route.continue()
        return
      }
      forbidden.push(route.request().method() + ' ' + url.origin + url.pathname)
      await route.abort('blockedbyclient')
    })
    const assertNoNetwork = () => {
      expect(forbidden, 'even attempted business reads/writes are forbidden in this CI').toEqual([])
      expect(failedLocal).toEqual([])
      expect(pageErrors).toBe(0)
      expect(consoleErrors).toBe(0)
    }

    // 1. Synthetic authenticated shell → 2. Normal role-scoped WorkOrder list.
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
    await page.locator('.search-input input').fill('MOCK-018')
    await page.locator('.search-button').click()
    const otherWorkOrder = page.locator('.work-order-card').filter({ hasText: '演示报价工单' })
    await expect(otherWorkOrder).toBeVisible()
    await otherWorkOrder.click()
    await expect(page).toHaveURL(/pages\/work-orders\/detail/)
    await expect(page.locator('.summary-number')).toContainText('MOCK-018')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-start-new')).toBeEnabled()
    await page.getByTestId('quotation-hub-start-new').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
    await expect(page).not.toHaveURL(/mock-work-order-019-continuous-journey/)
    await expect(page.getByTestId('mock-journey-context-appointment')).toHaveCount(0)

    // Re-enter through the REAL main App (never through a detached quotation
    // review page) and select independent WorkOrder MOCK-019.
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('mock-continuous-journey-entry')).toContainText('MOCK-019')
    await page.getByTestId('mock-continuous-journey-entry').click()
    // 3. Appointment: edit only the local synthetic field, no workflow Complete.
    await expect(page).toHaveURL(/mock-work-order-019-continuous-journey/)
    await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
    await page.locator('.action-content-field--note textarea').fill('I7阶段隔离：屋面与外墙')
    await expect(page.getByTestId('mock-journey-progress')).toContainText('不提交业务表单或订单')
    await page.getByTestId('mock-journey-advance').click()

    // 4. Survey: WorkOrder identity stays 019; no estimate or job write.
    await expect(page).toHaveURL(/pages\/work-orders\/detail/)
    await expect(page.locator('.summary-number')).toContainText('MOCK-019')
    await expect(page.locator('.current-task-card')).toContainText('现场勘察')
    await page.locator('.primary-task-action').click()
    await expect(page.locator('.uni-page-head__title')).toContainText('现场勘查')
    await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('I7阶段隔离')
    const parts = page.getByTestId('survey-part-picker-trigger')
    if (await parts.isVisible()) {
      await parts.click()
      await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
      await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
      await expect(page.getByTestId('survey-repair-part-children')).toBeVisible()
      await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
      await page.getByTestId('survey-part-picker-confirm').click()
      await expect(page.getByTestId('survey-part-picker-panel')).toHaveCount(0)
    }
    await expect(page.getByTestId('dynamic-field-squareMeter')).toBeVisible()
    await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('14.5')
    await page.getByTestId('mock-journey-advance').click()

    // 5. Quotation re-entry preserves the same WorkOrder and upstream
    // context, but must not manufacture an authoritative Order or price.
    await expect(page).toHaveURL(/pages\/work-orders\/detail/)
    await expect(page.locator('.summary-number')).toContainText('MOCK-019')
    await expect(page.locator('.current-task-card')).toContainText('报价')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-start-new')).toBeEnabled()
    await page.getByTestId('quotation-hub-start-new').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('I7阶段隔离')
    await expect(page.getByTestId('mock-journey-context-survey')).toContainText('14.5')
    await expect(page.getByTestId('mock-journey-context')).toContainText('未提交后台')
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await page.getByTestId('quotation-hub-start-new').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page).toHaveURL(/mock-work-order-019-continuous-journey/)
    await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('I7阶段隔离')

    // 6. Signing is ONLY an independent synthetic type=1 Order fixture,
    // never the local draft. Test two exact identities and a forged route.
    await expect(page.getByTestId('mock-journey-signing-review')).toContainText('本机报价未提交')
    await page.getByTestId('mock-journey-signing-review').click()
    await expect(page).toHaveURL(/pages\/work-orders\/signing-mock-review/)
    await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 A')
    await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 B')
    await expect(page.getByTestId('signing-mock-no-contract')).toBeVisible()
    await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('签署中')
    for (const id of ['signing-mock-preview-disabled', 'signing-mock-apply-disabled']) {
      await expect(page.getByTestId(id)).toHaveAttribute('disabled', 'true')
    }
    await expect(page.getByTestId('signing-mock-footer')).toContainText('无业务写入')
    await info.attach('i7-stage6-safe-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    await page.goto('/#/pages/work-orders/signing-mock-review?id=foreign-workorder', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('signing-mock-blocked')).toBeVisible()
    await expect(page.getByTestId('signing-mock-workbench')).toHaveCount(0)

    // After switching back to another WorkOrder in the SAME authenticated
    // browser, 019's staged Appointment/Survey data must not leak into 018.
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await page.locator('.work-orders-entry').click()
    await page.locator('.search-input input').fill('MOCK-018')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '演示报价工单' }).click()
    await expect(page.locator('.summary-number')).toContainText('MOCK-018')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-start-new')).toBeEnabled()
    await page.getByTestId('quotation-hub-start-new').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('mock-journey-context-appointment')).toHaveCount(0)
    await expect(page.getByTestId('mock-journey-context-survey')).toHaveCount(0)
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    assertNoNetwork()
    await info.attach('i7-six-stage-evidence-' + viewport.width, {
      body: Buffer.from(JSON.stringify({
        viewport: viewport.width, stages: ['synthetic_login', 'work_order', 'appointment', 'survey', 'quotation', 'synthetic_signing'],
        workOrders: ['MOCK-018', 'MOCK-019', 'MOCK-018'], reload: true,
        forgedSigningRouteBlocked: true, externalIntentCount: forbidden.length,
        realOrderCreated: false, realContractCreated: false, writes: 0,
      }, null, 2)), contentType: 'application/json',
    })
  })
}
