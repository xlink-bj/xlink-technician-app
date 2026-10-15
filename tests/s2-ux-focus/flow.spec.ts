import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Screen = 'Q00' | 'Q01' | 'Q03'
const screen = (process.env.S2_FOCUS_SCREEN || 'Q00').toUpperCase()
if (!['Q00', 'Q01', 'Q03'].includes(screen)) {
  throw new Error('S2_FOCUS_SCREEN must be Q00, Q01 or Q03')
}

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

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test('L2 actual main-App ' + screen + ' focused visual / ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const assertSafe = await guardLocalOnly(page)

    // Enter through the REAL App and the same work-order-scoped route as L3.
    // No credential, real customer, Production network or business mutation.
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await page.locator('.search-input input').fill('MOCK-018')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '演示报价工单' }).click()
    await expect(page.locator('.summary-number')).toContainText('MOCK-018')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()

    if (screen === 'Q00') {
      // Explicitly tagged synthetic two-order design state, NOT server data.
      await page.goto(page.url() + '&q00Preview=orders', { waitUntil: 'domcontentloaded' })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('quotation-hub-design-sample')).toBeVisible()
      await expect(page.getByTestId('quotation-hub-records').locator('.quotation-hub__order')).toHaveCount(2)
      await expect(page.getByTestId('quotation-hub-add-inline')).toBeVisible()
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
        await page.getByTestId('quotation-first-step-description').locator('textarea')
          .fill('L2 屋面维修视觉审查')
        await page.getByTestId('quotation-first-step-quantity').locator('input').fill('1')
        await page.getByTestId('quotation-first-step-select-products').click()
        await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
        await expect(page.getByTestId('quotation-package-detail-mock-catalog-package-basic')).toBeVisible()
      }
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
      workOrder: 'MOCK-018',
      officialOrderCreated: false,
      businessWrites: 0,
      externalRequests: 0,
      gitCommit: process.env.GITHUB_SHA ?? 'local',
    }, null, 2))
    await info.attach(name, { body: shot, contentType: 'image/png' })
    assertSafe()
  })
}
