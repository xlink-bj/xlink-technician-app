import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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
    const realScreens: Record<string, Buffer> = {}
    const shot = async (name: string, expected: string) => {
      await expect(page.getByTestId(expected)).toBeVisible()
      const png = await page.screenshot({ fullPage: true })
      if (vp.width === 390 && /^0[1-4]-/.test(name)) realScreens[name.slice(0, 2)] = png
      await info.attach('I4-REAL-' + name + '-' + vp.width, {
        body: png, contentType: 'image/png',
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
    await expect(commit).toHaveAttribute('disabled', 'true')
    await expect(commit).toHaveClass(/app-button--disabled/)
    for (const layer of await layers.all()) {
      const option = layer.locator('[data-testid^="quotation-package-material-choice-"]').first()
      await expect(option).toBeEnabled()
      await option.click()
      await expect(layer).toContainText('已选择')
    }
    await expect(page.getByTestId('quotation-package-selection-summary')).toContainText('2/2')
    await expect(commit).not.toHaveAttribute('disabled', 'true')
    await expect(commit).not.toHaveClass(/app-button--disabled/)
    await page.getByTestId('quotation-package-config-focus').scrollIntoViewIfNeeded()
    await shot('03-package-configured', 'quotation-package-detail')

    // 04 real local draft after returning from the package configurator.
    await commit.click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toBeVisible()
    await expect(page.getByTestId('quotation-p1-local-review')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    // Quote persistence is intentionally asynchronous. Reload only after the
    // actual UI confirms the local draft is durable, exactly as other main App
    // regression tests do. A premature reload would be a test race.
    await expect(page.getByText(/报价草稿已保存在本机|报价分组草稿已保存在本机/)).toBeVisible()
    await group.scrollIntoViewIfNeeded()
    await shot('04-return-to-group', 'quotation-state-ready')

    // Reload must preserve the same WorkOrder & group and must not produce a
    // legitimate Order, SKU price, Contract or workflow action.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    // Real Quotation UI legitimately restores a compact group summary after
    // reload. Expand it before asserting visible item rows; do not confuse
    // collapsed presentation with a lost persisted quotation selection.
    const collapsed = page.getByTestId('quotation-group-collapsed-summary-quotation-group-1')
    if (await collapsed.isVisible()) {
      await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
    }
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toBeVisible()
    await page.getByTestId('quotation-p1-review-toggle').click()
    await expect(page.getByTestId('quotation-p1-review-order-blocked')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await shot('05-reloaded-order-blocked', 'quotation-state-ready')

    // Make one reviewable 4-row comparison image at 390px. The RIGHT
    // column is an isolated static design concept, NOT current Vue UI and
    // NOT an R1 screenshot. The main App screenshots above are real routes.
    if (vp.width === 390) {
      const design = await page.context().newPage()
      await design.setViewportSize(vp)
      const conceptUrl = pathToFileURL(resolve(process.cwd(), '__review/concepts/m1-quotation-four-surface.html')).href
      const conceptScreens: Record<string, Buffer> = {}
      try {
        await design.goto(conceptUrl, { waitUntil: 'load' })
        await expect(design.getByTestId('ux-stage-workbench')).toBeVisible()
        conceptScreens['01'] = await design.screenshot({ fullPage: true })
        await design.getByTestId('ux-nav-catalog').click()
        await expect(design.getByTestId('ux-stage-catalog')).toBeVisible()
        conceptScreens['02'] = await design.screenshot({ fullPage: true })
        await design.getByTestId('ux-select-package').click()
        await expect(design.getByTestId('ux-stage-config')).toBeVisible()
        conceptScreens['03'] = await design.screenshot({ fullPage: true })
        await design.getByTestId('ux-primary').click()
        await expect(design.getByTestId('ux-stage-return')).toBeVisible()
        conceptScreens['04'] = await design.screenshot({ fullPage: true })
      } finally { await design.close() }
      const headings = ['报价工作台', '可视化目录', '套餐配置', '返回维修部位']
      const images = ['01', '02', '03', '04'].map((step, i) =>
        '<section class="compare"><h2>' + step + ' · ' + headings[i] + '</h2>' +
        '<div class="pair"><article><div class="source">当前真实 App · DEV 合成工单</div><img src="data:image/png;base64,' +
        realScreens[step].toString('base64') + '" /></article><article>' +
        '<div class="source">V2 独立高保真 UX 提案 · 非正式 UI</div><img src="data:image/png;base64,' +
        conceptScreens[step].toString('base64') + '" /></article></div></section>'
      ).join('')
      const sheet = await page.context().newPage()
      try {
        await sheet.setViewportSize({ width: 960, height: 1200 })
        await sheet.setContent('<!doctype html><html lang="zh"><head><meta charset="utf-8" />' +
          '<style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f7fb;color:#172e47;font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}' +
          'h1{margin:0 0 10px;font-size:25px}p{margin:0 0 24px;color:#58708a;line-height:1.55}' +
          '.compare{margin:22px 0 38px;break-inside:avoid}.compare h2{font-size:18px;margin:0 0 12px;padding:0 0 8px;border-bottom:1px solid #dfe7f2}' +
          '.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair article{min-width:0;background:white;padding:14px;border-radius:14px;border:1px solid #dfe7f2}' +
          '.source{font-size:12px;color:#39638b;font-weight:700;margin:0 0 12px}.pair img{display:block;width:100%;height:auto;border:1px solid #e4eaf3}' +
          'footer{font-size:12px;color:#59718a;margin-top:24px}</style></head><body>' +
          '<h1>M1 I4 · 报价四屏视觉对照（390px）</h1>' +
          '<p>左：当前 uni-app 真实页面，离线 DEV 合成数据。右：V2 独立设计概念，非 App 运行界面。两者不是同一正式商品 ID；R1 生产截图未纳入本证据。</p>' +
          images +
          '<footer>Owner 视觉评审候选 · KEEP / IMPROVE / DROP 详见 M1_I4_OWNER_VISUAL_DECISION_PACK.md · 未签收 · 不提交订单</footer></body></html>')
        await info.attach('I4-OWNER-four-screen-REAL-vs-V2-390', {
          body: await sheet.screenshot({ fullPage: true }), contentType: 'image/png',
        })
      } finally { await sheet.close() }
    }

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
