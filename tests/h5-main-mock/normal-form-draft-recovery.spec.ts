import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
import {fixture,read,returnToForm,enter,open} from '../support/normal-form-draft-fixture'
test('normal App route restores unsaved ordinary values after back and reopen',async({page,baseURL},info)=>{
 const {state}=await fixture(page,baseURL!,'save')
 await open(page)
 const memo=()=>page.getByTestId('r1-normal-input-memo').getByRole('textbox')
 await memo().fill('现场草稿，离开后继续')
 await page.getByTestId('r1-normal-input-renamedChecks').locator('.app-choice--multi').filter({hasText:'合成乙'}).click()
 await page.screenshot({path:info.outputPath('before-leave.png'),fullPage:true})
 await leaveNormalFormForList(page)
 await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
 await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(0)
 await page.locator('.work-order-card').first().click();await enterNormalFormWorkspace(page)
 await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 await expect(page.getByTestId('r1-normal-create')).toBeVisible()
 await page.screenshot({path:info.outputPath('after-return.png'),fullPage:true})
 const restore=page.getByTestId('r1-normal-draft-restore')
 if(await restore.count())await restore.click()
 await expect(memo()).toHaveValue('现场草稿，离开后继续')
 await page.screenshot({path:info.outputPath('restored.png'),fullPage:true})
 await expect(page.getByTestId('r1-normal-input-renamedChecks').locator('.app-choice--multi').filter({hasText:'合成乙'})).toHaveAttribute('aria-pressed','true')
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
 await info.attach('synthetic-route-ledger',{body:JSON.stringify(state),contentType:'application/json'})
})

test('normal repeat route restores after refresh and fresh login',async({page,baseURL},info)=>{
 const {state}=await fixture(page,baseURL!,'repeat');await open(page)
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('复检尚未提交')
 const choices=page.getByTestId('r1-normal-input-renamedChecks');await choices.getByText('合成乙',{exact:true}).click()
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机')
 await page.reload();await open(page);await expect(page.getByTestId('r1-normal-draft-restore')).toBeVisible();await page.getByTestId('r1-normal-draft-restore').click()
 await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('复检尚未提交')
 await expect(page.getByTestId('r1-normal-input-renamedChecks').locator('[aria-pressed="true"]')).toContainText('合成乙')
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
 await page.screenshot({path:info.outputPath('repeat-restored.png'),fullPage:true})
})
test('explicit discard confirms intent and cannot revive on reopen',async({page,baseURL})=>{
 const {state}=await fixture(page,baseURL!,'save');await open(page)
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('放弃本地内容');await returnToForm(page)
 await page.getByTestId('r1-normal-draft-discard').click();await page.getByTestId('r1-normal-draft-keep').click()
 await expect(page.getByTestId('r1-normal-draft-restore')).toBeVisible();await page.getByTestId('r1-normal-draft-discard').click();await page.getByTestId('r1-normal-draft-discard-confirm').click()
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('已丢弃');await returnToForm(page)
 await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0);await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('');expect(state.writes).toEqual([])
})
test('fresh field permission drift preserves draft and refuses automatic restore',async({page,baseURL},info)=>{
 const {state,fields}=await fixture(page,baseURL!,'save');await open(page);await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('不能注入只读字段')
 fields[2].readOnly=1;await returnToForm(page)
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('字段配置或权限已变化');await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0)
 await expect(page.getByTestId('r1-normal-save')).toHaveCount(0);expect(state.writes).toEqual([])
 await page.screenshot({path:info.outputPath('permission-drift.png'),fullPage:true})
})
test('verified save clears local draft without confusing it with workflow completion',async({page,baseURL})=>{
 const {state}=await fixture(page,baseURL!,'save');await open(page)
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('已核实保存');await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('当前节点尚未完成')
 expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n']);await page.reload();await enter(page);await read(page)
 await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0);await expect(page.getByTestId('r1-normal-value-memo')).toHaveText('已核实保存')
})
test('uncertain save stays fenced after refresh and does not repeat a business command',async({page,baseURL},info)=>{
 const {state}=await fixture(page,baseURL!,'wrong-ack');await open(page)
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('保存回执不匹配');await page.getByTestId('r1-normal-input-renamedMulti').getByText('合成甲',{exact:true}).click()
 await page.getByTestId('r1-normal-save').click();await expect(page.getByTestId('r1-normal-draft-status')).toContainText('结果尚未核实')
 expect(state.writes).toEqual(['biz/extForm/upsert/e']);await page.reload();await enter(page);await read(page)
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('结果尚未核实');await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0);await expect(page.getByTestId('r1-normal-draft-discard')).toHaveCount(0)
 expect(state.writes).toEqual(['biz/extForm/upsert/e']);await page.screenshot({path:info.outputPath('uncertain.png'),fullPage:true})
})
test('local quota failure is visible and cannot be labelled as saved',async({page,baseURL})=>{
 const {state}=await fixture(page,baseURL!,'save');await open(page)
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('draft:'))throw new DOMException('synthetic quota','QuotaExceededError');return set.call(this,key,value)}})
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('仍在页面中的内容')
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('尚未保存');await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('仍在页面中的内容')
 await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true');expect(state.writes).toEqual([])
})

