import { enterNormalFormWorkspace, leaveNormalFormForList } from './normal-form-workspace-entry'
import {test,expect,type Page} from '@playwright/test'
// Dedicated synthetic grants/server only; never run under the ordinary broad Mock config.
test.beforeEach(({},info)=>{test.skip(info.config.metadata.normalFormDraftRecovery!==true,'Use the dedicated normal-form-draft-recovery config')})
const ledgers=new WeakMap<Page,unknown>()
test.afterEach(async({page},info)=>{const ledger=ledgers.get(page);if(ledger)await info.attach('synthetic-route-ledger',{body:JSON.stringify(ledger),contentType:'application/json'})})
export async function fixture(page:Page,baseURL:string,mode:string){
 const state={loginUser:'u',loginRole:'r',failRead:false,saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[{_id:'checks',name:'renamedChecks',type:'checkbox',multiple:false,preset:1},{_id:'multi',name:'renamedMulti',type:'select',multiple:true,preset:0},{_id:'memo',name:'memo',type:'text',multiple:false,preset:0}].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticChoices',nameDisp:f.name,state:1,required:'0',readOnly:0,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',customizeFlag:1,...(f.type==='text'?{}:{valueOption:'SYN_CODES'})}))
 if(mode==='edit-shadow')fields.splice(0,fields.length,{...fields[2],_id:'memo'})
 if(mode==='repeat'){fields[0].type='radio';fields[1].type='text';fields[1].multiple=false;delete fields[1].valueOption}
 if(mode==='hidden'||mode==='hidden-trim')Object.assign(fields[0],{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0,required:'1'})
 if(mode==='hidden-empty')Object.assign(fields[0],{showType:'2',showField:'memo',showFieldPreset:0,required:'1'})
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通多选',orderNum:'SYNTHETIC-CHOICE-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:mode==='repeat'?'repeat':'forms',name:'合成配置多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const sa2={...sa,_id:'s2',workflowId:'w2',name:'另一工单',orderNum:'SYNTHETIC-OTHER-ORDER'},node2={...node,_id:'n2',workflowId:'w2',workflowFormDataId:'s2'}
 page.on('pageerror',()=>state.errors.push('pageerror'))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{state.unexpected.push('external-websocket');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==baseURL){state.unexpected.push('external');return route.abort()}
  if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push('unexpected local');return route.abort()}
  const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json});state.calls.push(path)
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-choice-session-'+state.loginUser+'-'+state.loginRole,user:{_id:state.loginUser,tenantId:'t'},currentRole:{_id:state.loginRole},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:mode==='switch-order'?[{...node,data:sa},{...node2,data:sa2}]:[{...node,data:sa}],total:mode==='switch-order'?2:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s2')return ok({success:true,status:1,data:{serviceAppointment:sa2,workflow:{_id:'w2',tenantId:'t',formDataId:'s2',state:0},workflowNode:[node2]}})
  if(path==='basic/serviceAppointment/queryById/s'&&state.failRead)return route.fulfill({status:503,json:{success:false}})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticChoices'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙',c:'合成丙'}}])
  if(path==='biz/extForm/query/e'&&state.failRead)return route.fulfill({status:503,json:{success:false}})
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved))
   if(mode==='wrong-ack')state.saved.exts.renamedMulti=['c']
   // The synthetic server accepted the write but its response never arrived.
   if(mode==='lost-ack')return route.abort('connectionreset')
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);if(mode==='failed-readback')state.failRead=true;return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 ledgers.set(page,state)
 return{state,fields,node}
}
export async function read(page:Page){await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()}
export async function returnToForm(page:Page){await leaveNormalFormForList(page);await expect(page).toHaveURL(/pages\/work-orders\/work-orders/);await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(0);await page.locator('.work-order-card').first().click();await enterNormalFormWorkspace(page);await read(page)}
export async function enter(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').first().click();await enterNormalFormWorkspace(page)}
export async function open(page:Page){await enter(page);await read(page);await expect(page.getByTestId('r1-normal-create')).toBeVisible()}
