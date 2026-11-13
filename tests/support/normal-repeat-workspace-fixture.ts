import { isWorkOrderInformationRead } from './work-order-information-fixture'
import { expect, type Page } from '@playwright/test'
// Source-shaped synthetic transport only; no provider/proof/model is injected.
export async function normalRepeatWorkspaceFixture(page:Page,baseURL:string, mode: 'normal' | 'wrong-ack' | 'revoked' = 'normal'){
 const state={failRead:false,saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],role:'r',unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[{_id:'memo',name:'fieldMemo',type:'text',preset:0},{_id:'zero',name:'fieldZero',type:'number',preset:1}].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticRepeatRecords',nameDisp:f.name,state:1,required:'0',readOnly:0,multiple:false,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',customizeFlag:1}))
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通多选',orderNum:'SYNTHETIC-CHOICE-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'repeat',name:'合成配置多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 page.on('pageerror',()=>state.errors.push('pageerror'))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{state.unexpected.push('external-websocket');socket.close()}})
 await page.route('**/*',async route=>{
    if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ status: 503, json: { success: false, message: 'Synthetic information configuration unavailable' } })
  const req=route.request(),u=new URL(req.url());if(u.origin!==baseURL){state.unexpected.push('external');return route.abort()}
  if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push('unexpected local');return route.abort()}
  const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json});state.calls.push(path)
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-choice-session',user:{_id:'u',tenantId:'t'},currentRole:{_id:state.role},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s'&&state.failRead)return route.fulfill({status:503,json:{success:false}})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticRepeatRecords'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙',c:'合成丙'}}])
  if(path==='biz/extForm/query/e'&&state.failRead)return route.fulfill({status:503,json:{success:false}})
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved))
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflow/process'){
   state.writes.push(path);state.payloads.push(structuredClone(body))
   expect(body).toEqual({workflowNodeId:'n',nodeFormDefId:'e',nodeFormDataId:'',smodule:'serviceAppointment',sid:'s'})
   expect(state.saved).not.toBeNull()
   if(mode==='wrong-ack')return ok({status:1,entity:{_id:'wrong-run'}})
   node.state=1
   return ok({status:1,success:true,errors:[],params:{}})
  }
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields,node,revoke:()=>{node.handlerIds=['not-current-role']}}
}
