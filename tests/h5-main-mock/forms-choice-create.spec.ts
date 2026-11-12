import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_FORMS_CHOICE_CREATE!=='true','Opt-in synthetic ordinary Map choice first-create')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[{_id:'checks',name:'renamedChecks',type:'checkbox',multiple:false,preset:1},{_id:'multi',name:'renamedMulti',type:'select',multiple:true,preset:0},{_id:'memo',name:'memo',type:'text',multiple:false,preset:0}].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticChoices',nameDisp:f.name,state:1,required:'0',readOnly:0,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',customizeFlag:1,...(f.type==='text'?{}:{valueOption:'SYN_CODES'})}))
 if(mode==='hidden'||mode==='hidden-trim')Object.assign(fields[0],{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0,required:'1'})
 if(mode==='hidden-empty')Object.assign(fields[0],{showType:'2',showField:'memo',showFieldPreset:0,required:'1'})
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通多选',orderNum:'SYNTHETIC-CHOICE-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成配置多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
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
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticChoices'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙',c:'合成丙'}}])
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved))
   if(mode==='wrong-ack')state.saved.exts.renamedMulti=['c']
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}
for(const mode of ['save','hidden','drift','wrong-ack','hidden-trim','hidden-empty'])test(`ordinary configured choice create ${mode}`,async({page,baseURL},info)=>{
 const {state,fields}=await fixture(page,baseURL!,mode)
 try{
  await open(page)
  const memo=page.getByTestId('r1-normal-input-memo').getByRole('textbox')
  await memo.fill(mode.startsWith('hidden')?'on':'synthetic memo')
  await page.getByTestId('r1-normal-input-renamedChecks').locator('.app-choice--multi').filter({hasText:'合成乙'}).click()
  await page.getByTestId('r1-normal-input-renamedChecks').locator('.app-choice--multi').filter({hasText:'合成甲'}).click()
  await page.getByTestId('r1-normal-input-renamedMulti').locator('.app-choice--multi').filter({hasText:'合成甲'}).click()
  if(mode==='hidden'){await memo.fill('off');await expect(page.getByTestId('r1-normal-input-renamedChecks')).toHaveCount(0)}
  if(mode==='hidden-trim'||mode==='hidden-empty'){
   await memo.fill(mode==='hidden-trim'?' on ':'')
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('不能更新草稿')
   await expect(page.getByTestId('r1-normal-input-renamedChecks').locator('.app-choice--multi').filter({hasText:'合成甲'})).toHaveAttribute('aria-pressed','true')
  }
  if(mode==='drift')fields[0].readOnly=1
  await page.getByTestId('r1-normal-save').click()
  if(mode==='drift'||mode==='wrong-ack'){
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成')
   expect(state.writes).toEqual(mode==='drift'?[]:['biz/extForm/upsert/e'])
  }else{
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
   expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
   if(mode==='hidden-trim'||mode==='hidden-empty')expect(state.saved.memo).toBe('on')
   expect(state.saved.exts.renamedMulti).toEqual(['a']);expect(state.saved.renamedMulti).toEqual(['a'])
   if(mode==='hidden')expect(state.saved).not.toHaveProperty('renamedChecks')
   else{expect(state.saved.renamedChecks).toEqual(['a','b']);await expect(page.getByTestId('r1-normal-value-renamedChecks')).toHaveText('合成甲 / 合成乙')}
   await expect(page.getByTestId('r1-normal-edit-saved')).toHaveCount(0);await expect(page.getByTestId('r1-normal-append')).toHaveCount(0)
  }
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
  expect(state.calls.some(p=>/process|upload|upToken|delete/i.test(p))).toBe(false)
  await page.screenshot({path:info.outputPath('forms-choice-'+mode+'.png'),fullPage:true})
 }finally{await info.attach('synthetic-choice-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,payloads:state.payloads,unexpected:state.unexpected,errors:state.errors}),contentType:'application/json'})}
})
