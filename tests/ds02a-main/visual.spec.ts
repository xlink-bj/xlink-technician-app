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
      // DS-02.B: both REAL consumers must use canonical content components.
      // A visual diff by itself cannot prove reuse, touch or text resilience.
      if (scene === 'list') {
        await expect(page.getByTestId('ds02b-list-heading')).toBeVisible()
        const records = page.getByTestId('ds02b-work-order-card-surface')
        expect(await records.count()).toBeGreaterThan(0)
        await expect(records.first()).toHaveClass(/app-record-card--horizontal/)
        const tags = records.first().locator('.app-meta-tag')
        await expect(tags.first()).toBeVisible()
        const phone = records.first().locator('.card-phone-button')
        const contactSize = await phone.boundingBox()
        expect(contactSize).not.toBeNull()
        expect(contactSize!.height, 'contact target >=44px').toBeGreaterThanOrEqual(43.5)
        expect(contactSize!.width, 'contact target >=44px').toBeGreaterThanOrEqual(43.5)
        const accept = page.locator('.card-accept-button').first()
        await expect(accept).toBeVisible()
        await expect(accept).toHaveClass(/app-button--size-compact/)
        const acceptSize = await accept.boundingBox()
        expect(acceptSize).not.toBeNull()
        expect(acceptSize!.height, 'shared accept CTA >=44px').toBeGreaterThanOrEqual(43.5)
      }
      if (scene === 'detail') {
        await expect(page.getByTestId('ds02b-detail-heading')).toBeVisible()
        await expect(page.getByTestId('ds02b-detail-record-card')).toHaveClass(/app-record-card/)
        // The source-modelled MOCK-018 may omit servicePartLabel; absence is
        // correct and must never be papered over with an invented tag.
        const partTag = page.locator('.summary-card .app-meta-tag')
        if (await partTag.count()) await expect(partTag).toBeVisible()
        await expect(page.locator('.information-card.app-record-card')).toBeVisible()
        const task = page.getByTestId('ds02b-current-task')
        await expect(task).toHaveClass(/app-record-card/)
        const action = task.locator('.primary-task-action')
        await expect(action).toHaveClass(/app-button--primary/)
        const taskTarget = await action.boundingBox()
        expect(taskTarget).not.toBeNull()
        expect(taskTarget!.height, 'detail primary task touch target >=44px').toBeGreaterThanOrEqual(43.5)
        await expect(page.locator('.summary-card .location-label')).toHaveText('服务地址')
        for (const quickAction of await page.locator('.summary-card .summary-action').all()) {
          const target = await quickAction.boundingBox()
          expect(target).not.toBeNull()
          expect(target!.height, 'detail quick action touch target >=44px').toBeGreaterThanOrEqual(43.5)
        }
        // Visual hierarchy must not change Workflow-derived action intent,
        // disabled handling or production read-only authorization.
      }
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
