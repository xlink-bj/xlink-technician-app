import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Screen = 'Q00' | 'Q01' | 'Q03' | 'C01' | 'DETAIL'
const requested = (process.env.S2_FOCUS_SCREEN || 'Q00').toUpperCase()
if (!['Q00', 'Q01', 'Q03', 'C01', 'DETAIL', 'ALL'].includes(requested)) {
  throw new Error('S2_FOCUS_SCREEN must be Q00, Q01, Q03, C01, DETAIL or CI-only ALL')
}
// Every workflow_dispatch remains single-scene; the feature's own PR validates
// all three entry points before the on-demand runner is accepted.
const screens: Screen[] = requested === 'ALL'
  ? ['Q00', 'Q01', 'Q03', 'C01', 'DETAIL']
  : [requested as Screen]

async function guardLocalOnly(page: Page) {
  const external: string[] = []
  const localFailures: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.name))
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 120))
  })
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.origin === 'http://localhost:5174' && response.status() >= 400) {
      localFailures.push(response.status() + ' ' + url.pathname)
    }
  })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().method() + ' ' + url.origin + url.pathname)
    await route.abort('blockedbyclient')
  })
  return () => {
    expect(external, 'external requests are forbidden, even if blocked').toEqual([])
    expect(localFailures).toEqual([])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  }
}

