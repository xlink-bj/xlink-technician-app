import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true','Uses the existing opt-in R1-shaped Mock dataset')
test('19017 normal List/Detail uses the ordinary Survey reader with read-only ownership checks',async({page},info)=>{
 await page.setViewportSize({width:430,height:932})
 const remote:string[]=[],errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>{
  const req=r.request(),u=new URL(req.url())
  if(u.origin==='http://localhost:5174'&&req.method()==='GET')return r.continue()
  remote.push(req.method()+' '+u.pathname);return r.abort('blockedbyclient')
 })
 await page.routeWebSocket('**/*',s=>{if(new URL(s.url()).host==='localhost:5174')s.connectToServer();else{remote.push('WS');s.close()}})
 await page.goto('/#/pages/index/index');await expect(page.locator('.home-page')).toBeVisible()
 await page.locator('.work-orders-entry').click()
 await(await searchMockWorkOrder(page,{orderNum:'19017',customer:'邓先生'})).click()
 const action=page.getByTestId('task-focus-action')
 await expect(action).toHaveAttribute('aria-disabled','false');await expect(action).toContainText('打开表单')
 const dir=process.env.XLINK_FORM_ENTRY_SCREENSHOTS
 async function shot(name:string){if(dir){await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,name+'.png'),animations:'disabled',caret:'hide'})}}
 await shot('详情-19017-现场勘察节点')
 await action.click();await expect(page.getByTestId('normal-form-workspace-content')).toBeVisible()
 const read=page.getByTestId('r1-normal-form-read').locator('uni-button').filter({hasText:'读取已保存表单'})
 await read.click();await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
 await expect(page.getByTestId('r1-normal-value-width')).toHaveText('0')
 await expect(page.getByTestId('survey-leakage-cause-read')).toContainText('屋面节点')
 await expect(page.locator('[data-testid^="r1-normal-edit-"],[data-testid="r1-normal-create"],[data-testid="r1-normal-append"],[data-testid^="r1-normal-complete-"]')).toHaveCount(0)
 await shot('03h-勘查-普通Forms只读记录')
 const workspace=page.url();await page.reload();await read.click()
 await expect(page.getByTestId('r1-normal-value-width')).toHaveText('0')
 await page.getByTestId('normal-form-workspace-back').click();await expect(page).toHaveURL(/work-orders\/detail/)
 await action.click();await read.click();await expect(page.getByTestId('r1-normal-value-width')).toHaveText('0')
 await page.goto(workspace.replace('mock-workflow-node-017-inspection','foreign-node'))
 await expect(page.getByText('当前操作暂不可用',{exact:true})).toBeVisible()
 await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0)
 expect(remote).toEqual([]);expect(errors).toEqual([])
 await info.attach('read-only-ledger',{body:JSON.stringify({source:'DEV synthetic R1-shaped Mock',normalReader:true,productionRead:false,productionWrite:false,realSigning:false,remote,errors}),contentType:'application/json'})
})
