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
  const loginBrand = page.locator('#app').getByText('修链', { exact: true }).first()
  try {
    await expect(
      loginBrand,
      'the actual app Login screen must render rather than a blank #app root',
    ).toBeVisible({ timeout: 12_000 })
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      readyState: document.readyState,
      title: document.title,
      appHTML: document.querySelector('#app')?.innerHTML.slice(0, 400) ?? 'MISSING',
      scripts: [...document.scripts].map((script) => script.src.split('?')[0].split('/').slice(-3).join('/')),
      loadedModules: performance.getEntriesByType('resource')
        .map((item) => new URL(item.name).pathname)
        .filter((path) => /main|index|uni-h5|entry/.test(path)).slice(0, 16),
    }))
    const entry = await page.request.get('/src/main.ts')
    const transformed = entry.ok() ? await entry.text() : ''
    const entryInfo = {
      status: entry.status(),
      hasH5FactoryCall: transformed.includes('createTechnicianApplication()'),
      hasH5Mount: transformed.includes("mount('#app')"),
      size: transformed.length,
    }
    throw new Error([
      'Real main App H5 Login did not mount',
      JSON.stringify({ diagnostics, entryInfo, runtimeErrors, businessRequests }),
      String(error),
    ].join('\\n'))
  }
  await expect(page.getByRole('button', { name: '进入登录' })).toBeVisible()
  expect(runtimeErrors, 'there must be no H5 entry errors').toEqual([])
  expect(businessRequests, 'a no-login smoke must not access any external host').toEqual([])
})
