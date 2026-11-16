import { test, expect } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand=process.env.VITE_XLINK_BRAND||'xlink'
const error=brand==='yuhong'?'rgb(180, 35, 24)':'rgb(23, 36, 58)'
test('signing read feedback distinguishes confirmed failure from processing unknown and conflicting records',async({page,baseURL})=>{
 const external:string[]=[],errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin===baseURL)return r.continue();external.push(r.request().method());return r.abort()})
 const mode=async(value:string)=>page.evaluate(async value=>{const p='/tests/h5-main-mock/fixtures/signing-read-theme-fixture.ts';(await import(p)).selectReadMode(value)},value)
 await page.goto('/#/pages/index/index');await expect(page.locator('.home-page')).toBeVisible()
 await page.locator('.work-orders-entry').click();await(await searchMockWorkOrder(page,{orderNum:'04009',customer:'陈女士'})).click();await page.getByTestId('task-focus-action').click()
 await page.evaluate(async()=>{const p='/tests/h5-main-mock/fixtures/signing-read-theme-fixture.ts';(await import(p)).installReadVariants()})
 const title=page.getByTestId('signing-read-stage-title')
 for(const state of ['contract-failed','exception','normal','unknown','conflict','signed','zero','many']){
  await mode(state);await page.getByTestId('quotation-hub-signing-mock-official-order-001').click()
  await expect(page.getByTestId('signing-order-read-verified')).toBeVisible();await page.getByTestId('signing-contract-read-request').click()
  const failure=state==='contract-failed'||state==='exception'
  await expect(title).toHaveCSS('color',failure?error:brand==='yuhong'?'rgb(25, 27, 30)':'rgb(23, 36, 58)')
  if(brand==='yuhong'){
   if(state==='contract-failed')await expect(page.locator('.signing-read-phase')).toHaveCount(0)
   else await expect(page.locator('.signing-read-phase')).toHaveCSS('color',failure?error:'rgb(85, 94, 100)')
   await expect(page.getByTestId('signing-review-next')).toHaveCSS('color',failure?error:'rgb(25, 27, 30)')
   if(state==='exception')await expect(page.locator('.signing-read-contract-state')).toHaveCSS('color',error)
  }
  if(state==='contract-failed'){
   await expect(page.getByTestId('signing-review-next')).toHaveText('合同核验失败，可重试')
   await mode('normal');await page.getByTestId('signing-contract-read-request').click()
   await expect(title).toHaveText('签约处理中')
   await expect(title).toHaveCSS('color',brand==='yuhong'?'rgb(25, 27, 30)':'rgb(23, 36, 58)')
  }
  await page.getByTestId('signing-order-read-return').click();await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
 }
 expect(external).toEqual([]);expect(errors).toEqual([])
})
