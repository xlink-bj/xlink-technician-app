import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = process.env.VITE_XLINK_BRAND || 'xlink'
const phase = process.env.P05_PHASE || 'after'
for (const viewport of [{width:430,height:932},{width:375,height:667},{width:390,height:844}]) {
  test(`P05 quotation draft hierarchy ${viewport.width}x${viewport.height}`, async ({page, baseURL}, info) => {
    await page.setViewportSize(viewport)
    const layouts: unknown[] = []
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(baseURL!).origin) return route.continue()
      external.push(route.request().url()); return route.abort()
    })
    const dir = resolve('.review/雨虹UIUX优化-20261116/P05', `${brand}-${phase}`)
    await mkdir(dir, {recursive:true})
    const capture = async (name:string) => {
      const path = resolve(dir, `${viewport.width}x${viewport.height}-${name}.png`)
      layouts.push({name, footer:await page.getByTestId('app-action-bar').boundingBox(), viewport})
      await writeFile(resolve(dir, `${viewport.width}x${viewport.height}-layout.json`), JSON.stringify(layouts,null,2))
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({path})
      await info.attach(name,{path,contentType:'image/png'})
    }
    await page.goto('/#/pages/index/index?devReview=1', {waitUntil:'domcontentloaded'})
    await page.locator('.work-orders-entry').click()
    await (await searchMockWorkOrder(page,{orderNum:'26018',customer:'吴先生'})).click()
    await page.locator('.primary-task-action').click()
    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await expect(page.getByTestId('quotation-first-step-next')).toBeVisible()
    await expect(page.locator('.uni-page-head__title')).toHaveText('新增订单')
    await expect(page.getByTestId('action-workspace-shell')).toContainText('吴先生')
    await expect(page.getByTestId('action-workspace-shell')).toContainText('望京花园西区')
    const yuhongToken = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--yh-palette-brand-600').trim())
    expect(Boolean(yuhongToken)).toBe(brand === 'yuhong')
    for (const id of ['quotation-first-step-next','quotation-first-step-save-draft']) {
      expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByTestId('quotation-footer-summary')).toContainText('待核验')
    await expect(page.getByTestId('quotation-footer-summary')).not.toContainText('¥0')
    if (phase === 'after') {
      await expect(page.getByTestId('quotation-first-step-draft-notice')).toBeHidden({timeout:5000})
    }
    await capture('entry')
    await page.getByTestId('quotation-first-step-next').click()
    await expect(page.getByTestId('quotation-first-step-repair-parts-error')).not.toBeEmpty()
    const errorBox = await page.getByTestId('quotation-first-step-repair-parts-error').boundingBox()
    expect(errorBox!.y).toBeGreaterThanOrEqual(44)
    expect(errorBox!.y + errorBox!.height).toBeLessThan((await page.getByTestId('app-action-bar').boundingBox())!.y)
    await capture('required-error')
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByRole('dialog',{name:'选择维修部位'}).locator('.app-cascade-selector__parents').getByText('屋面',{exact:true}).click()
    await page.getByTestId('quotation-repair-part-picker-done').click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('平屋面泛水节点维修')
    const quantity = page.getByTestId('quotation-first-step-quantity').locator('input')
    await quantity.fill('18.5')
    await expect(page.getByTestId('quotation-first-step-description-error')).toBeEmpty()
    await expect(page.getByTestId('quotation-first-step-quantity-error')).toBeEmpty()
    await page.getByTestId('quotation-first-step-save-draft').click()
    await quantity.scrollIntoViewIfNeeded()
    // Native scroll-view must leave the final field above the sticky action bar.
    const fieldBox = await quantity.boundingBox()
    const footerBox = await page.getByTestId('app-action-bar').boundingBox()
    expect(fieldBox!.y + fieldBox!.height).toBeLessThanOrEqual(footerBox!.y)
    await capture('last-field')
    await page.getByTestId('quotation-first-step-next').click()
    await expect(page.getByTestId('quotation-catalog-kind-material')).toBeVisible()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-ordinary-1').click()
    if (await page.getByTestId('quotation-catalog-close').isVisible()) await page.getByTestId('quotation-catalog-close').click()
    await expect(page.getByTestId('quotation-review-orders')).toBeVisible()
    await capture('detail-footer')
    if (phase === 'after') {
      await expect(page.getByTestId('quotation-workspace-draft-boundary')).toContainText('报价草稿')
      await expect(page.getByTestId('quotation-readonly-handoff')).toContainText('不提交订单或发起签约')
    }
    // Inject only local draft-storage failure in this isolated Mock browser.
    // The shortened handoff must still refuse navigation and retain input.
    await page.evaluate(() => {
      const api = (window as unknown as {uni: {setStorage: (options: {fail?: (error:unknown)=>void}) => void}}).uni
      const original = api.setStorage
      Object.assign(window, {p05RestoreStorage: () => { api.setStorage = original }})
      api.setStorage = options => options.fail?.({errMsg:'Synthetic P05 local storage failure'})
    })
    const description = page.getByTestId('quotation-group-description-quotation-group-1').locator('textarea')
    await description.fill('保存失败时保留的维修说明')
    await page.getByTestId('quotation-review-orders').click()
    await expect(page.getByTestId('quotation-review-orders-error')).toBeVisible()
    await expect(page.getByTestId('quotation-review-orders-error')).toContainText('尚未保存成功')
    await expect(description).toHaveValue('保存失败时保留的维修说明')
    await expect(page.getByTestId('quotation-order-hub')).toHaveCount(0)
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await capture('save-failure')
    await page.evaluate(() => (window as unknown as {p05RestoreStorage:()=>void}).p05RestoreStorage())
    expect(external).toEqual([])
    expect(errors).toEqual([])
  })
}
