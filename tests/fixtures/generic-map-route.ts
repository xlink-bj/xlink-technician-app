import { vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
const origin='http://127.0.0.1:5189'
export function genericMapFixture(writeMode=false){
 let session:any={sessionRef:'synthetic-route-session',user:{id:'u'},currentRole:{id:'r'},capabilityNames:[]},listed=false
 const ext:any={_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticScalar'}
 const fields:any[]=Array.from({length:51},(_,i)=>({_id:i?'ro-'+i:'memo',tenantId:'t',extId:'e',state:1,name:i?'protected'+i:'memo',type:'text',required:0,readOnly:i?1:0,preset:i?1:0,colName:'syntheticScalar'}))
 const node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[{_id:'v',formDefId:'e',state:1}]},nodeDef:{nodeType:'forms',formDefId:'e',viewableRoleIds:['r'],formFieldIdsFill:['memo'],formFieldIdsReadOnly:fields.slice(1).map(f=>f._id)}}
 const record:any={_id:'v',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',formDefId:'e',state:1,memo:'old',exts:{memo:'old',audit:{keep:true}},unknownTop:{keep:[0,false]}}
 const calls:string[]=[];let hook:((path:string)=>void|Promise<void>)|undefined
 const transport={execute:vi.fn(async(req:any)=>{calls.push(req.path);await hook?.(req.path)
  if(req.path==='basic/serviceAppointment/queryById/s')return structuredClone({success:true,status:1,data:{serviceAppointment:{_id:'s',tenantId:'t',state:1,workflowId:'w'},workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(req.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(req.path==='biz/extField/query'){const p=Number(req.body.page),rows=fields.slice((p-1)*50,p*50);return{data:structuredClone(rows),total:fields.length,page:p,size:50}}
  if(req.path==='biz/extForm/query/e')return{data:[structuredClone(record)],total:1,page:1,size:Number(req.body.rows),dataCount:1}
  throw Error('Unknown synthetic read '+req.path)
 })}
 const auth={getCurrentSession:()=>session}
 const env:any={DEV:true,VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:origin+'/xlink/wm',VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false'}
 if(writeMode)Object.assign(env,{VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify({version:2,scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'},expiresAt:'2099-01-01T00:00:00Z',fieldIds:['memo'],operations:['edit'],recordIds:['v']})})
 const reader=createNormalNodeFormsReader({auth,tenantId:'t',origin,env,transport,read:{listWorkOrders:async()=>{listed=true;return{state:'succeeded',data:{items:[{id:'s'}],totalCount:1,page:1,pageSize:20}} as never},isWorkOrderListedForCurrentSession:()=>listed,getDynamicCodeOptions:async()=>{throw Error('No provider')}}})
 const route=(s:R1NodeFormsSnapshot,id='v')=>(reader as any).currentGenericMapRoute(s,id)
 const valid=(s:R1NodeFormsSnapshot,e:unknown,id='v')=>(reader as any).isCurrentGenericMapRoute(s,id,e)
 return{reader,route,valid,ext,fields,node,record,calls,auth,env,origin,hook:(h:typeof hook)=>{hook=h},role:()=>{session={...session,currentRole:{id:'other'}}},logout:()=>{session=null},unlist:()=>{listed=false}}
}
