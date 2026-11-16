import { test, expect, type Page } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
const brand=selectBrand(process.env.VITE_XLINK_BRAND).id
const phase=process.env.P07_PHASE || 'after'
const base=`.review/雨虹UIUX优化-20261116/P07/${phase}/${brand}`
async function open(page:Page,kind:'forms'|'repeat'='forms') {
 await page.goto('/#/pages/index/index');await expect(page.locator('.home-page')).toBeVisible()
 await page.locator('.work-orders-entry').click()
 await (await searchMockWorkOrder(page,kind==='forms'?'020':'021')).click()
 await enterDevMockDynamicFormWorkspace(page)
 await expect(page.getByTestId('a-special-save')).toBeVisible()
}
async function fill(page:Page,value:string){
 await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill(value)
 await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({hasText:'需要跟进'}).click()
 await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
}
async function shot(page:Page,name:string,anchor='a-special-finish-request'){
 await page.getByTestId(anchor).scrollIntoViewIfNeeded()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
 await page.screenshot({path:`${base}/${page.viewportSize()!.width}x${page.viewportSize()!.height}/${name}.png`,animations:'disabled',caret:'hide'})
}
test.beforeEach(async({page,baseURL})=>{
 page.setDefaultTimeout(12000)
 page.on('pageerror',error=>{throw error})
 await page.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort('blockedbyclient'))
})
for(const [width,height] of [[430,932],[375,667]])test(`saved records versus unsaved editor ${brand} ${width}`,async({page})=>{
 await page.setViewportSize({width,height});await open(page)
 await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled','true')
 await expect(page.getByTestId('a-special-finish-request')).toHaveAttribute('aria-disabled','false')
 await shot(page,'01-已有记录-空新增')
 await fill(page,'当前新增内容尚未作为记录保存')
 await shot(page,'02-填写但未保存记录')
 await page.getByTestId('a-special-finish-request').click()
 await shot(page,'03-完成确认-保留未保存内容','a-special-finish-confirm')
 if(phase==='before')return
 await expect(page.getByTestId('a-special-finish-confirm')).toHaveAttribute('aria-disabled','true')
 await expect(page.getByTestId('a-special-finish-confirm-copy')).toContainText('尚未保存为记录')
 const original=await page.evaluate(()=>(window as any).uni.getStorageSync('xlink.dev.mock.r1-special.020-021.v1'))
 await page.getByTestId('a-special-finish-confirm').click()
 expect(await page.evaluate(()=>(window as any).uni.getStorageSync('xlink.dev.mock.r1-special.020-021.v1'))).toEqual(original)
 await shot(page,'03b-确认区返回可达','a-special-finish-back')
 const backBox=(await page.getByTestId('a-special-finish-back').boundingBox())!,footerBox=(await page.locator('.action-workspace-footer').boundingBox())!
 expect(backBox.y+backBox.height).toBeLessThanOrEqual(footerBox.y+1)
 await page.getByTestId('a-special-finish-back').click()
 await expect(page.getByTestId('a-special-field-inspectionSummary').locator('textarea')).toHaveValue('当前新增内容尚未作为记录保存')
 await page.reload()
 await expect(page.getByTestId('a-special-field-inspectionSummary').locator('textarea')).toHaveValue('当前新增内容尚未作为记录保存')
 await page.getByTestId('a-special-save').click()
 await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText('当前新增内容尚未作为记录保存')
 await page.getByTestId('a-special-finish-request').click()
 await expect(page.getByTestId('a-special-finish-confirm')).toHaveAttribute('aria-disabled','false')
 await shot(page,'04-已保存-完成确认','a-special-finish-confirm')
 await page.getByTestId('a-special-finish-confirm').click()
 await expect(page.getByTestId('a-special-complete')).toBeVisible()
 await expect(page.getByTestId('a-special-save')).toHaveCount(0)
 await shot(page,'05-当前节点完成','a-special-complete')
 await page.reload()
 await expect(page.getByTestId('a-special-complete')).toBeVisible()
})

