import { expect, test } from '@playwright/test'
import { collectOfflineBrowserSignals } from './offline-boot-diagnostics'

test('ordinary uni-app H5 renders the real Login page without external traffic', async ({ page }) => {
  const signals = collectOfflineBrowserSignals(page)
  const businessRequests = signals.externalIntents
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue()
      return
    }
    businessRequests.push(url.origin + url.pathname)
    await route.abort()
  })

  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  const loginBrand = page.locator('#app').getByText('修链', { exact: true }).first()
  try {
    await expect(
      loginBrand,
      'the actual app Login screen must render rather than a blank #app root',
    ).toBeVisible({ timeout: 12_000 })
  } catch (error) {
    throw new Error([
      'OFFLINE_BOOT_BLOCKED: real main App Login did not mount',
      JSON.stringify(await signals.snapshot()),
      String(error).slice(0, 160),
    ].join('\\n'))
  }
  const launchAction = page.locator('.login-page .launch-stage .launch-cta')
  await expect(launchAction, 'uni-app launch CTA must render on the actual Login page').toBeVisible()
  await expect(launchAction).toContainText('进入登录')
  expect(runtimeErrors.length, 'there must be no H5 entry errors').toBe(0)
  expect(businessRequests, 'a no-login smoke must not access any external host').toEqual([])
})
