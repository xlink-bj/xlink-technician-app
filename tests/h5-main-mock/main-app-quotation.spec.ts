import { expect, test } from '@playwright/test'

type NetworkEvidence = {
  externalIntents: string[]
  localFailures: string[]
  pageErrors: number
  consoleErrors: number
}

let evidence: NetworkEvidence

test.beforeEach(async ({ page }) => {
  evidence = { externalIntents: [], localFailures: [], pageErrors: 0, consoleErrors: 0 }
  page.on('pageerror', () => { evidence.pageErrors += 1 })
  page.on('console', (msg) => { if (msg.type() === 'error') evidence.consoleErrors += 1 })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url())
      if (url.origin === 'http://localhost:5174') {
        evidence.localFailures.push(`${response.status()} ${url.pathname}`)
      }
    }
  })
  // Install before navigation. An attempted external request is evidence of
  // a defect, even if blocked; NO external requests are ever sent.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') {
      await route.continue()
      return
    }
    evidence.externalIntents.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    await route.abort('blockedbyclient')
  })
})

test.afterEach(async ({ page }, info) => {
  // The report is always attached, including timeout, assertion failure and
  // early navigation errors. No phone, code, token, payload or headers.
  await info.attach('mock-network-evidence', {
    body: Buffer.from(JSON.stringify({
      ...evidence,
      result: info.status,
      expected: info.expectedStatus,
      stage: new URL(page.url()).hash.split('?')[0],
    }, null, 2)),
    contentType: 'application/json',
  })
})

test('real authenticated shell uses local-only Mock quotation with zero external intent', async ({ page }, info) => {
  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  const home = page.locator('.home-page')
  await expect(home, 'DEV-only fixture must bootstrap the REAL App without phone login').toBeVisible()
  await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
  const quote = page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' })
  await expect(quote).toBeVisible()
  await info.attach('main-home-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  await quote.click()
  await expect(page, 'normal uni navigation must reach the real Action Workspace').toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page.getByTestId('quotation-footer-summary')).toBeVisible()
  await expect(page.getByTestId('quotation-product-demo-read-only')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await info.attach('main-quotation-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(evidence.externalIntents, 'an intercepted external request still FAILS the isolation Gate').toEqual([])
  expect(evidence.pageErrors, 'JS exceptions are not an accepted UX result').toBe(0)
  expect(evidence.consoleErrors, 'console errors are not an accepted UX result').toBe(0)
  expect(evidence.localFailures).toEqual([])
})
