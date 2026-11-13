import { test, expect, type Page } from '@playwright/test'
import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import { normalRepeatWorkspaceFixture } from '../support/normal-repeat-workspace-fixture'
test.beforeEach(({},info)=>test.skip(info.config.metadata.normalRepeatWorkspace!==true,'Dedicated intercepted normal Repeat only'))
async function open(page:Page){
 await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click()
 await page.locator('.method-card').filter({hasText:'快捷登录'}).click()
 await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click()
 await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read(page)
}
async function read(page:Page){await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()}
for(const mode of ['normal','wrong-ack','revoked'] as const){
 test(`main Repeat ${mode}: same Workspace, original save and distinct main completion wire`,async({page,baseURL},info)=>{
  const f=await normalRepeatWorkspaceFixture(page,baseURL!,mode)
  try{
   await open(page)
   await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
   await page.getByTestId('r1-normal-input-fieldMemo').getByRole('textbox').fill('Repeat retained in original controller')
   await page.getByTestId('r1-normal-input-fieldZero').getByRole('spinbutton').fill('0')
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false')
   await page.getByTestId('r1-normal-save').click()
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
   expect(f.state.writes).toEqual(['biz/extForm/upsert/e'])
   expect(f.state.saved).toMatchObject({fieldMemo:'Repeat retained in original controller',fieldZero:0,exts:{fieldMemo:'Repeat retained in original controller'}})
   expect(f.node.state).toBe(0)
   await expect(page.getByTestId('r1-normal-edit-saved')).toHaveCount(0)
   if(mode==='revoked'){
    f.revoke();await read(page)
    await expect(page.getByTestId('r1-normal-complete-request')).toHaveCount(0)
    expect(f.state.writes).toHaveLength(1)
   }else{
    await page.getByTestId('r1-normal-complete-request').click()
    expect(f.state.writes).toHaveLength(1)
    await page.getByTestId('r1-normal-complete-confirm').click()
    await expect.poll(()=>f.state.writes.length).toBe(2)
    if(mode==='wrong-ack'){
     await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('流程结果尚未核实，请勿重复提交')
     await expect(page.getByTestId('r1-normal-complete-confirm')).toHaveCount(0)
     await read(page)
     await expect(page.getByTestId('r1-normal-complete-request')).toHaveCount(0)
     expect(f.node.state).toBe(0)
    }else{
     await expect(page.getByTestId('normal-form-workspace-content')).toHaveCount(0)
     expect(f.node.state).toBe(1)
    }
    expect(f.state.writes).toEqual(['biz/extForm/upsert/e','workflow/process'])
   }
   expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
  }finally{await info.attach('normal-repeat-ledger',{body:JSON.stringify({mode,...f.state},null,2),contentType:'application/json'})}
 })
}
