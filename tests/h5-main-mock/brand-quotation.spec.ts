import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = process.env.VITE_XLINK_BRAND || 'xlink'
for (const width of [430, 375]) {
  test(`build-selected ${brand} quotation pages and field states at ${width}`, async ({ page, baseURL }) => {
    const height = width === 430 ? 932 : 667
    await page.setViewportSize({ width, height })
    const origin = new URL(baseURL!).origin, errors: string[] = [], remote: string[] = []
    expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname)
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue()
      : (remote.push(route.request().method()), route.abort('blockedbyclient')))
    const dir = `.review/yuhong-quotation/${brand}-pages`
    await mkdir(dir, { recursive: true })
    const capture = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `${dir}/${name}-${width}x${height}.png`, animations: 'disabled' })
    }
    await page.goto('/#/pages/index/index')
    await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click()
    await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
    await page.getByTestId('task-focus-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-create-unverified')).toBeVisible()
    await expect(page.getByTestId('quotation-order-hub')).not.toContainText(/SYNTHETIC|DEV-Q00|Mock|设计样本/)
    await capture('01-orders-read-state')
    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await capture('02-quote-entry')
    await page.getByTestId('quotation-add-group').click()
    const title = page.getByTestId('q01-design-title')
    await expect(title).toBeVisible()
    if (brand === 'yuhong') {
      expect(await title.evaluate(el => {
        const style = getComputedStyle(el); return [style.fontSize, style.lineHeight, style.fontWeight]
      })).toEqual(['20px', '28px', '600'])
      expect(await page.getByTestId('quotation-first-step-quantity').evaluate(el => {
        const style = getComputedStyle(el); return [style.borderTopWidth, style.borderTopLeftRadius, style.fontSize]
      })).toEqual(['1px', '4px', '16px'])
    }
    const description = page.getByTestId('quotation-first-step-description').locator('textarea')
    await description.fill('屋面落水口周边维修，保留原有报价与权限规则')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await expect(page.getByRole('dialog', { name: '选择维修部位' })).toBeVisible()
    await capture('03-repair-part-picker')
    await page.getByRole('dialog', { name: '选择维修部位' }).locator('.app-cascade-selector__parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-repair-part-picker-done').click()
    await capture('04-repair-fields')
    // P05 keeps one workspace draft boundary. Verify the real final input and
    // remaining fee explanation can both clear the fixed action bar.
    const lastField = page.getByTestId('quotation-first-step-quantity').locator('input')
    const lastCopy = page.getByTestId('quotation-cost-adjustments').locator('.q01-screen__cost-hint')
    await expect(lastField).toBeEditable()
    await expect(lastCopy).toHaveText('折扣、优惠及增减项应以已验证的业务规则和服务端金额为准。')
    for (const [name, target] of [['04a-last-field', lastField], ['04b-last-copy', lastCopy]] as const) {
      await target.scrollIntoViewIfNeeded()
      await expect(target).toBeVisible()
      await expect(target).toBeInViewport({ ratio: 1 })
      const lastBox = (await target.boundingBox())!, footerBox = (await page.getByTestId('app-action-bar').boundingBox())!
      expect(lastBox.y).toBeGreaterThanOrEqual(44)
      expect(lastBox.x).toBeGreaterThanOrEqual(0)
      expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(width + 1)
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(footerBox.y + 1)
      await capture(name)
    }
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await capture('05-catalog')
    await page.getByTestId('quotation-catalog-kind-material').click()
    const material = page.getByTestId('quotation-catalog-item-material-mock-catalog-material-sealant')
    await expect(material).toBeVisible()
    await capture('06-material-catalog')
    await page.getByTestId('quotation-material-options-mock-catalog-material-sealant').click()
    await expect(page.getByTestId('quotation-material-sku-preview')).toBeVisible()
    await capture('07-material-specification')
    const footer = page.getByTestId('quotation-sku-preview-return')
    const box = (await footer.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    if (brand === 'yuhong') expect(box.x).toBeGreaterThanOrEqual(16)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
    expect(box.height).toBeGreaterThanOrEqual(44)
    await footer.click()
    await page.getByTestId('quotation-catalog-return').click()
    await expect(description).toHaveValue('屋面落水口周边维修，保留原有报价与权限规则')
    expect(errors).toEqual([]); expect(remote).toEqual([])
  })
}

for (const mode of ['readonly', 'error'] as const) test(`build-selected ${brand} ${mode} quotation fields`, async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  await page.setViewportSize({ width: 430, height: 932 })
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await mkdir(`.review/yuhong-quotation/${brand}-pages`, { recursive: true })
    await page.evaluate(async mode => {
      const modulePath = '/tests/h5-main-mock/fixtures/quotation-theme-states.ts'
      const module = await import(/* @vite-ignore */ modulePath)
      ;(window as any).__unmountQuotationState = await module.mountQuotationFieldState(mode)
    }, mode)
    const root = page.locator('#quotation-field-state')
    if (mode === 'readonly') {
      await expect(root.getByTestId('quotation-first-step-quantity').locator('input')).toBeDisabled()
      if (brand === 'yuhong') {
        expect(await root.getByTestId('quotation-first-step-quantity').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(244, 245, 245)')
        expect(await root.getByTestId('quotation-preview-disabled-action').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(229, 231, 232)')
      }
    } else {
      await expect(root.getByTestId('quotation-first-step-quantity-error')).toContainText('请输入合法工程量')
      if (brand === 'yuhong') expect(await root.getByTestId('quotation-first-step-quantity').evaluate(el => {
        const style = getComputedStyle(el); return [style.borderTopWidth, style.borderTopColor]
      })).toEqual(['2px', 'rgb(180, 35, 24)'])
    }
    await page.screenshot({ path: `.review/yuhong-quotation/${brand}-pages/08-fields-${mode}-430x932.png` })
    await page.evaluate(() => (window as any).__unmountQuotationState())
})
