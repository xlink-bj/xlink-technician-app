import { expect, test, type Page } from '@playwright/test'

/**
 * I4 Owner visual gate — reality captured from the *real* main App Vue route,
 * never from the static design concept. The fixtures are synthetic/offline.
 * No Owner visual approval can be inferred from this Playwright test.
 */
for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test('I4 current REAL Quotation UI, four stages and first-fold evidence at ' + vp.width, async ({ page }, info) => {
    await page.setViewportSize(vp)
    const external: string[] = []
    const failures: string[] = []
    const exceptions: string[] = []
    page.on('pageerror', e => exceptions.push(e.message))
    page.on('console', m => { if (m.type() === 'error') exceptions.push(m.text()) })
    page.on('response', res => {
      if (res.status() >= 400 && new URL(res.url()).origin === 'http://localhost:5174')
        failures.push(res.status() + ':' + new URL(res.url()).pathname)
    })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') {
        await route.continue()
      } else {
        external.push(route.request().method() + ' ' + url.origin + url.pathname)
        await route.abort('blockedbyclient')
      }
    })
    const shot = async (name: string, expected: string) => {
      await expect(page.getByTestId(expected)).toBeVisible()
      await info.attach('I4-REAL-' + name + '-' + vp.width, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    }
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await shot('00-initial-empty', 'quotation-initial-empty-workbench')

    // Real repair-part step, then one direct material selection to establish a
    // persisted group. This is the current workbench reality, not the concept.
    await page.getByTestId('quotation-add-group').click()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('I4同案例：屋面局部渗漏维修')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-sealant').click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    const group = page.getByTestId('quotation-repair-group-quotation-group-1')
    await expect(group).toContainText('I4同案例')
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toContainText('弹性密封材料（示例）')
    await group.scrollIntoViewIfNeeded()
    await shot('01-workbench-group-selected', 'quotation-state-ready')

    // 02 the actual category browser; this is distinct from the standalone
    // single-file proposed "visual card" concept.
    await page.getByTestId('quotation-browse-quotation-group-1').click()
    await expect(page.getByTestId('quotation-catalog-target')).toContainText('I4同案例')
    await expect(page.getByTestId('quotation-catalog-kind-package')).toBeVisible()
    for (const kind of ['procedure', 'material', 'measure']) {
      await expect(page.getByTestId('quotation-catalog-kind-' + kind)).toBeVisible()
    }
    await shot('02-catalog', 'quotation-catalog-page')

    // 03 actual package component/material-layer configurator.
    await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
    const layers = page.locator('[data-testid^="quotation-material-layer-"]')
    await expect(layers).toHaveCount(2)
    const commit = page.getByTestId('quotation-package-configure-commit')
    await expect(commit).toBeDisabled()
    for (const layer of await layers.all()) {
      const option = layer.locator('[data-testid^="quotation-package-material-choice-"]').first()
      await expect(option).toBeEnabled()
      await option.click()
      await expect(layer).toContainText('已选择')
    }
    await expect(page.getByTestId('quotation-package-selection-summary')).toContainText('2/2')
    await expect(commit).toBeEnabled()
    await page.getByTestId('quotation-package-config-focus').scrollIntoViewIfNeeded()
    await shot('03-package-configured', 'quotation-package-detail')

    // 04 real local draft after returning from the package configurator.
    await commit.click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toBeVisible()
    await expect(page.getByTestId('quotation-p1-local-review')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await group.scrollIntoViewIfNeeded()
    await shot('04-return-to-group', 'quotation-state-ready')

    // Reload must preserve the same WorkOrder & group and must not produce a
    // legitimate Order, SKU price, Contract or workflow action.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toBeVisible()
    await page.getByTestId('quotation-p1-review-toggle').click()
    await expect(page.getByTestId('quotation-p1-review-order-blocked')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await shot('05-reloaded-order-blocked', 'quotation-state-ready')

    expect(external, 'offline screenshots must not attempt an external request').toEqual([])
    expect(failures, 'no failed local assets').toEqual([])
    expect(exceptions, 'no JS/console error').toEqual([])
    await info.attach('I4-REAL-screenshot-truth-' + vp.width, {
      body: Buffer.from(JSON.stringify({
        viewport: vp, source: 'REAL_MAIN_APP_UNI_H5_DEV_MOCK',
        workOrder: 'synthetic fixture, no customer identity',
        screens: ['00-initial-empty', '01-workbench-group-selected', '02-catalog',
          '03-package-configured', '04-return-to-group', '05-reloaded-order-blocked'],
        sourceCatalog: 'DEV synthetic fixtures, NOT authorized R1',
        quoteDraftPersistedAfterReload: true, officialOrderCreated: false,
        noWrite: true, ownerVisualApproved: false, r1VisualSideBySide: 'UNAVAILABLE',
        externalRequestIntentCount: external.length,
      }, null, 2)), contentType: 'application/json',
    })
  })
}
