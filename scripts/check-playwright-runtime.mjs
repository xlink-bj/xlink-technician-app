import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')
// Keep this version aligned with the immutable official CI image and lockfile.
const expectedVersion = '1.63.0'
assert.equal(require('@playwright/test/package.json').version, expectedVersion)
assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, '/ms-playwright')
assert.ok(chromium.executablePath().startsWith('/ms-playwright/'))
assert.ok(existsSync(chromium.executablePath()), 'Version-matched Chromium is absent')

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ serviceWorkers: 'block' })
  await page.route('**/*', route => route.abort('blockedbyclient'))
  await page.setContent('<h1>synthetic CI browser smoke</h1>')
  assert.equal(await page.locator('h1').innerText(), 'synthetic CI browser smoke')
  console.log(JSON.stringify({ playwright: expectedVersion, chromium: browser.version(), smoke: 'PASS' }))
} finally {
  await browser.close()
}
