import { expect, test, type Page } from '@playwright/test'

const widths = [320, 375, 390] as const

async function guard(page: Page) {
  const unexpected: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.route('**/*', async route => {
    const u = new URL(route.request().url())
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === '5174') {
      return route.continue()
    }
    unexpected.push(route.request().url())
    return route.abort('blockedbyclient')
  })
  return () => {
    expect(unexpected, 'strictly no external resources').toEqual([])
    expect(pageErrors, 'no page JS errors').toEqual([])
  }
}

for (const width of widths) {
  test(`Gallery commercial masters ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const assertSafe = await guard(page)
    await page.goto('/#/pages/design-system/index', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('design-system-gallery')).toBeVisible()
    await expect(page.getByTestId('gallery-notice')).toContainText('不连接 API')
    await page.evaluate(async () => { await document.fonts.ready })
    await page.addStyleTag({ content: 'uni-page-head { visibility: hidden !important }' })

    const button = page.getByTestId('ds011-button-master')
    const bar = page.getByTestId('gallery-example-action-bar')
    await expect(button).toBeVisible()
    await expect(page.getByTestId('ds011-feedback-master')).toBeVisible()
    await expect(button).toHaveScreenshot(`ds02a-gallery-button-${width}.png`)
    await expect(bar).toHaveScreenshot(`ds02a-gallery-actionbar-${width}.png`)
    const size = await button.boundingBox()
    expect(size).not.toBeNull()
    expect(size!.width).toBeLessThanOrEqual(width)

    const horizontalOverflow = await page.evaluate(() =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth)
    expect(horizontalOverflow, 'Gallery must not overflow horizontally').toBeLessThanOrEqual(0)
    assertSafe()
  })
}
