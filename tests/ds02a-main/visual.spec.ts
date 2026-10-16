import { expect, test, type Page } from '@playwright/test'

const widths = [320, 375, 390] as const
type Scene = 'list' | 'detail' | 'quote'

async function guardLocal(page: Page) {
  const external: string[] = []
  const errors: string[] = []
  const failedLocal: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const u = new URL(response.url())
    if (u.hostname === 'localhost' && u.port === '5174' && response.status() >= 400) {
      failedLocal.push(response.status() + ' ' + u.pathname)
    }
  })
  await page.route('**/*', route => {
    const resource = route.request().url()
    if (resource.startsWith('data:') || resource.startsWith('blob:') || resource.startsWith('about:')) {
      return route.continue()
    }
    const u = new URL(resource)
    if (u.hostname === 'localhost' && u.port === '5174') return route.continue()
    external.push(route.request().method() + ' ' + u.origin)
    return route.abort('blockedbyclient')
  })
  return () => {
    expect(external, 'zero external/network/business service requests').toEqual([])
    expect(failedLocal, 'zero failed local resources').toEqual([])
    expect(errors, 'zero JS errors').toEqual([])
  }
}

async function openScene(page: Page, scene: Scene) {
  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home-page')).toBeVisible()
  await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.work-order-card').first()).toBeVisible()
  if (scene === 'list') return
  await page.locator('.search-input input').fill('MOCK-018')
  await page.locator('.search-button').click()
  await page.locator('.work-order-card').filter({ hasText: '演示报价工单' }).click()
  await expect(page.locator('.summary-number')).toContainText('MOCK-018')
  if (scene === 'detail') return
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  // Test the actual Q01 edit surface, not its transient empty-state loader.
  await page.getByTestId('quotation-add-group').click()
  await expect(page.getByTestId('quotation-first-step-repair-parts-trigger')).toBeVisible()
}

for (const width of widths) {
  for (const scene of ['list', 'detail', 'quote'] as const) {
    test(`Real H5 ${scene} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      const assertSafe = await guardLocal(page)
      await openScene(page, scene)
      await page.evaluate(async () => { await document.fonts.ready })
      // Snapshot the viewport after a fixed, source-modelled point in time;
      // no production reads, no order Submit, no financial writes.
      await expect(page).toHaveScreenshot(`ds02a-${scene}-${width}.png`)
      const overflow = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)
      expect(overflow, 'business page horizontal overflow').toBeLessThanOrEqual(0)
      assertSafe()
    })
  }
}