test('same-scope failed reread preserves local values and recovers only after a fresh successful read',async({page,baseURL})=>{
 const {state}=await fixture(page,baseURL!,'save');await open(page);const memo=()=>page.getByTestId('r1-normal-input-memo').getByRole('textbox')
 await memo().fill('弱网保留的当前内容');await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机')
 state.failRead=true;await read(page);await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('暂时无法完整核实');await expect(page.getByTestId('r1-normal-create')).toHaveCount(0)
 state.failRead=false;await read(page);await expect(memo()).toHaveValue('弱网保留的当前内容');await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0)
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([])
})

test('switching actual work orders does not expose or overwrite the first order draft',async({page,baseURL},info)=>{
 const {state}=await fixture(page,baseURL!,'switch-order');await open(page)
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('只属于第一工单')
 await leaveNormalFormForList(page);await expect(page.locator('.work-order-card')).toHaveCount(2);await page.locator('.work-order-card').last().click();await enterNormalFormWorkspace(page);await read(page)
 await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0);await expect(page.getByTestId('r1-normal-input-memo')).toHaveCount(0)
 await returnToForm(page);await page.getByTestId('r1-normal-draft-restore').click();await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('只属于第一工单');expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([])
 await page.screenshot({path:info.outputPath('order-isolation.png'),fullPage:true})
})
test('a cold H5 browser restart recovers only after fresh login and current reads',async({playwright,baseURL},info)=>{
 const profile=info.outputPath('synthetic-profile'),options={viewport:{width:430,height:932},serviceWorkers:'block' as const,...(process.env.XLINK_DRAFT_CHROME==='true'?{channel:'chrome'}:{})}
 let context=await playwright.chromium.launchPersistentContext(profile,options)
 const ledgersForRestart:unknown[]=[]
 try{
  let page=context.pages()[0]??await context.newPage();let f=await fixture(page,baseURL!,'save');ledgersForRestart.push(f.state);await open(page)
  await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('关闭浏览器后继续');await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机');await context.close()
  context=await playwright.chromium.launchPersistentContext(profile,options);page=context.pages()[0]??await context.newPage();f=await fixture(page,baseURL!,'save');ledgersForRestart.push(f.state);await open(page)
  await page.getByTestId('r1-normal-draft-restore').click();await expect(page.getByTestId('r1-normal-input-memo').getByRole('textbox')).toHaveValue('关闭浏览器后继续');expect(f.state.writes).toEqual([]);expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
  await page.screenshot({path:info.outputPath('cold-browser-restored.png'),fullPage:true})
 }finally{await context.close();await info.attach('cold-browser-synthetic-ledger',{body:JSON.stringify(ledgersForRestart),contentType:'application/json'})}
})

for(const delayed of [false,true])test(`old first-create discard preserves the current existing-record edit in the normal App${delayed?' with delayed cleanup':''}`,async({page,baseURL},info)=>{
 test.skip(process.env.XLINK_DRAFT_EXISTING_EDIT!=='true','Uses a separately explicit existing create/append/edit synthetic grant')
 const {state,node}=await fixture(page,baseURL!,'edit-shadow');await open(page)
 await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill('Old first-create draft');await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机')
 state.saved={_id:'existing',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',formDefId:'e',state:1,memo:'Existing server record',exts:{memo:'Existing server record'}}
 node.exts.formList=[{_id:'existing',formDefId:'e',state:1}]
 await returnToForm(page);await expect(page.getByTestId('r1-normal-draft-status')).toContainText('记录、字段配置或权限已变化')
 await page.getByTestId('r1-normal-edit-existing').click();const memo=page.getByTestId('r1-normal-input-memo').getByRole('textbox');await memo.fill('Current edited record')
 if(delayed)await page.evaluate(()=>{
  const api=(globalThis as any).uni,remove=api.removeStorage
  api.removeStorage=function(options:any){if(options.key.startsWith('draft:')){(globalThis as any).__releaseDraftRemoval=()=>remove.call(api,options)}else remove.call(api,options)}
 })
 await page.getByTestId('r1-normal-draft-discard').click();await page.getByTestId('r1-normal-draft-discard-confirm').click()
 if(delayed){
  await page.waitForFunction(()=>typeof(globalThis as any).__releaseDraftRemoval==='function')
  const readButton=page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})
  await expect(readButton).toHaveAttribute('aria-disabled','true')
  const reads=state.calls.length;await readButton.click({force:true});expect(state.calls.length).toBe(reads)
  await page.evaluate(()=>{(globalThis as any).__releaseDraftRemoval()})
 }
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('已丢弃');await expect(memo).toHaveValue('Current edited record');await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false')
 expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
 await page.screenshot({path:info.outputPath('old-create-discard-current-edit-preserved.png'),fullPage:true})
})
