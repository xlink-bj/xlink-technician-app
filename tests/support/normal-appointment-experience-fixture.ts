import { vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'
const command = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({createUniApiCommandTransport:()=>command}))
const origin='http://127.0.0.1:5189', def='2522989775781119510'
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:def}
export function appointmentFixture(){
 let session:any={sessionRef:'synthetic-appointment-session',user:{id:'u'},currentRole:{id:'r'}},listed=false,current:any
 const ext:any={_id:def,tenantId:'t',state:1,type:'0',colName:'appointment'}
 const node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],
  nodeDef:{nodeType:'repeat',name:'合成预约',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:['need','reasons1','otherReason','datetime','note','modifyReason'],formFieldIdsReadOnly:[]}}
 const fields:any[]=[
  {name:'need',type:'radio',required:1,options:[{value:'1',label:'上门'},{value:'2',label:'不上门'}]},
  {name:'reasons1',type:'select',required:1,options:[{value:'normal',label:'普通原因'},{value:'other',label:'其他'}],frontEndConfig:{showField:'need',showValue:'2'}},
  {name:'otherReason',type:'text',required:1,frontEndConfig:{showField:'reasons1',showValue:'other'}},
  {name:'datetime',type:'datetime',required:1,frontEndConfig:{showField:'need',showValue:'1'}},
  {name:'note',type:'text',required:0},
  {name:'modifyReason',type:'text',required:1,frontEndConfig:{showField:'_id',showValue:'$exist'}},
 ].map(f=>({...f,_id:f.name,tenantId:'t',extId:def,state:1,readOnly:0,preset:1,colName:'appointment',showList:['2','4'],showType:'1'}))
 const record:any={_id:'a',tenantId:'t',formDefId:def,sid:'s',smodule:'serviceAppointment',nodeId:'n',workflowId:'w',state:1,need:'1',datetime:'2026-11-12 10:30',note:'old',modifyReason:'',exts:{},orgId:'o',createDateTime:'2026-11-10 10:00:00'}
 const other:any={...record,_id:'b',note:'other'}
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_REPEAT_ACTIONS:'true',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_API_BASE_URL:origin+'/xlink/wm',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_MOCK:'false',VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify({version:2,scope,expiresAt:'2099-01-01T00:00:00Z',fieldIds:fields.map(f=>f._id),operations:['edit'],recordIds:['a']})}
 let beforeWrite:(()=>void)|undefined,afterWrite:(()=>void)|undefined,afterRead:(()=>void)|undefined
 const writes:any[]=[]
 const transport={execute:vi.fn(async(req:any)=>{
  if(req.path==='basic/serviceAppointment/queryById/s')return structuredClone({success:true,status:1,data:{serviceAppointment:{_id:'s',tenantId:'t',state:1,workflowId:'w'},workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(req.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(req.path==='biz/extField/query')return{data:structuredClone(fields),total:6,page:1,size:50}
  if(req.path==='biz/extForm/query/'+def){const id=req.body['is:_id|string#and'];const data=[record,other].filter(r=>!id||r._id===id);afterRead?.();return{data:structuredClone(data),total:data.length,page:1,size:Number(req.body.rows)}}
  throw Error('Unexpected synthetic read '+req.path)
 })}
 const auth={getCurrentSession:()=>session}
 const reader=createNormalNodeFormsReader({auth,tenantId:'t',origin,env,transport,read:{listWorkOrders:async()=>{listed=true;return{state:'succeeded',data:{items:[{id:'s'}],totalCount:1,page:1,pageSize:20}} as never},isWorkOrderListedForCurrentSession:()=>listed,getDynamicCodeOptions:async()=>{throw Error('No unknown provider')}}})
 command.execute.mockImplementation(async(req:any)=>{beforeWrite?.();writes.push(structuredClone(req));const value=JSON.parse(req.body.dataStr);Object.keys(record).forEach(k=>delete record[k]);Object.assign(record,value);afterWrite?.();return{success:true,status:1,data:{_id:'a'}}})
 const provider=()=>createNormalRepeatActionProvider({auth,reader,env,origin})
 return{env,ext,node,fields,record,other,writes,reader,provider,transport,async load(){current=await reader.load('s','n');return current},get current(){return current},changeRole(){session={...session,currentRole:{id:'other'}}},changeSession(){session={...session,sessionRef:'new'}},onWrite(fn:()=>void){beforeWrite=fn},afterWrite(fn:()=>void){afterWrite=fn},afterRead(fn:()=>void){afterRead=fn},unlist(){listed=false}}
}
