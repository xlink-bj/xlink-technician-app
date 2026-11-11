import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_ORDINARY_CREATE_DRAFT!=='true','Opt-in synthetic ordinary scalar first-create hidden draft')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[['visitDate','date'],['visitTime','time'],['visitAt','datetime'],['mode','text'],['followupAt','datetime'],['memo','text']].map(([name,type],i)=>({_id:'field-'+i,name,nameDisp:name,type,tenantId:'t',extId:'e',colName:'syntheticSchedule',state:1,required:name==='followupAt'?'1':'0',preset:i===0||i===2?1:0,multiple:false,readOnly:0,operationType:'1',showList:['4'],frontEndConfig:'{}',customizeFlag:1,showType:name==='followupAt'?'3':'1',...(name==='followupAt'?{showField:'mode',showValue:'on',showFieldPreset:0}:{})}))
 if(mode==='reject-empty')fields[4].showType='2'
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通时间条件',orderNum:'SYNTHETIC-ORDINARY-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成六字段新建',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 page.on('pageerror',()=>state.errors.push('pageerror'))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{state.unexpected.push('external-websocket');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==baseURL){state.unexpected.push('external');return route.abort()}
  if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push('unexpected local');return route.abort()}
  const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json});state.calls.push(path)
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-choice-session',user:{_id:'u',tenantId:'t'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticSchedule'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙',c:'合成丙'}}])
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved))
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}

for(const mode of ['hide-reopen','reject-trim','reject-empty'])test(`ordinary scalar create draft ${mode}`,async({page,baseURL},info)=>{
 const {state}=await fixture(page,baseURL!,mode)
 const field=(key:string)=>page.getByTestId('r1-normal-input-'+key)
 const pick=async(root:ReturnType<typeof page.locator>)=>{await root.click();const done=page.getByText('Done',{exact:true}).filter({visible:true}).last();await expect(done).toBeVisible();await done.click();await expect(done).toBeHidden()}
 try{
  await open(page)
  await pick(field('visitDate').getByTestId('app-date-time-field'));await pick(field('visitTime').getByTestId('app-date-time-field'))
  for(const p of [field('visitAt').locator('.app-date-time-field__picker').nth(0),field('visitAt').locator('.app-date-time-field__picker').nth(1)])await pick(p)
  const date=(await field('visitDate').innerText()).match(/\d{4}-\d{2}-\d{2}/)![0],time=(await field('visitTime').innerText()).match(/\d{2}:\d{2}/)![0]
  const visitDateTime=(await field('visitAt').innerText()).match(/\d{4}-\d{2}-\d{2}/)![0]+' '+(await field('visitAt').innerText()).match(/\d{2}:\d{2}/)![0]+':00'
  await field('memo').getByRole('textbox').fill('synthetic untouched')
  const trigger=field('mode').getByRole('textbox');await trigger.fill('on')
  for(const p of [field('followupAt').locator('.app-date-time-field__picker').nth(0),field('followupAt').locator('.app-date-time-field__picker').nth(1)])await pick(p)
  const savedFollowup=(await field('followupAt').innerText()).match(/\d{4}-\d{2}-\d{2}/)![0]
  if(mode!=='hide-reopen'){
   await trigger.fill(mode==='reject-trim'?' on ':'')
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('不能更新草稿')
   await expect(field('followupAt')).toContainText(savedFollowup);expect(state.writes).toEqual([])
  }
  if(mode==='reject-empty'){await trigger.fill('on');await page.getByTestId('r1-normal-save').click()}else{
  await trigger.fill('off');await expect(field('followupAt')).toHaveCount(0)
  await trigger.fill('on');await expect(field('followupAt')).toContainText('请选择日期');await expect(field('followupAt')).toContainText('请选择时间')
  await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true');await page.getByTestId('r1-normal-save').click({force:true});expect(state.writes).toEqual([])
  await trigger.fill('off');await page.getByTestId('r1-normal-save').click()
  }
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
  expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
  expect(state.saved).toMatchObject({visitDate:date,visitTime:time,visitAt:visitDateTime,mode:mode==='reject-empty'?'on':'off',memo:'synthetic untouched'})
  if(mode==='reject-empty'){expect(state.saved.followupAt).toContain(savedFollowup);expect(state.saved.exts.followupAt).toBe(state.saved.followupAt)}else{expect(state.saved).not.toHaveProperty('followupAt');expect(state.saved.exts).not.toHaveProperty('followupAt')}
  expect(state.saved.exts).toMatchObject({visitTime:time,mode:mode==='reject-empty'?'on':'off',memo:'synthetic untouched'})
  await expect(page.getByTestId('r1-normal-edit-saved')).toHaveCount(0);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
  expect(state.calls.some(p=>/process|upload|upToken|delete/i.test(p))).toBe(false)
  await page.screenshot({path:info.outputPath('ordinary-create-'+mode+'.png'),fullPage:true})
 }finally{await info.attach('synthetic-ordinary-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,payloads:state.payloads,unexpected:state.unexpected,errors:state.errors}),contentType:'application/json'})}
})
