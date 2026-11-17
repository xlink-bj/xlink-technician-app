import {appointmentFormDefinitionWireId as definition} from '../appointment-contract'
import {nativeAppointmentMockEnabled} from '@shared/config/native-appointment-mock'
import {mockJourneyRoleId as roleId,mockJourneyUserId as userId} from '@shared/mock-journey-identity'
import type {ApiCommandTransport} from '../technician-api-commands'
export const nativeAppointmentIds=Object.freeze({tenantId:'synthetic-qa-tenant',userId,roleId,
  workOrderId:'mock-work-order-022-appointment',workflowRunId:'mock-workflow-run-022-appointment',
  runtimeNodeId:'mock-workflow-node-022-appointment',formDefinitionId:definition,recordId:'mock-appointment-record-022-a'})
const ids=nativeAppointmentIds
export const nativeAppointmentSceneKey='xlink:mock:native-appointment:scene'
const recordKey='xlink:mock:native-appointment:record-v1'
export const nativeAppointmentWriteCountKey='xlink:mock:native-appointment:write-count'
const fail=():never=>{throw Error('本地预约配置或记录无法核实。')}
export function nativeAppointmentFixtureEnabled(){return nativeAppointmentMockEnabled(import.meta.env,typeof window==='undefined'?'':window.location.origin)}
function scene():string {const value=uni.getStorageSync(nativeAppointmentSceneKey);return value||'single'}
const keys=['need','reasons1','otherReason','datetime','note','modifyReason'] as const
// Same six-field synthetic configuration as the accepted intercepted H5 slice.
// These test option codes do not claim the customer's still-unverified dictionary.
export const nativeAppointmentFields=[
 {name:'need',nameDisp:'是否上门',type:'radio',required:1,options:[{value:'1',label:'上门'},{value:'2',label:'不上门'}]},
 {name:'reasons1',nameDisp:'不上门原因',type:'select',required:1,options:[{value:'normal',label:'普通原因'},{value:'other',label:'其他'}],frontEndConfig:{showField:'need',showValue:'2'}},
 {name:'otherReason',nameDisp:'其他原因',type:'text',required:1,frontEndConfig:{showField:'reasons1',showValue:'other'}},
 {name:'datetime',nameDisp:'上门时间',type:'datetime',required:1,frontEndConfig:{showField:'need',showValue:'1'}},
 {name:'note',nameDisp:'预约备注',type:'text',required:0},
 {name:'modifyReason',nameDisp:'修改原因',type:'text',required:1,frontEndConfig:{showField:'_id',showValue:'$exist'}},
].map(field=>({...field,_id:`native-appointment-${field.name}`,tenantId:ids.tenantId,extId:definition,state:1,preset:1,colName:'appointment',readOnly:0,showList:['2','4'],showType:'1'}))
const seed={_id:ids.recordId,tenantId:ids.tenantId,formDefId:definition,sid:ids.workOrderId,smodule:'serviceAppointment',nodeId:ids.runtimeNodeId,
 workflowId:ids.workflowRunId,state:1,need:'1',datetime:'2026-11-20 10:37:42',note:'请提前联系',modifyReason:'',exts:{},orgId:'synthetic-org',createDateTime:'2026-11-17 09:00:00'}
function currentRecord():Record<string,unknown>{
 const raw=uni.getStorageSync(recordKey)
 if(raw===''||raw===undefined)return JSON.parse(JSON.stringify(seed))
 if(typeof raw!=='string')return fail()
 const record=JSON.parse(raw)
 if(!record||Object.entries(seed).some(([key,value])=>!keys.includes(key as never)&&JSON.stringify(record[key])!==JSON.stringify(value))
   ||Object.keys(record).some(key=>!Object.hasOwn(seed,key)&&!keys.includes(key as never))||keys.some(key=>record[key]!==undefined&&typeof record[key]!=='string'))return fail()
 return record
}
export function nativeAppointmentMockListRow(){return{_id:ids.runtimeNodeId,tenantId:ids.tenantId,workflowId:ids.workflowRunId,
 workflowFormDataId:ids.workOrderId,workflowFormColName:'serviceAppointment',state:0,handlerIds:[roleId],
 nodeDef:{nodeType:'repeat',name:'预约',formDefId:definition,userChoose:[roleId],viewableRoleIds:[roleId],formFieldIdsFill:nativeAppointmentFields.map(f=>f._id),formFieldIdsReadOnly:[]},
 data:{_id:ids.workOrderId,tenantId:ids.tenantId,workflowId:ids.workflowRunId,state:1,status:'mock-status-appointment-pending',orderNum:'26022',name:'陈先生',address:'和平里小区',district:110101,serviceType:'mock-service-waterproof',exts:{sourceType:'mock-source-standard'}}}}
