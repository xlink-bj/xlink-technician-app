import { test, expect } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import type { Page } from '@playwright/test'
test.beforeEach(({},info)=>test.skip(info.config.metadata.devMockDynamicFormWorkspace!==true,'Dedicated DEV special host only'))
test('DEV special active task uses one Workspace content, never a Detail side editor',async({page})=>{
 const external:string[]=[],errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin==='http://localhost:5174')return r.continue();external.push(r.request().url());return r.abort()})
 await page.goto('/#/pages/index/index?devReview=1');await page.locator('.work-orders-entry').click()
 await (await searchMockWorkOrder(page,'020')).click()
 await enterDevMockDynamicFormWorkspace(page)
 await expect(page.getByTestId('a-stage-special-panel')).toHaveCount(1)
 await expect(page.getByTestId('a-special-field-inspectionSummary')).toBeVisible()
 expect(external).toEqual([]);expect(errors).toEqual([])
})
async function start(page:Page){
 const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin==='http://localhost:5174')return r.continue();external.push(r.request().url());return r.abort()})
 await page.goto('/#/pages/index/index?devReview=1');await page.locator('.work-orders-entry').click()
 await (await searchMockWorkOrder(page,'020')).click();await enterDevMockDynamicFormWorkspace(page)
 return{errors,external}
}
async function serverSnapshot(page:Page){return page.evaluate(()=>(window as any).uni.getStorageSync('xlink.dev.mock.r1-special.020-021.v1'))}
test('Back waits the latest real platform draft write, then reentry restores only the saved draft',async({page})=>{
 const f=await start(page),before=await serverSnapshot(page)
 await page.evaluate(()=>{
  const api=(window as any).uni,original=api.setStorage.bind(api),requests:any[]=[]
  ;(window as any).__specialWrites={count:()=>requests.length,release:(index:number)=>original(requests[index])}
  api.setStorage=(o:any)=>o.key.startsWith('draft:')?requests.push(o):original(o)
 })
 const field=page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
 await field.fill('first pending');await expect.poll(()=>page.evaluate(()=>(window as any).__specialWrites.count())).toBe(1)
 await page.getByTestId('special-form-workspace-back').click()
 await expect(page).toHaveURL(/action-workspace/);await field.fill('latest pending before Back')
 await page.evaluate(()=>(window as any).__specialWrites.release(0))
 await expect.poll(()=>page.evaluate(()=>(window as any).__specialWrites.count())).toBe(2)
 await expect(page).toHaveURL(/action-workspace/);await page.evaluate(()=>(window as any).__specialWrites.release(1))
 await expect(page).toHaveURL(/work-orders\/detail/);await enterDevMockDynamicFormWorkspace(page)
 await expect(field).toHaveValue('latest pending before Back')
 expect(await serverSnapshot(page)).toEqual(before);expect(f.errors).toEqual([]);expect(f.external).toEqual([])
})
test('failed local write keeps Workspace and shows failure without a generic exit fallback',async({page})=>{
 const f=await start(page),before=await serverSnapshot(page)
 await page.evaluate(()=>{
  const api=(window as any).uni,original=api.setStorage.bind(api)
  api.setStorage=(o:any)=>o.key.startsWith('draft:')?o.fail?.({errMsg:'synthetic write failure'}):original(o)
 })
 await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('remain on disk failure')
 await expect(page.getByTestId('a-special-local-draft')).toContainText('本机保存失败')
 await page.getByTestId('special-form-workspace-back').click()
 await expect(page.getByRole('alert')).toContainText('尚未安全保存');await expect(page).toHaveURL(/action-workspace/)
 expect(await serverSnapshot(page)).toEqual(before);expect(f.errors).toEqual([]);expect(f.external).toEqual([])
})
test('failed completed tombstone preserves saved row and retries only local cleanup; reload does not revive the saved draft',async({page})=>{
 const f=await start(page)
 await page.evaluate(()=>{
  const api=(window as any).uni,original=api.setStorage.bind(api);let failed=false
  api.setStorage=(o:any)=>{
   if(!failed&&o.key.startsWith('draft:')&&JSON.parse(o.data).status==='completed'){failed=true;o.fail?.({errMsg:'synthetic tombstone failure'});return}
   return original(o)
  }
 })
 const field=page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
 await field.fill('saved once, local cleanup retry')
 await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({hasText:'需要跟进'}).click()
 await page.getByTestId('a-special-save').click()
 await expect(page.getByTestId('a-special-cleanup-pending')).toBeVisible()
 await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(1)
 await expect(page.getByTestId('a-special-save')).toHaveCount(0)
 const before=await serverSnapshot(page);await page.getByTestId('special-form-workspace-back').click()
 await expect(page.getByRole('alert')).toContainText('尚未安全保存')
 await page.getByTestId('a-special-cleanup-retry').click();await expect(page.getByTestId('a-special-cleanup-pending')).toHaveCount(0)
 await expect(field).toHaveValue('');await page.reload();await expect(field).toHaveValue('')
 await field.fill('new legitimate generation')
 await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
 await page.getByTestId('special-form-workspace-back').click();await expect(page).toHaveURL(/work-orders\/detail/)
 await enterDevMockDynamicFormWorkspace(page);await expect(field).toHaveValue('new legitimate generation')
 await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-2')).toHaveCount(0)
 expect(await serverSnapshot(page)).toEqual(before);expect(f.errors).toEqual([]);expect(f.external).toEqual([])
})
test('cold reload after tombstone failure cannot restore the submitted draft or issue another save',async({page})=>{
 const f=await start(page)
 await page.evaluate(()=>{
  const api=(window as any).uni,original=api.setStorage.bind(api)
  api.setStorage=(o:any)=>o.key.startsWith('draft:')&&JSON.parse(o.data).status==='completed'
   ?o.fail?.({errMsg:'synthetic persistent tombstone failure'}):original(o)
 })
 await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('do not revive after committed save')
 await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({hasText:'需要跟进'}).click()
 await page.getByTestId('a-special-save').click();await expect(page.getByTestId('a-special-cleanup-pending')).toBeVisible()
 const before=await serverSnapshot(page);await page.reload()
 await expect(page.getByTestId('a-special-local-submission-pending')).toBeVisible()
 await expect(page.getByTestId('a-special-sealed-value').filter({hasText:'do not revive after committed save'})).toBeVisible()
 await expect(page.getByTestId('a-special-field-inspectionSummary')).toHaveCount(0)
 await expect(page.getByTestId('a-special-save')).toHaveCount(0)
 await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(1)
 expect(await serverSnapshot(page)).toEqual(before);expect(f.errors).toEqual([]);expect(f.external).toEqual([])
})
