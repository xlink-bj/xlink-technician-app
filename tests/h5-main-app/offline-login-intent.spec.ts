import { expect, test } from '@playwright/test'

/**
 * Offline *intent* test, not a login test:
 * - CI supplies a fictitious phone, an inert business host, and a production
 *   auth override only to exercise the real main-App quick-login code path.
 * - ALL non-local requests are intercepted and aborted before network I/O.
 * - Never use an actual account or persist request payload, cookies or tokens.
 */
test('main App quick login emits only the approved phone-login request intent (no outbound I/O)', async ({ page }) => {
  const outboundIntent: string[] = []
  const unexpectedBeforeClick: string[] = []
  const expectedIntent = 'POST https://xlink.fsgo365.cn/index/phoneLogin.do'
  let clicked = false

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5173') {
      await route.continue()
      return
    }
    // Record only method + origin + pathname. Never record query/body/headers.
    const intent = `${route.request().method()} ${url.origin}${url.pathname}`
    if (clicked) outboundIntent.push(intent)
    else unexpectedBeforeClick.push(intent)
    await route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.login-page .launch-stage .launch-cta')).toBeVisible()
  await expect(page.locator('.login-page .launch-stage .launch-cta')).toContainText('进入登录')
  expect(unexpectedBeforeClick, 'no external request is allowed before a user initiates login').toEqual([])
  await page.locator('.launch-cta').click()
  const quick = page.locator('.methods-stage .method-card').filter({ hasText: '快捷登录' })
  await expect(quick, 'offline CI fixture must expose the ordinary quick-login button').toBeEnabled()
  clicked = true
  await quick.click()
  await expect.poll(() => outboundIntent.length, {
    message: 'a single source-verified phoneLogin intent should be intercepted before send',
    timeout: 8_000,
  }).toBe(1)
  expect(outboundIntent, 'any non-login external request intent is a safety regression').toEqual([expectedIntent])
  // Every outbound route is aborted; the browser is NEVER authorized to send.
})