export function nativeAppointmentMockRead(path:string,body:Readonly<Record<string,unknown>>):unknown|null{
 if(!nativeAppointmentFixtureEnabled())return null
 const route=path.replace(/\.do$/,'')
 // Explicit empty follow-up fixture for this offline work order; foreign scopes stay unmatched.
 if(route==='biz/action/query'&&body.bizType==='serviceAppointment'&&body.sid===ids.workOrderId&&body.actionType==='1,2,3,4,5,6')return{status:1,data:[]}
 if(route===`basic/serviceAppointment/queryById/${ids.workOrderId}`){const row=nativeAppointmentMockListRow();const{data,...node}=row;return{success:true,status:1,data:{serviceAppointment:data,workflow:{_id:ids.workflowRunId,tenantId:ids.tenantId,formDataId:ids.workOrderId,state:0},workflowNode:[node]}}}
 if(route==='biz/ext/queryById'&&body.id===definition)return{_id:definition,tenantId:ids.tenantId,state:1,type:'0',colName:'appointment'}
 if(route==='biz/extField/query'&&body.extId===definition)return{data:nativeAppointmentFields,total:6,page:1,size:50}
 if(route===`biz/extForm/query/${definition}`&&body['is:sid|string#and']===ids.workOrderId){
  if(body['is:nodeId|string#and']!==ids.runtimeNodeId||body['is:workflowId|string#and']!==ids.workflowRunId||body['ne:state|integer#and']!==-1)return fail()
  const mode=scene();if(mode==='failed')return fail()
  if(!['single','multiple','empty','uncertain'].includes(mode))return fail()
  const record=currentRecord(),other={...JSON.parse(JSON.stringify(seed)),_id:'mock-appointment-record-022-b',datetime:'2026-11-21 15:25',note:'另一次预约'}
  const exact=body['is:_id|string#and'],records=(mode==='empty'?[]:mode==='multiple'?[record,other]:[record]).filter(row=>!exact||row._id===exact)
  const page=Number(body.page),size=Number(body.rows)
  if(page!==1||size!==(exact?2:20)||body.sortField!=='createTime'||body.sortOrder!=='desc')return fail()
  return{data:records,total:records.length,page,size,dataCount:records.length}
 }
 return null
}
/** No API transport/network executor exists on this command path. */
export function createNativeAppointmentMockCommandTransport():ApiCommandTransport{return{async execute(request){
 if(!nativeAppointmentFixtureEnabled()||request.method!=='POST'||request.path!==`biz/extForm/upsert/${definition}`||Object.keys(request.body??{}).join()!=='dataStr')return fail()
 const record=JSON.parse(String(request.body?.dataStr)),original=currentRecord()
 if(!record||record._id!==ids.recordId||Object.keys(record).some(key=>!Object.hasOwn(original,key)&&!keys.includes(key as never))
   ||Object.entries(original).some(([key,value])=>!keys.includes(key as never)&&JSON.stringify(record[key])!==JSON.stringify(value))
   ||keys.some(key=>record[key]!==undefined&&typeof record[key]!=='string'))return fail()
 const raw=JSON.stringify(record);uni.setStorageSync(recordKey,raw);if(uni.getStorageSync(recordKey)!==raw)return fail()
 uni.setStorageSync(nativeAppointmentWriteCountKey,Number(uni.getStorageSync(nativeAppointmentWriteCountKey)||0)+1)
 if(scene()==='uncertain')throw Error('Synthetic acknowledgement lost')
 return{success:true,status:1,data:{_id:ids.recordId}}
}}}
