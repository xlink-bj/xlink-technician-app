import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id

for (const width of [430, 375]) test(`${brand} attachment component states at ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: width === 430 ? 932 : 667 })
  const remote: string[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    remote.push(route.request().method()); return route.abort('blockedbyclient')
  })
  for (const mode of ['empty', 'uploaded', 'failed', 'readonly'] as const) {
    await page.goto('/#/pages/index/index')
    await expect(page.locator('.home-page')).toBeVisible()
    await page.evaluate(async mode => {
      const path = '/tests/h5-main-mock/fixtures/attachment-theme-states.ts'
      const { mountAttachmentState } = await import(path)
      await mountAttachmentState(mode)
    }, mode)
    const root = page.locator('#attachment-theme-state')
    await expect(root.locator('.r1-file-name')).toHaveCount(2)
    await expect(root.locator('.r1-file-preview')).toHaveCount(0)
    await expect(root.locator('.r1-file-name').first()).toContainText('详细位置说明.jpg')
    const add = page.getByTestId('order-media-add-theme-attachment')
    if (mode === 'readonly') await expect(add).toHaveAttribute('aria-disabled', 'true')
    else await expect(add).toHaveAttribute('aria-disabled', 'false')
    if (mode === 'failed') await expect(root.locator('.order-media-error')).toContainText('队列暂不可读')
    if (brand === 'yuhong') {
      await expect(root.locator('.r1-file-name').first()).toHaveCSS('font-size', '16px')
      expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      if (mode === 'failed') await expect(root.locator('.order-media-error')).toHaveCSS('color', 'rgb(180, 35, 24)')
      if (mode === 'readonly') await expect(add).toHaveCSS('background-color', 'rgb(229, 231, 232)')
    }
    expect(await root.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `.review/brand-media/${brand}-after/order-${mode}-${width}.png`, animations: 'disabled', caret: 'hide' })
    if (mode === 'uploaded') {
      const remove = page.getByTestId('order-media-remove-theme-attachment-0')
      await remove.click(); await expect(root.locator('.order-media-confirm')).toBeVisible()
      await page.screenshot({ path: `.review/brand-media/${brand}-after/order-confirm-${width}.png`, animations: 'disabled', caret: 'hide' })
      await page.getByTestId('order-media-cancel-theme-attachment').click()
      await expect(root.locator('.order-media-confirm')).toHaveCount(0)
      await expect(remove).toBeVisible()
      await remove.click(); await page.getByTestId('order-media-accept-theme-attachment').click()
      await expect(root.locator('.order-media-row')).toHaveCount(0)
    }
  }
  expect(remote).toEqual([]); expect(errors).toEqual([])
})
