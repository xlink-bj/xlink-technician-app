import {test,expect} from '@playwright/test'
import {fixture,enter,read} from '../support/normal-form-draft-fixture'
test.beforeEach(({},info)=>test.skip(info.config.metadata.normalFormFreshOriginal!==true,'Use the dedicated fresh-original configuration'))
async function setup(page:any,baseURL:string){
 const f=await fixture(page,baseURL,'edit-shadow')
 f.state.saved={_id:'existing',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',formDefId:'e',state:1,memo:'Existing server record',exts:{memo:'Existing server record'}}
 f.node.exts.formList=[{_id:'existing',formDefId:'e',state:1}]
 await enter(page);await read(page);await page.getByTestId('r1-normal-edit-existing').click()
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('Current unsaved edited value')
 return f
}
test('same original keeps editor; same-ID changed backend version invalidates stale editor',async({page,baseURL},info)=>{
 const {state}=await setup(page,baseURL!)
 await read(page);await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('Current unsaved edited value')
 state.saved.memo='New server revision';state.saved.exts.memo='New server revision'
 await read(page)
 await expect(page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})).toHaveAttribute('aria-disabled','false')
 await info.attach('settled-version-observation',{body:JSON.stringify({displayed:await page.getByTestId('r1-normal-value-memo').innerText(),editor:await page.getByTestId('r1-normal-input-memo').getByRole('textbox').count()?await page.getByTestId('r1-normal-input-memo').getByRole('textbox').inputValue():null,saveCount:await page.getByTestId('r1-normal-save').count(),saveDisabled:await page.getByTestId('r1-normal-save').count()?await page.getByTestId('r1-normal-save').getAttribute('aria-disabled'):null}),contentType:'application/json'})
 await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('未保存内容已失效')
 await page.getByTestId('r1-normal-edit-existing').click()
 await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('New server revision')
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
})
test('read failures preserve the original baseline, never adopt changed backend values as authorization',async({page,baseURL},info)=>{
 const {state}=await setup(page,baseURL!)
 state.failRead=true;await read(page);await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('暂时无法完整核实')
 state.failRead=false;await read(page)
 await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('Current unsaved edited value')
 state.failRead=true;await read(page);await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('暂时无法完整核实')
 state.saved.memo='Changed while offline';state.saved.exts.memo='Changed while offline';state.failRead=false;await read(page)
 await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('未保存内容已失效')
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
})
