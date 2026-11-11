import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalRepeatActionProvider, parseR1RepeatGrant } from '@app/r1-repeat-authorization'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
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
beforeEach(()=>{command.execute.mockReset();installLocalFixtureBrowser()})
afterEach(()=>vi.unstubAllGlobals())
it('accepts explicit edit-only v2 recordIds while keeping create/complete v1 exact',()=>{const x=appointmentFixture();expect(parseR1RepeatGrant(x.env.VITE_XLINK_R1_REPEAT_GRANT)).not.toBeNull()})
it('edits the exact normal repeat appointment record and only saves/rereads',async()=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)
 expect(a?.canEdit?.('a')).toBe(true);expect(a?.canEdit?.('b')).toBe(false)
 const initial=a!.initialValues!('a')!;expect(initial).toMatchObject({need:'1',datetime:x.record.datetime,note:'old'})
 const other=structuredClone(x.other);const saved=await a!.saveOnly({...initial,note:'new',modifyReason:'changed'},'a')
 expect(saved.records.find(r=>r.id==='a')?.values?.note).toBe('new');expect(x.writes).toHaveLength(1)
 expect(x.writes[0].path).toBe('biz/extForm/upsert/'+def);expect(x.other).toEqual(other)
 expect(x.record).toMatchObject({_id:'a',orgId:'o',exts:{},datetime:'2026-11-12 10:30'})
 expect(a?.canComplete?.()).toBe(false);expect(a?.canCreate?.()).toBe(false)
})
it('uses trusted _id for modifyReason, hides datetime without deleting it, and allows empty text',async()=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,v=a.initialValues!('a')!
 expect(a.projectFields!(v,'a').some(f=>f.valueKey==='modifyReason'&&f.supported)).toBe(true)
 expect(a.validateDraft!({...v,modifyReason:''},'a')).toBe(false)
 const deferred={...v,need:'2',reasons1:'normal',note:'',modifyReason:'defer'}
 expect(a.projectFields!(deferred,'a').some(f=>f.valueKey==='datetime')).toBe(false)
 expect(a.validateDraft!(deferred,'a')).toBe(true)
 expect(a.projectFields!({...deferred,need:'1'},'a').some(f=>f.valueKey==='datetime')).toBe(true)
 await a.saveOnly(deferred,'a');expect(x.record.datetime).toBe('2026-11-12 10:30');expect(x.record.note).toBe('');expect(x.writes).toHaveLength(1)
})
it.each(['typed','missing-type','numeric-type','collection','alias','tenant','field-collection','readonly','provider','duplicate','hidden-submit','source'])( 'does not grant unsafe source %s',async kind=>{
 const x=appointmentFixture()
 if(kind==='typed')x.ext.type='1';if(kind==='missing-type')delete x.ext.type;if(kind==='numeric-type')x.ext.type=0
 if(kind==='collection')x.ext.colName='survey';if(kind==='alias')x.ext.id='other';if(kind==='tenant')x.ext.tenantId='other'
 if(kind==='field-collection')x.fields[0].colName='survey';if(kind==='readonly')x.fields[0].readOnly=1
 if(kind==='provider')x.fields[0].valueOption='unknown-provider';if(kind==='duplicate')x.fields[1]._id=x.fields[0]._id
 if(kind==='hidden-submit')x.node.nodeDef.submitHideNodeId='unknown-later-node';if(kind==='source')x.node.nodeDef.nodeType='form'
 let action:any=null;try{action=x.provider().forSnapshot(await x.load())}catch{}
 expect(action?.canEdit?.('a')??false).toBe(false);expect(command.execute).not.toHaveBeenCalled()
})
it.each(['unknown-root','unknown-exts','conflict','null','object','need-number','readonly-metadata','sid','tenant','run','definition'])( 'rejects unpreservable/foreign exact original %s',async kind=>{
 const x=appointmentFixture()
 if(kind==='unknown-root')x.record.audit={opaque:true};if(kind==='unknown-exts')x.record.exts.audit='opaque'
 if(kind==='conflict')x.record.exts.note='other';if(kind==='null')x.record.note=null;if(kind==='object')x.record.note={lost:true}
 if(kind==='need-number')x.record.need=1;if(kind==='readonly-metadata')x.record.orgId=7;if(kind==='sid')x.record.sid='other'
 if(kind==='tenant')x.record.tenantId='other';if(kind==='run')x.record.runId='other';if(kind==='definition')x.record.formDefId='other'
 let action:any=null;try{action=x.provider().forSnapshot(await x.load())}catch{}
 expect(action?.canEdit?.('a')??false).toBe(false);expect(command.execute).not.toHaveBeenCalled()
})
it.each([{need:'0'}, {_id:'other'}, {audit:'new'}, {need:1}, {note:['x']}, {note:null}, {need:'2',reasons1:'normal',datetime:'2027-01-01 10:00'}, {modifyReason:'   '}, {need:'2',reasons1:'unknown'}])('rejects invalid draft before transport %#',async patch=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,draft={...a.initialValues!('a'),modifyReason:'change',...patch}
 expect(a.validateDraft!(draft,'a')).toBe(false);await expect(a.saveOnly(draft,'a')).rejects.toThrow();expect(command.execute).not.toHaveBeenCalled()
})
it.each(['role','session','revoke','unlist','new-read','fields','fillable','node-readonly','options','record','type'])( 'revokes before first write on %s',async kind=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,draft={...a.initialValues!('a'),note:'new',modifyReason:'change'}
 if(kind==='role')x.changeRole();if(kind==='session')x.changeSession();if(kind==='revoke')x.env.VITE_XLINK_R1_REPEAT_GRANT=''
 if(kind==='unlist')x.unlist();if(kind==='new-read')await x.load();if(kind==='fields')x.fields[4].frontEndConfig={showField:'need',showValue:'2'}
 if(kind==='fillable')x.node.nodeDef.formFieldIdsFill.pop();if(kind==='node-readonly')x.node.nodeDef.formFieldIdsReadOnly=['note']
 if(kind==='options')x.fields[0].options[0].label='changed';if(kind==='record')x.record.note='server-changed';if(kind==='type')x.ext.type='1'
 await expect(a.saveOnly(draft,'a')).rejects.toThrow();expect(command.execute).not.toHaveBeenCalled()
})
it.each(['fields','readonly','options','type','role','record-value','record-deleted','other-record','raw-slot'])( 'keeps uncertain and never emits another command after %s',async kind=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,draft={...a.initialValues!('a'),note:'new',modifyReason:'change'}
 x.afterWrite(()=>{if(kind==='fields')x.fields[4].required=1;if(kind==='readonly')x.node.nodeDef.formFieldIdsReadOnly=['note'];if(kind==='options')x.fields[0].options[0].label='changed';if(kind==='type')x.ext.type='1';if(kind==='role')x.changeRole();if(kind==='record-value')x.record.note='wrong';if(kind==='record-deleted')x.record.state=-1;if(kind==='other-record')x.other.note='changed';if(kind==='raw-slot')x.record.exts.note='wrong'})
 await expect(a.saveOnly(draft,'a')).rejects.toThrow();expect(command.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
 await expect(a.saveOnly(draft,'a')).rejects.toThrow();expect(command.execute).toHaveBeenCalledTimes(1)
})
it('does not accept copied reader evidence or any ACK-derived original',async()=>{
 const x=appointmentFixture(),s=await x.load(),proof=x.reader.currentRepeatAppointment!(s,'a')!
 expect(proof).not.toBeNull();expect(x.reader.isCurrentRepeatAppointment!(s,'a',{...proof})).toBe(false)
 expect(x.reader.isCurrentRepeatAppointment!(s,'b',proof)).toBe(false)
 const original=x.reader.currentRepeatAppointment!.bind(x.reader)
 x.reader.currentRepeatAppointment=(snap,id)=>{const e=original(snap,id);return e?structuredClone(e):null}
 expect(x.provider().forSnapshot(s)).toBeNull();expect(command.execute).not.toHaveBeenCalled()
})
it('rejects stale issued original mutation without granting a copied or forged replacement context',async()=>{
 const x=appointmentFixture(),s=await x.load(),proof=x.reader.currentRepeatAppointment!(s,'a')!
 ;(proof.original as any).note='tampered';expect(x.reader.isCurrentRepeatAppointment!(s,'a',proof)).toBe(false)
 x.reader.clear();expect(x.reader.isCurrentRepeatAppointment!(s,'a',proof)).toBe(false)
 expect(command.execute).not.toHaveBeenCalled()
})
it.each(['lost','unknown','wrong-id','wrong-tenant','conflicting-id','denied'])( 'locks %s ACK across page recreation',async kind=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,draft={...a.initialValues!('a'),note:'new',modifyReason:'change'}
 command.execute.mockImplementationOnce(async()=>{if(kind==='lost')throw Error('lost');return kind==='unknown'?{}:kind==='wrong-id'?{success:true,data:{_id:'b'}}:kind==='wrong-tenant'?{success:true,data:{_id:'a',tenantId:'other'}}:kind==='conflicting-id'?{success:true,data:{_id:'a',id:'b'}}:{success:true,status:0,data:{_id:'a'}}})
 await expect(a.saveOnly(draft,'a')).rejects.toThrow();expect(a.locked()).toBe(true);expect(command.execute).toHaveBeenCalledTimes(1)
 const fresh=await x.load(),renewed=x.provider().forSnapshot(fresh)!;expect(renewed.locked()).toBe(true);await expect(renewed.saveOnly(draft,'a')).rejects.toThrow();expect(command.execute).toHaveBeenCalledTimes(1)
})
it('does not gain editing from old create/complete grants or completion from edit grants',async()=>{
 const x=appointmentFixture();const g=JSON.parse(x.env.VITE_XLINK_R1_REPEAT_GRANT);g.version=1;g.operations=['create','complete'];delete g.recordIds;x.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify(g)
 const s=await x.load(),old=x.provider().forSnapshot(s)!;expect(old.canEdit).toBeUndefined();await expect(old.saveOnly({need:'1',datetime:'2026-11-12 10:30'},'a')).rejects.toThrow();expect(command.execute).not.toHaveBeenCalled()
 x.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify({...g,version:2,recordIds:['a'],operations:['edit']});const a=x.provider().forSnapshot(await x.load())!
 await expect(a.complete()).rejects.toThrow();expect(command.execute).not.toHaveBeenCalled()
})
it.each([{state:-1},{smodule:'foreign'},{workflow:{runId:'other'}},{workflow:[]},{workflow:{_id:'other'}}])('locks explicit contradictory ACK attribution %#',async wrong=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,v={...a.initialValues!('a'),note:'new',modifyReason:'change'}
 command.execute.mockResolvedValueOnce({success:true,status:1,data:{_id:'a',...wrong}})
 await expect(a.saveOnly(v,'a')).rejects.toThrow();expect(a.locked()).toBe(true);expect(command.execute).toHaveBeenCalledTimes(1)
})
it('renews exact evidence for another authorized unchanged record only after verified save',async()=>{
 const x=appointmentFixture(),g=JSON.parse(x.env.VITE_XLINK_R1_REPEAT_GRANT);g.recordIds=['a','b'];x.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify(g)
 const s=await x.load(),a=x.provider().forSnapshot(s)!;expect(a.canEdit!('b')).toBe(true)
 await a.saveOnly({...a.initialValues!('a'),note:'first',modifyReason:'first change'},'a')
 expect(a.canEdit!('b')).toBe(true)
 command.execute.mockImplementationOnce(async req=>{const value=JSON.parse(req.body.dataStr);Object.keys(x.other).forEach(k=>delete x.other[k]);Object.assign(x.other,value);return{success:true,status:1,data:{_id:'b'}}})
 await a.saveOnly({...a.initialValues!('b'),note:'second',modifyReason:'second change'},'b')
 expect(x.record.note).toBe('first');expect(x.other.note).toBe('second');expect(command.execute).toHaveBeenCalledTimes(2)
})
it('does not queue a repeated click while saving',async()=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,v={...a.initialValues!('a'),note:'new',modifyReason:'change'}
 let release!:()=>void;const waiting=new Promise<void>(r=>{release=r}),base=command.execute.getMockImplementation()!
 command.execute.mockImplementationOnce(async req=>{const result=await base(req);await waiting;return result})
 const first=a.saveOnly(v,'a');await vi.waitFor(()=>expect(command.execute).toHaveBeenCalledTimes(1))
 await expect(a.saveOnly(v,'a')).rejects.toThrow();release();await first;expect(command.execute).toHaveBeenCalledTimes(1)
})
it('allows explicit reread of an uncertain saved result without replay or automatic lock clearing',async()=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,v={...a.initialValues!('a'),note:'saved-but-unknown',modifyReason:'change'}
 x.afterWrite(()=>x.transport.execute.mockRejectedValueOnce(Error('synthetic read failure')))
 await expect(a.saveOnly(v,'a')).rejects.toThrow();const recovered=await x.load();expect(recovered.records.find((r:any)=>r.id==='a').values.note).toBe('saved-but-unknown')
 const action=x.provider().forSnapshot(recovered)!;expect(action.locked()).toBe(true);await expect(action.saveOnly(v,'a')).rejects.toThrow();expect(command.execute).toHaveBeenCalledTimes(1)
})
it.each(['expired','fields','records','operations'])('rejects invalid v2 grant %s without transport',async kind=>{
 const x=appointmentFixture(),g=JSON.parse(x.env.VITE_XLINK_R1_REPEAT_GRANT)
 if(kind==='expired')g.expiresAt='2000-01-01';if(kind==='fields')g.fieldIds=['need'];if(kind==='records')g.recordIds=[];if(kind==='operations')g.operations=['edit','complete']
 x.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify(g);let action:any=null;try{action=x.provider().forSnapshot(await x.load())}catch{}
 expect(action).toBeNull();expect(command.execute).not.toHaveBeenCalled()
})
it('revokes the private capability if the public work-order identity is mutated',async()=>{
 const x=appointmentFixture(),s=await x.load(),proof=x.reader.currentRepeatAppointment!(s,'a')!
 s.workOrderId='another-listed-order';expect(x.reader.isCurrentRepeatAppointment!(s,'a',proof)).toBe(false);expect(command.execute).not.toHaveBeenCalled()
})
it('keeps an uncertain receipt when equivalent grant scope keys are reordered',async()=>{
 const x=appointmentFixture(),s=await x.load(),a=x.provider().forSnapshot(s)!,v={...a.initialValues!('a'),note:'new',modifyReason:'change'}
 command.execute.mockRejectedValueOnce(Error('unknown ACK'));await expect(a.saveOnly(v,'a')).rejects.toThrow()
 const g=JSON.parse(x.env.VITE_XLINK_R1_REPEAT_GRANT);g.scope=Object.fromEntries(Object.entries(g.scope).reverse());x.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify(g)
 const next=x.provider().forSnapshot(await x.load())!;expect(next.locked()).toBe(true);await expect(next.saveOnly(v,'a')).rejects.toThrow();expect(command.execute).toHaveBeenCalledTimes(1)
})