for (const screen of screens) {
for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test('L2 actual main-App ' + screen + ' focused visual / ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const assertSafe = await guardLocalOnly(page)

    if (screen === 'C01') {
      // Real signing-read page, not a detached developer/status proxy.
      // This is a separate DEV synthetic official Order; no order creation,
      // PDF, SMS, signing command or production read is authorized.
      await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
      await expect(page.getByTestId('business-mode-provenance')).toHaveCount(0)
      await page.locator('.work-orders-entry').click()
      await page.locator('.search-input input').fill('04009')
      await page.locator('.search-button').click()
      await page.locator('.work-order-card').filter({ hasText: '陈女士' }).click()
      await expect(page.locator('.summary-number')).toContainText('04009')
      await page.evaluate(() => {
        const uni = (window as Window & {
          uni?: { navigateTo: (options: { url: string }) => void }
        }).uni
        if (!uni) throw new Error('Real uni-app navigation unavailable')
        uni.navigateTo({ url: '/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=mock-official-order-001' })
      })
      await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
      await expect(page.getByTestId('signing-contract-fixture-label')).toHaveCount(0)
      await expect(page.getByTestId('signing-order-read-contract-disabled')).toHaveAttribute('disabled', 'true')
      await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('disabled', 'true')
      await page.getByTestId('signing-review-progress').scrollIntoViewIfNeeded()
    } else {
    // Enter through the REAL App and the same work-order-scoped route as L3.
    // No credential, real customer, Production network or business mutation.
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
    await expect(page.getByTestId('business-mode-provenance')).toHaveCount(0)
    await page.locator('.work-orders-entry').click()
    await page.locator('.search-input input').fill('26018')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '吴先生' }).click()
    await expect(page.locator('.summary-number')).toContainText('#26018')
    if (screen !== 'DETAIL') {
      await page.locator('.primary-task-action').click()
      await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    }

    if (screen === 'DETAIL') {
      await expect(page.getByTestId('task-focus-panel')).toBeVisible()
      await expect(page.getByTestId('task-focus-title')).toHaveText('报价')
      await expect(page.getByTestId('task-focus-action')).toHaveText(/去下单/)
    } else if (screen === 'Q00') {
      // Explicitly tagged synthetic two-order design state, NOT server data.
      await page.goto(page.url() + '&q00Preview=orders', { waitUntil: 'domcontentloaded' })
      await page.reload({ waitUntil: 'domcontentloaded' })
      // Preview fixtures exercise the same commercial component; their
      // development provenance must not become a visible business-page banner.
      await expect(page.getByTestId('quotation-hub-design-sample')).toHaveCount(0)
      await expect(page.getByTestId('quotation-hub-records').locator('.quotation-hub__order')).toHaveCount(2)
      await expect(page.getByTestId('quotation-order-hub')).not.toContainText(/DEV-Q00|Mock|演示数据|设计样本/)
      await expect(page.getByTestId('quotation-hub-start-new')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-add-inline')).toHaveCount(0)
    } else {
      // Only local editor, no authoritative Order or financial mutation.
      await page.getByTestId('quotation-hub-create-unverified').click()
      await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
      await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)

      if (screen === 'Q01') {
        await expect(page.getByTestId('quotation-add-group')).toBeVisible()
        await expect(page.getByTestId('quotation-footer-summary')).toBeVisible()
      } else {
        await page.getByTestId('quotation-add-group').click()
        await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
        await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
        await page.getByTestId('quotation-repair-part-picker-done').click()
        await page.getByTestId('quotation-first-step-description').locator('textarea')
          .fill('L2 屋面维修视觉审查')
        await page.getByTestId('quotation-first-step-quantity').locator('input').fill('1')
        await page.getByTestId('quotation-first-step-select-products').click()
        await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
        await expect(page.getByTestId('quotation-package-detail-mock-catalog-package-basic')).toBeVisible()
      }
    }

    }

    // Check actual typography/touch geometry, not just that PNG generation
    // happened. Fixed thresholds are review guardrails, not design signoff.
    if (screen === 'DETAIL') {
      const card = page.getByTestId('task-focus-panel')
      const button = page.getByTestId('task-focus-action')
      const cardBox = await card.boundingBox()
      const buttonBox = await button.boundingBox()
      expect(cardBox).not.toBeNull()
      expect(buttonBox).not.toBeNull()
      expect(cardBox!.height, 'exact master target height 169px').toBeGreaterThanOrEqual(168.5)
      expect(cardBox!.height).toBeLessThanOrEqual(169.5)
      expect(buttonBox!.height, 'master CTA 51px').toBeGreaterThanOrEqual(50.5)
      expect(buttonBox!.height).toBeLessThanOrEqual(51.5)
      const paint = await card.evaluate(el => {
        const style = getComputedStyle(el)
        const title = el.querySelector('.task-focus-panel__title')
        return {
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          titleSize: title ? getComputedStyle(title).fontSize : '',
          buttonColor: getComputedStyle(el.querySelector('.task-focus-panel__action')!).backgroundColor,
        }
      })
      expect(paint).toEqual({
        background: 'rgb(22, 44, 74)',
        radius: '19px',
        titleSize: '25px',
        buttonColor: 'rgb(23, 105, 220)',
      })
      const channels = paint.buttonColor.match(/[0-9]+/g)?.slice(0, 3).map(Number)
      expect(channels, 'button colors must be machine-readable RGB').toHaveLength(3)
      const linear = (value: number): number => {
        const v = value / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      const luminance = 0.2126 * linear(channels![0])
        + 0.7152 * linear(channels![1])
        + 0.0722 * linear(channels![2])
      expect(1.05 / (luminance + 0.05), 'WCAG: white action text contrast >= 4.5:1')
        .toBeGreaterThanOrEqual(4.5)
    } else if (screen === 'C01') {
      const cards = page.getByTestId('signing-order-read-verified')
      await expect(cards).toHaveClass(/app-record-card/)
      await expect(cards.locator('.signing-read-hero-title')).toHaveText('当前订单')
      await expect(page.getByTestId('signing-review-progress')).toBeVisible()
      await expect(cards).not.toContainText('体验数据 · 未提交后台')
      await expect(page.getByTestId('signing-review-progress').getByTestId('signing-contract-read-request')).toBeVisible()
      await expect(page.getByTestId('signing-order-audit-toggle')).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByTestId('signing-order-read-contract-status')).toBeVisible()
      const stageRect = await page.getByTestId('signing-review-progress').boundingBox()
      const orderRect = await cards.boundingBox()
      expect(stageRect).not.toBeNull()
      expect(orderRect).not.toBeNull()
      expect(stageRect!.y, 'C01 shows current state before the technical Order details').toBeLessThan(orderRect!.y)
      const stageFont = await page.locator('.signing-read-stage .signing-read-progress-title')
        .evaluate(el => parseFloat(getComputedStyle(el).fontSize))
      expect(stageFont, 'C01 current-stage heading must be a primary visual level')
        .toBeGreaterThanOrEqual(17)
      const amount = cards.locator('.app-amount-value')
      if (await amount.count()) {
        const amountFont = await amount.evaluate(el => parseFloat(getComputedStyle(el).fontSize))
        expect(amountFont, 'C01 verified official amount must be visually prominent')
          .toBeGreaterThanOrEqual(25)
      }
      const box = await cards.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeLessThanOrEqual(viewport.width)
      const money = cards.locator('.app-amount-value')
      if (await money.count()) await expect(money).toHaveClass(/app-amount-value--prominent/)
    } else if (screen === 'Q00') {
      const cards = page.locator('.quotation-hub__order')
      const first = cards.first()
      await expect(first.locator('.quotation-hub__order-summary')).toBeVisible()
      await expect(first.locator('.quotation-hub__details')).toHaveCount(0)
      await first.getByTestId('quotation-hub-view-DEV-Q00-ORDER-1').click()
      await expect(first.locator('.quotation-hub__details')).toContainText('产品总额')
      await first.getByTestId('quotation-hub-view-DEV-Q00-ORDER-1').click()
      const font = await first.locator('.quotation-hub__order-number').evaluate(
        el => parseFloat(getComputedStyle(el).fontSize),
      )
      expect(font, 'Q00 order identity must be legible at mobile width').toBeGreaterThanOrEqual(14)
      const rect = await first.boundingBox()
      expect(rect).not.toBeNull()
      expect(rect!.width).toBeLessThanOrEqual(viewport.width)
      const action = await page.getByTestId('quotation-hub-start-new').boundingBox()
      expect(action).not.toBeNull()
      expect(action!.height, 'Q00 new-order CTA target').toBeGreaterThanOrEqual(43.5)
      const amount = first.locator('.app-amount-value')
      await expect(amount).toHaveClass(/app-amount-value--prominent/)
      const amountFont = await amount.evaluate(el => parseFloat(getComputedStyle(el).fontSize))
      expect(amountFont, 'Q00 actual amount must be a primary financial value').toBeGreaterThanOrEqual(20)
    } else if (screen === 'Q01') {
      // The real editor can legitimately start in its empty state. Enter
      // the editable first repair group before inspecting field geometry.
      if (await page.locator('.q01-screen__label').count() === 0) {
        await page.getByTestId('quotation-add-group').click()
      }
      await expect(page.locator('.q01-screen__label').first()).toBeVisible()
      const label = await page.locator('.q01-screen__label').first().evaluate(
        el => parseFloat(getComputedStyle(el).fontSize),
      )
      expect(label, 'Q01 field labels must remain legible').toBeGreaterThanOrEqual(14)
      const textArea = await page.getByTestId('quotation-first-step-description').boundingBox()
      expect(textArea).not.toBeNull()
      expect(textArea!.height, 'Q01 description must have comfortable touch and reading room').toBeGreaterThanOrEqual(70)
      expect(textArea!.height, 'Q01 description must fit mobile height budget').toBeLessThanOrEqual(114)
      await expect(page.getByTestId('quotation-q01-journey')).toBeVisible()
      await expect(page.locator('.q01-screen')).toBeVisible()
      const titleSize = await page.locator('.q01-screen__title').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))
      expect(titleSize, 'Q01 page title must show real visual hierarchy').toBeGreaterThanOrEqual(22)
      await expect(page.getByTestId('quotation-first-step-footer')).toBeVisible()
      const next = await page.getByTestId('quotation-first-step-next').boundingBox()
      expect(next).not.toBeNull()
      expect(next!.height, 'real catalog CTA is >=44px and reachable').toBeGreaterThanOrEqual(44)
      const selector = await page.getByTestId('quotation-first-step-repair-parts-trigger').boundingBox()
      expect(selector).not.toBeNull()
      expect(selector!.height).toBeGreaterThanOrEqual(44)
      if (viewport.height >= 800) {
        // First value: at 390x844 the technician must see all three required
        // inputs BEFORE the fixed action bar, without scrolling or obstruction.
        const quantity = await page.getByTestId('quotation-first-step-quantity').boundingBox()
        const footer = await page.getByTestId('quotation-first-step-footer').boundingBox()
        expect(quantity).not.toBeNull()
        expect(footer).not.toBeNull()
        expect(quantity!.y + quantity!.height,
          'Q01 all required fields should fit above the sticky actions at 390x844')
          .toBeLessThanOrEqual(footer!.y + 2)
      }
    } else {
      await expect(page.locator('.quotation-content__catalog-intro')).toBeHidden()
      const title = await page.locator('.quotation-content__catalog-item-title').first().evaluate(
        el => parseFloat(getComputedStyle(el).fontSize),
      )
      expect(title, 'Q03 product titles must remain legible').toBeGreaterThanOrEqual(14)
      const firstItem = await page.getByTestId(
        'quotation-catalog-item-package-mock-catalog-package-basic',
      ).boundingBox()
      expect(firstItem).not.toBeNull()
      expect(firstItem!.width).toBeLessThan(viewport.width)
      // No disabled taxonomy rail unless package records carry backed R1 classification codes.
      await expect(page.getByTestId('quotation-catalog-facets')).toHaveCount(0)
    }

    assertSafe()
    const dir = resolve(process.cwd(), '.review/m1-s2/focus')
    await mkdir(dir, { recursive: true })
    const name = screen.toLowerCase() + '-' + viewport.width + 'x' + viewport.height
    const shot = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' })
    await writeFile(resolve(dir, name + '.png'), shot)
    await writeFile(resolve(dir, name + '.json'), JSON.stringify({
      schemaVersion: 1,
      scene: screen as Screen,
      viewport,
      provenance: 'DEV_ONLY_SOURCE_MODELED_MOCK',
      actualApp: true,
      workOrder: screen === 'C01' ? 'MOCK-04009' : 'MOCK-018',
      officialOrderCreated: false,
      businessWrites: 0,
      externalRequests: 0,
      gitCommit: process.env.GITHUB_SHA ?? 'local',
    }, null, 2))
    await info.attach(name, { body: shot, contentType: 'image/png' })
    if (screen === 'Q01') {
      // A real bottom-sheet presentation of the EXISTING source-backed
      // cascaded repair-part picker; not a fake detached list or new data.
      await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
      await expect(page.getByTestId('quotation-repair-part-picker')).toBeVisible()
      await expect(page.locator('.q01-screen__sheet')).toBeVisible()
      const pickerShot = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' })
      await writeFile(resolve(dir, name + '-picker.png'), pickerShot)
      await info.attach(name + '-picker', { body: pickerShot, contentType: 'image/png' })
      await page.getByTestId('quotation-repair-part-picker-cancel').click()
      await expect(page.getByTestId('quotation-repair-part-picker')).toHaveCount(0)
      // Footer Next is ONLY a front-end position change of the old
      // selectProductsForFirstGroup handler: incomplete input still fails.
      await page.getByTestId('quotation-first-step-next').click()
      await expect(page.getByTestId('quotation-first-step-repair-parts-error')).not.toBeEmpty()
      await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    }
    assertSafe()
  })
}
}
