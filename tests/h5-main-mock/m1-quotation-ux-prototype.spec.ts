import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const prototypePath = resolve(process.cwd(), '__review/concepts/m1-quotation-four-surface.html')
const prototypeUrl = pathToFileURL(prototypePath).href

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`#41 proposal: four state mobile quotation interaction ${viewport.width}px, no business calls`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const intents: string[] = []
    const errors: string[] = []
    page.on('request', request => {
      // Even a blocked request is a defect in the offline design concept.
      if (!request.url().startsWith('file:')) intents.push(request.method() + ' ' + request.url())
    })
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    await page.goto(prototypeUrl)

    const image = async (stage: string) => info.attach(`owner-ux-v2-${stage}-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    await expect(page.getByTestId('ux-synthetic-badge')).toContainText('合成数据')
    await expect(page.getByTestId('ux-stage-workbench')).toBeVisible()
    await expect(page.getByTestId('ux-stage-catalog')).toBeHidden()
    await expect(page.getByTestId('ux-footer-title')).toContainText('0 项')
    await image('01-workbench')
    await page.getByTestId('ux-nav-catalog').click()

    await expect(page.getByTestId('ux-stage-catalog')).toBeVisible()
    await expect(page.getByTestId('ux-tab-package')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('ux-stage-catalog')).toContainText('价格尚未核验')
    await image('02-visual-catalog')
    await page.getByTestId('ux-select-package').click()

    await expect(page.getByTestId('ux-stage-config')).toBeVisible()
    await expect(page.getByTestId('ux-layer-count')).toContainText('2 / 2')
    await expect(page.getByTestId('ux-quantity')).toContainText('12')
    await image('03-configure')
    await page.getByTestId('ux-qty-plus').click()
    await page.getByTestId('ux-select-layer-b').click()
    await expect(page.getByTestId('ux-stage-config')).toContainText('柔性防水材料 C')
    await page.getByTestId('ux-primary').click()

    await expect(page.getByTestId('ux-stage-return')).toBeVisible()
    await expect(page.getByTestId('ux-return-quantity')).toContainText('13')
    await expect(page.getByTestId('ux-return-material')).toContainText('防水材料 C')
    await expect(page.getByTestId('ux-stage-return')).toContainText('部位 02')
    await expect(page.getByTestId('ux-footer-title')).toContainText('1 项 · 本机草稿')
    await image('04-return')

    // A changed choice remains visible when editing, without inventing
    // actual stock, price, Order.type=1 or signing authority.
    await page.getByTestId('ux-change-config').click()
    await expect(page.getByTestId('ux-quantity')).toContainText('13')
    await expect(page.getByTestId('ux-stage-config')).toContainText('柔性防水材料 C')
    await page.getByTestId('ux-back').click()
    await expect(page.getByTestId('ux-stage-catalog')).toBeVisible()
    await page.getByTestId('ux-back').click()
    await expect(page.getByTestId('ux-stage-workbench')).toBeVisible()
    expect(intents).toEqual([])
    expect(errors).toEqual([])
  })
}

test('#41 isolated visual review cannot submit a business Order, call sign providers or fetch PII', () => {
  const source = readFileSync(prototypePath, 'utf8')
  expect(source).toContain('设计方案 · 合成数据')
  expect(source).toContain('签约须基于后端已确认的 type=1 正式订单')
  expect(source).not.toMatch(/https?:\/\//)
  expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|uni\.request|axios|sendMessage|orderConfirm|applyForElectronicSignature/)
  expect(source).not.toMatch(/<form\b/i)
  expect(source).not.toContain('<iframe')
})