test('empty new editor can complete existing records; repeat changed edit cannot be omitted',async({page})=>{
 test.skip(phase==='before')
 await page.setViewportSize({width:430,height:932});await open(page)
 await page.getByTestId('a-special-finish-request').click()
 await expect(page.getByTestId('a-special-finish-confirm')).toHaveAttribute('aria-disabled','false')
 await page.getByTestId('a-special-finish-confirm').click()
 await expect(page.getByTestId('a-special-complete')).toBeVisible()
 await open(page,'repeat');await fill(page,'复检保存原记录');await page.getByTestId('a-special-save').click()
 await page.getByTestId('a-special-edit-mock-special-form-data-repeat-1').click()
 await page.getByTestId('a-special-finish-request').click()
 await expect(page.getByTestId('a-special-finish-confirm')).toHaveAttribute('aria-disabled','false')
 await page.getByTestId('a-special-finish-back').click()
 await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('尚未保存的复检修改')
 await page.getByTestId('a-special-finish-request').click()
 await expect(page.getByTestId('a-special-finish-confirm')).toHaveAttribute('aria-disabled','true')
 await shot(page,'06-复检编辑-未保存禁止遗漏','a-special-finish-confirm')
})
test('pending attachment and local save failure keep inputs and block completion dispatch',async({page})=>{
 test.skip(phase==='before');await page.setViewportSize({width:430,height:932});await open(page);await fill(page,'附件失败时保留的现场说明')
 await page.evaluate(()=>sessionStorage.setItem('xlink:e2e:fail-next-media-upload','retryable'))
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByTestId('a-special-media-pick-inspectionFiles').click()])
 await chooser.setFiles({name:'synthetic-p07.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WS+QX8AAAAASUVORK5CYII=','base64')})
 await expect(page.getByTestId('a-special-media-retry-inspectionFiles')).toBeVisible()
 await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled','true')
 await expect(page.getByTestId('a-special-finish-request')).toHaveAttribute('aria-disabled','true')
 await expect(page.getByTestId('a-special-finish-readiness')).toContainText('附件尚未处理完成')
 await shot(page,'07-附件待处理-不能完成')
 await page.reload();await expect(page.getByTestId('a-special-field-inspectionSummary').locator('textarea')).toHaveValue('附件失败时保留的现场说明')
 await expect(page.getByTestId('a-special-media-retry-inspectionFiles')).toBeVisible()
 await page.getByTestId('a-special-media-retry-inspectionFiles').click()
 await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
 await page.evaluate(()=>{const api=(window as any).uni,write=api.setStorage.bind(api);api.setStorage=(o:any)=>o.key.startsWith('draft:')?o.fail?.({errMsg:'synthetic local failure'}):write(o)})
 await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('本机保存失败仍保留内容')
 await expect(page.getByTestId('a-special-local-draft')).toContainText('本机保存失败')
 await page.getByTestId('a-special-save').click()
 await expect(page.getByTestId('a-special-operation-feedback')).toContainText('尚未安全保存')
 await expect(page.getByTestId('a-special-field-inspectionSummary').locator('textarea')).toHaveValue('本机保存失败仍保留内容')
 await shot(page,'08-本机保存失败-保留输入','a-special-operation-feedback')
})
test('save-and-complete unknown result stays fenced after restart',async({page})=>{
 test.skip(phase==='before');await page.setViewportSize({width:430,height:932});await open(page);await fill(page,'完成回执未知时保留现场记录')
 await page.evaluate(()=>{
  const api=(window as any).uni,write=api.setStorageSync.bind(api)
  api.setStorageSync=(key:string,value:unknown)=>{
   const r=write(key,value)
   if(key==='xlink.dev.mock.r1-special.020-021.v1'&&typeof value==='string'&&JSON.parse(value)?.forms?.state===10&&!sessionStorage.getItem('p07-lost-ack')){
    sessionStorage.setItem('p07-lost-ack','1');throw Error('synthetic lost acknowledgement')
   }return r
  }
 })
 await page.getByTestId('a-special-save-finish-request').click()
 await shot(page,'09-保存本条并完成-明确双步骤','a-special-save-finish-confirm')
 await page.getByTestId('a-special-save-finish-confirm').click()
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('p07-lost-ack'))).toBe('1')
 await expect(page.getByTestId('a-special-complete')).toHaveCount(0)
 await page.reload()
 await expect(page.getByTestId('a-special-receipt-pending')).toBeVisible()
 await shot(page,'10-完成结果未知-禁止重复','a-special-receipt-pending')
 await expect(page.getByTestId('a-special-task-state')).toContainText('结果待核对')
 await expect(page.getByTestId('a-special-complete')).toHaveCount(0)
 await expect(page.getByTestId('a-special-save')).toHaveCount(0)
})

test('generic dynamic form action bar keeps write gates and readable priority',async({page})=>{
 test.skip(phase==='before');await page.setViewportSize({width:375,height:667})
 await page.goto('/#/pages/index/index?devReview=1')
 await page.getByTestId('mock-continuous-journey-entry').click()
 await page.locator('.action-content-field--note textarea').fill('P07 本机测试旅程')
 await page.getByTestId('mock-journey-advance').click()
 await page.getByTestId('task-focus-action').click()
 await expect(page.getByTestId('dynamic-form-save-status')).toContainText('尚未保存为记录')
 await expect(page.getByTestId('dynamic-form-save')).toHaveAttribute('aria-disabled','true')
 await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('aria-disabled','true')
 await shot(page,'11-通用表单底栏-不放开权限','dynamic-form-save-status')
})
