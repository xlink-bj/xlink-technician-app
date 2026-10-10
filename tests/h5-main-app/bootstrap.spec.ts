import { expect, test } from '@playwright/test'

test('ordinary uni-app H5 renders the real Login page without external traffic', async ({ page }) => {
  const businessRequests: string[] = []
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
  await expect(
    page.locator('#app').getByText('修链', { exact: true }).first(),
    'the actual app Login screen must render rather than a blank #app root',
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: '进入登录' })).toBeVisible()
  expect(runtimeErrors, 'there must be no H5 entry errors').toEqual([])
  expect(businessRequests, 'a no-login smoke must not access any external host').toEqual([])
})
