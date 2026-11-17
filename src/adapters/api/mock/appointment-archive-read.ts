import {appointmentFormDefinitionWireId as definition} from '../appointment-contract'
import {normalSurveyMockAppointment as appointment, normalSurveyMockIds as ids} from './normal-survey-read'
import {mockJourneyRoleId} from '@shared/mock-journey-identity'
// Opt-in synthetic, source-equivalent appointment records. The ordinary survey
// scenario stays unchanged unless this separate offline review profile is on.
export type AppointmentArchiveMockScene='single'|'multiple'|'direct'|'references'|'empty'|'failed'|'denied'|'unknown'
let scene:AppointmentArchiveMockScene='multiple'
export function appointmentArchiveMockEnabled(){return import.meta.env.DEV===true
  &&import.meta.env.VITE_XLINK_ENVIRONMENT==='dev'&&import.meta.env.VITE_XLINK_H5_MOCK_E2E==='true'
  &&import.meta.env.VITE_XLINK_MOCK==='true'&&import.meta.env.VITE_XLINK_R1_APPOINTMENT_ARCHIVE_FIXTURE==='true'
  &&import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES==='false'&&import.meta.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES!=='true'
  &&import.meta.env.VITE_XLINK_API_BASE_URL==='https://example.invalid'}
export function setAppointmentArchiveMockScene(value:AppointmentArchiveMockScene){
  if(!appointmentArchiveMockEnabled()||!['single','multiple','direct','references','empty','failed','denied','unknown'].includes(value))throw Error('Offline appointment fixture is closed')
  scene=value
}
const fields=[
  {name:'need',nameDisp:'是否上门',type:'radio',options:[{value:'1',label:'上门'},{value:'2',label:'不上门'}]},
  {name:'datetime',nameDisp:'上门时间',type:'datetime'},
  {name:'note',nameDisp:'预约备注',type:'text'},
].map(field=>({...field,_id:`appointment-archive-${field.name}`,tenantId:ids.tenant,extId:definition,state:1,preset:1,showList:['2','4'],showType:'1',readOnly:1}))
export function appointmentArchiveMockNode(){return{_id:ids.node,nodeId:'synthetic-appointment-definition-node',tenantId:ids.tenant,workflowId:ids.run,
  workflowFormDataId:ids.work,workflowFormColName:'serviceAppointment',state:10,handlerIds:[],
  ...(scene==='direct'?{formDataId:'appointment-history-a'}:{}),
  ...(scene==='references'?{exts:{formList:[{_id:'appointment-history-a',formDefId:definition,state:1},{_id:'appointment-history-b',formDefId:definition,state:1}]}}:{}),
  nodeDef:{nodeType:['direct','references','unknown'].includes(scene)?'forms':'repeat',name:'预约',formDefId:definition,
    userChoose:[],viewableRoleIds:scene==='denied'?[]:[mockJourneyRoleId],formFieldIdsFill:[],formFieldIdsReadOnly:fields.map(field=>field._id)}}}
function records(){return(scene==='empty'?[]:scene==='single'||scene==='direct'?['a']:['a','b']).map((key,index)=>({_id:`appointment-history-${key}`,
  tenantId:ids.tenant,formDefId:definition,sid:ids.work,smodule:'serviceAppointment',nodeId:ids.node,workflowId:ids.run,state:1,
  need:'1',datetime:index?'2026-11-21 15:25':'2026-11-20 10:37:42',note:index?'另一次预约':'请提前联系',exts:{}}))}
export function appointmentArchiveMockRead(route:string,body:Readonly<Record<string,unknown>>):unknown|null{
  if(!appointmentArchiveMockEnabled())return null
  route=route.replace(/\.do$/, '')
  if(route===`basic/serviceAppointment/queryById/${ids.work}`)return{success:true,status:1,data:{serviceAppointment:appointment,
    workflow:{_id:ids.run,tenantId:ids.tenant,formDataId:ids.work,state:10},workflowNode:[appointmentArchiveMockNode()]}}
  if(route==='biz/ext/queryById'&&body.id===definition)return{_id:definition,tenantId:ids.tenant,state:1,type:'0',colName:'appointment'}
  if(route==='biz/extField/query'&&body.extId===definition)return{data:fields,total:fields.length,page:1,size:50}
  if(route===`biz/extForm/query/${definition}`){
    if(scene==='failed')throw Error('Synthetic appointment history read failure')
    if(body['is:sid|string#and']!==ids.work||body['is:nodeId|string#and']!==ids.node||body['is:workflowId|string#and']!==ids.run
      ||body['ne:state|integer#and']!==-1||body.sortField!=='createTime'||body.sortOrder!=='desc')throw Error('Synthetic appointment read scope mismatch')
    const exact=body['is:_id|string#and'],data=records().filter(record=>!exact||record._id===exact),page=Number(body.page),size=Number(body.rows)
    if(page!==1||size!==(exact?2:20))throw Error('Synthetic appointment pagination mismatch')
    return{data,total:data.length,page,size,dataCount:data.length}
  }
  return null
}
