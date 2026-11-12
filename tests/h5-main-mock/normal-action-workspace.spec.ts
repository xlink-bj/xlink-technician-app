import { test, expect, type Page } from '@playwright/test'
import { normalWorkspaceFixture } from '../support/normal-workspace-fixture'
test.beforeEach(({}, info) => { test.skip(info.config.metadata.normalActionWorkspace !== true, 'Dedicated synthetic normal Workspace only') })
async function detail(page: Page) {
  await page.goto('/#/pages/index/index')
  await page.locator('.launch-cta').click()
  await page.locator('.method-card').filter({hasText:'快捷登录'}).click()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await page.locator('.work-order-card').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
}
async function open(page: Page) {
  await expect(page.getByTestId('r1-normal-form-read'), 'Detail owns no editing Panel in normal Workspace mode').toHaveCount(0)
  await expect(page.getByTestId('task-focus-action')).toBeEnabled()
  await page.getByTestId('task-focus-action').click()
  await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page.getByTestId('normal-form-workspace-content')).toBeVisible()
  await expect(page.getByTestId('action-workspace-shell')).toHaveCount(1)
  await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(1)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
}
const field = (p:Page,key:string)=>p.getByTestId('r1-normal-input-'+key)

test('normal action content uses existing controller and exact grant, then saves one first record', async({page,baseURL},info)=>{
  const f=await normalWorkspaceFixture(page,baseURL!)
  await detail(page);await open(page)
  await page.screenshot({path:info.outputPath('normal-workspace-430.png'),fullPage:true})
  await field(page,'memo').getByRole('textbox').fill('workspace synthetic')
  await field(page,'renamedChecks').getByText('合成甲',{exact:true}).click()
  await field(page,'renamedMulti').getByText('合成乙',{exact:true}).click()
  await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false')
  await page.getByTestId('r1-normal-save').click()
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
  expect(f.state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
  expect(f.state.payloads[0]).toMatchObject({memo:'workspace synthetic',renamedChecks:['a'],renamedMulti:['b']})
  expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})

test('normal content Back and browser Forward explicitly restores text and arrays without replay', async({page,baseURL})=>{
  const f=await normalWorkspaceFixture(page,baseURL!)
  await detail(page);await open(page)
  await field(page,'memo').getByRole('textbox').fill('retain through workspace')
  await field(page,'renamedChecks').getByText('合成甲',{exact:true}).click()
  await expect(page.getByTestId('r1-normal-draft-status')).toContainText('草稿已保存在本机')
  await page.getByTestId('normal-form-workspace-back').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await page.goForward()
  await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page.getByTestId('action-workspace-shell')).toHaveCount(1)
  await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(1)
  await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
  await expect(page.getByTestId('r1-normal-draft-restore')).toBeVisible()
  await page.getByTestId('r1-normal-draft-restore').click()
  await expect(field(page,'memo').getByRole('textbox')).toHaveValue('retain through workspace')
  await expect(field(page,'renamedChecks').locator('.app-choice--multi').filter({hasText:'合成甲'})).toHaveAttribute('aria-pressed','true')
  expect(f.state.writes).toEqual([]);expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})

test('normal content fresh handler revocation clears controls and refuses old local values', async({page,baseURL})=>{
  const f=await normalWorkspaceFixture(page,baseURL!)
  await detail(page);await open(page)
  await field(page,'memo').getByRole('textbox').fill('must not be reauthorized')
  await expect(page.getByTestId('r1-normal-draft-status')).toContainText('草稿已保存在本机')
  f.node.handlerIds=['revoked-role']
  await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
  await expect(field(page,'memo')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0)
  expect(f.state.writes).toEqual([]);expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})

// Fault injection at the real platform StoragePort boundary; no draft/model injection.
async function holdLocalWrite(page:Page){
 await page.evaluate(()=>{const api=(window as any).uni,original=api.setStorage.bind(api)
  const requests:any[]=[]
  ;(window as any).__normalStorage={arrived:false,count:()=>requests.length,
   release:(fail:boolean,index=0)=>fail?requests[index].fail?.({errMsg:'synthetic local storage failure'}):original(requests[index])}
  api.setStorage=(request:any)=>{if(!request.key.startsWith('draft:'))return original(request)
   requests.push(request);(window as any).__normalStorage.arrived=true}

 })
}
test('Uni H5 navigation-bar Back awaits the actual pending local write before leaving and preserves explicit recovery',async({page,baseURL})=>{
 const f=await normalWorkspaceFixture(page,baseURL!);await detail(page);await open(page)
 await holdLocalWrite(page);await field(page,'memo').getByRole('textbox').fill('queued before Back')
 await expect.poll(()=>page.evaluate(()=>(window as any).__normalStorage.arrived)).toBe(true)
 await page.locator('.uni-page-head-btn').first().click()
 await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
 await expect(field(page,'memo').getByRole('textbox')).toHaveValue('queued before Back')
 await field(page,'memo').getByRole('textbox').fill('latest edit while Back waits')
 await page.evaluate(()=>(window as any).__normalStorage.release(false))
 await expect.poll(()=>page.evaluate(()=>(window as any).__normalStorage.count())).toBe(2)
 await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
 await page.evaluate(()=>(window as any).__normalStorage.release(false,1))
 await expect(page).toHaveURL(/pages\/work-orders\/detail/);await open(page)
 await page.getByTestId('r1-normal-draft-restore').click()
 await expect(field(page,'memo').getByRole('textbox')).toHaveValue('latest edit while Back waits')
 expect(f.state.writes).toEqual([]);expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})
test('failed queued storage keeps the normal page and reports failure without generic fallback or replay',async({page,baseURL})=>{
 const f=await normalWorkspaceFixture(page,baseURL!);await detail(page);await open(page)
 await holdLocalWrite(page);await field(page,'memo').getByRole('textbox').fill('keep on failed disk')
 await expect.poll(()=>page.evaluate(()=>(window as any).__normalStorage.arrived)).toBe(true)
 await page.getByTestId('normal-form-workspace-back').click()
 await page.evaluate(()=>(window as any).__normalStorage.release(true))
 await expect(page.getByTestId('normal-form-workspace-content')).toContainText('本地草稿尚未保存')
 await expect(page.getByRole('alert')).toContainText('本地草稿尚未安全保存')
 await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
 expect(f.state.writes).toEqual([]);expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})
