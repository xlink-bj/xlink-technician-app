import { expect, test } from '@playwright/test'
import { collectOfflineBrowserSignals } from './offline-boot-diagnostics'

/**
 * Offline *intent* test, not a login test:
 * - CI supplies a fictitious phone, an inert business host, and a production
 *   auth override only to exercise the real main-App quick-login code path.
 * - ALL non-local requests are intercepted and aborted before network I/O.
 * - Never use an actual account or persist request payload, cookies or tokens.
 */
test('main App quick login emits only the approved phone-login request intent (no outbound I/O)', async ({ page }) => {
  const signals = collectOfflineBrowserSignals(page)
  const outboundIntent = signals.externalIntents
  const expectedIntent = 'POST https://xlink.fsgo365.cn/index/phoneLogin.do'

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5173') {
      await route.continue()
      return
    }
    // Record only method + origin + pathname. Never record query/body/headers.
    const intent = `${route.request().method()} ${url.origin}${url.pathname}`
    outboundIntent.push(intent)
    await route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  const launch = page.locator('.login-page .launch-stage .launch-cta')
  try {
    await expect(launch, 'real main App must render before attempting even synthetic login').toBeVisible({ timeout: 12_000 })
    await expect(launch).toContainText('进入登录')
  } catch {
    throw new Error('OFFLINE_BOOT_BLOCKED: ' + JSON.stringify(await signals.snapshot()))
  }

  expect(outboundIntent, 'no external intent is allowed before a login click').toEqual([])
  await launch.click()
  const quick = page.locator('.methods-stage .method-card').filter({ hasText: '快捷登录' })
  try {
    await expect(quick, 'offline CI fixture must expose quick login after launch').toBeEnabled({ timeout: 8_000 })
  } catch {
    throw new Error('OFFLINE_METHODS_BLOCKED: ' + JSON.stringify(await signals.snapshot()))
  }
  // Exactly one synthetic click; never retry or send an outbound request.
  await quick.click()
  try {
    await expect.poll(() => outboundIntent.length, {
      message: 'a single intercepted phoneLogin intent is expected',
      timeout: 8_000,
    }).toBe(1)
  } catch {
    throw new Error('OFFLINE_INTENT_BLOCKED: ' + JSON.stringify(await signals.snapshot()))
  }
  expect(outboundIntent, 'any non-login external request intent is a safety regression').toEqual([expectedIntent])
  // Every outbound route is aborted; the browser is NEVER authorized to send.
})
