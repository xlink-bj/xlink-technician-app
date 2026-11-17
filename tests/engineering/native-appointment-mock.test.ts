import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {clonePlainData} from '@adapters/common/clone-plain-data'
import {workOrderActivities} from '@adapters/api/read-models/work-order-activity'
import {nativeAppointmentMockEnabled} from '@shared/config/native-appointment-mock'
import {nativeAppointmentIds as ids,nativeAppointmentMockRead,nativeAppointmentSceneKey,nativeAppointmentWriteCountKey,createNativeAppointmentMockCommandTransport} from '@adapters/api/mock/native-appointment'
import {createNormalNodeFormsReader} from '@app/r1-node-forms-read'
import {createNativeAppointmentMockActionProvider} from '@app/native-appointment-mock-actions'
import {createHistoricalFormsReader} from '@app/r1-historical-forms-read'
import {createNativeAppointmentMockLock} from '@adapters/storage/native-appointment-mock-lock'
const env:Record<string,any>={DEV:true,PROD:false,UNI_PLATFORM:'mp-weixin',VITE_XLINK_PLATFORM:'mp-weixin',VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_NATIVE_APPOINTMENT_MOCK:'true',VITE_XLINK_H5_MOCK_E2E:'true',VITE_XLINK_R1_MP_UX_FIXTURES:'true',VITE_XLINK_R1_APPOINTMENT_ARCHIVE_FIXTURE:'true',VITE_XLINK_MOCK:'true',VITE_XLINK_AUTH_TENANT:'synthetic-qa-tenant',VITE_XLINK_API_BASE_URL:'https://example.invalid',VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_AUTH_API_BASE_URL:'',VITE_XLINK_QUICK_LOGIN_PHONE:'',VITE_XLINK_QUICK_LOGIN_CODE:'',VITE_XLINK_R1_REPEAT_ACTIONS:'false',VITE_XLINK_R1_FORMS_ACTIONS:'false',VITE_XLINK_R1_REPEAT_GRANT:'',VITE_XLINK_R1_FORMS_GRANT:''}
let store:Map<string,unknown>,network:ReturnType<typeof vi.fn>
beforeEach(()=>{for(const[key,value]of Object.entries(env))vi.stubEnv(key,value);vi.stubGlobal('structuredClone',undefined);store=new Map();network=vi.fn();vi.stubGlobal('uni',{getStorageSync:(key:string)=>store.get(key)??'',setStorageSync:(key:string,value:unknown)=>store.set(key,value),request:network})})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
function fixture(){
 let session:any={sessionRef:'local-mock-only-session',user:{id:ids.userId},currentRole:{id:ids.roleId}},listed=true
 const auth={getCurrentSession:()=>session},read={isWorkOrderListedForCurrentSession:()=>listed,listWorkOrders:async()=>({state:'succeeded',data:{items:[],totalCount:0}} as never),getDynamicCodeOptions:async()=>({state:'failed_terminal'} as never)}
 const calls:any[]=[],transport={execute:vi.fn(async(request:any)=>{calls.push(request);const result=nativeAppointmentMockRead(request.path,request.body??{});if(result===null)throw Error('Unmatched offline request');return JSON.parse(JSON.stringify(result))})}
 const reader=createNormalNodeFormsReader({auth,read,env:{...env},origin:'',tenantId:ids.tenantId,transport})
 const provider=createNativeAppointmentMockActionProvider({auth,reader,env:{...env},origin:''})
 return{reader,provider,calls,auth,read,transport,changeRole(){session={...session,currentRole:{id:'other'}}},unlist(){listed=false}}
}
describe('native appointment explicit offline profile',()=>{
 it('maps the exact offline follow-up request to a valid empty list without masking appointment failures or foreign scopes',()=>{
  const body={bizType:'serviceAppointment',sid:ids.workOrderId,actionType:'1,2,3,4,5,6'}
  store.set(nativeAppointmentSceneKey,'failed')
  expect(workOrderActivities(nativeAppointmentMockRead('biz/action/query.do',body))).toEqual([])
  expect(nativeAppointmentMockRead('biz/action/query.do',{...body,sid:'foreign-work-order'})).toBeNull()
  expect(nativeAppointmentMockRead('biz/action/query.do',{...body,actionType:'1'})).toBeNull()
  vi.stubEnv('VITE_XLINK_NATIVE_APPOINTMENT_MOCK','false')
  expect(nativeAppointmentMockRead('biz/action/query.do',body)).toBeNull()
  expect(network).not.toHaveBeenCalled()
 })
 it('requires MP compile platform and empty native origin as well as all isolation guards',()=>{
  expect(nativeAppointmentMockEnabled(env,'')).toBe(true);expect(nativeAppointmentMockEnabled(env,'http://localhost:5174')).toBe(false)
 })
 it.each([{DEV:false},{PROD:true},{UNI_PLATFORM:'h5'},{UNI_PLATFORM:'app'},{VITE_XLINK_ENVIRONMENT:'prod'},{VITE_XLINK_ENVIRONMENT:'production'},{VITE_XLINK_ENVIRONMENT:'beta'},{VITE_XLINK_NATIVE_APPOINTMENT_MOCK:'false'},{VITE_XLINK_MOCK:'false'},{VITE_XLINK_AUTH_TENANT:'real'},{VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm'},{VITE_XLINK_ENABLE_REAL_WRITES:'true'},{VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true'},{VITE_XLINK_AUTH_API_BASE_URL:'https://example.com'},{VITE_XLINK_R1_REPEAT_ACTIONS:'true'},{VITE_XLINK_R1_REPEAT_GRANT:'{}'},{VITE_XLINK_QUICK_LOGIN_PHONE:'test'}])('denies unsafe profile %j',override=>{expect(nativeAppointmentMockEnabled({...env,...override},'',(override as any).UNI_PLATFORM??'mp-weixin')).toBe(false)})
 it('edits exact active A with the original six-field guard, saves locally and rereads; B is unchanged',async()=>{
  store.set(nativeAppointmentSceneKey,'multiple');const f=fixture(),snapshot=await f.reader.load(ids.workOrderId,ids.runtimeNodeId),action=f.provider.forSnapshot(snapshot)!
  expect(action.canEdit?.(ids.recordId)).toBe(true);expect(action.canEdit?.('mock-appointment-record-022-b')).toBe(false)
  const b=JSON.stringify(snapshot.records[1]),values=action.initialValues!(ids.recordId)!
  const saved=await action.saveOnly({...values,datetime:'2026-11-20 14:09:42',modifyReason:'客户调整'},ids.recordId)
  expect(saved.records[0]!.values).toMatchObject({datetime:'2026-11-20 14:09:42',modifyReason:'客户调整'});expect(JSON.stringify(saved.records[1])).toBe(b)
  expect(store.get(nativeAppointmentWriteCountKey)).toBe(1);expect(network).not.toHaveBeenCalled();expect(f.calls.some(request=>/process|takeback|upload|delete/i.test(request.path))).toBe(false)
 })
 it('refuses changed actor or unlisted work context before dispatch',async()=>{
  for(const change of ['changeRole','unlist'] as const){const f=fixture(),s=await f.reader.load(ids.workOrderId,ids.runtimeNodeId),action=f.provider.forSnapshot(s)!,values=action.initialValues!(ids.recordId)!;f[change]();await expect(action.saveOnly({...values,modifyReason:'changed'},ids.recordId)).rejects.toThrow()}
  expect(store.get(nativeAppointmentWriteCountKey)).toBeUndefined();expect(network).not.toHaveBeenCalled()
 })
 it('acknowledgement loss stays uncertain across reader/provider reentry and never replays',async()=>{
  store.set(nativeAppointmentSceneKey,'uncertain');const f=fixture(),snapshot=await f.reader.load(ids.workOrderId,ids.runtimeNodeId),action=f.provider.forSnapshot(snapshot)!,values=action.initialValues!(ids.recordId)!
  await expect(action.saveOnly({...values,modifyReason:'changed'},ids.recordId)).rejects.toThrow();expect(store.get(nativeAppointmentWriteCountKey)).toBe(1)
  const fresh=fixture(),s=await fresh.reader.load(ids.workOrderId,ids.runtimeNodeId),next=fresh.provider.forSnapshot(s)!
  expect(next.canEdit?.(ids.recordId)).toBe(false);await expect(next.saveOnly({...values,modifyReason:'retry'},ids.recordId)).rejects.toThrow();expect(store.get(nativeAppointmentWriteCountKey)).toBe(1)
 })
 it('does not open a write capability for a completed node or foreign scope',async()=>{
  const f=fixture(),s=await f.reader.load(ids.workOrderId,ids.runtimeNodeId)
  expect(f.provider.forSnapshot({...s,node:{...s.node,lifecycle:'closed'}})).toBeNull()
  await expect(createNativeAppointmentMockCommandTransport().execute({method:'POST',path:'basic/workflow/process',body:{}})).rejects.toThrow();expect(network).not.toHaveBeenCalled()
 })
 it('unmatched native history reads are blocked without a network executor call',async()=>{
  const f=fixture(),history=createHistoricalFormsReader({auth:f.auth,read:f.read,env,origin:'',tenantId:ids.tenantId,appointmentArchive:true,appointmentNodeId:'unknown-node'})
  expect(history.enabled()).toBe(true);await expect(history.discover('unknown-offline-record')).rejects.toThrow();expect(network).not.toHaveBeenCalled()
 })
})
it('native cloning preserves nested aliases and literal temporal values without structuredClone',()=>{const original={datetime:'2026-11-20 10:37:42',values:[{note:'old'}],date:new Date(1234)};const copied=clonePlainData(original);copied.values[0]!.note='changed';expect(original.values[0]!.note).toBe('old');expect(copied.date.getTime()).toBe(1234);expect(copied.datetime).toBe(original.datetime);expect(()=>clonePlainData(new Map())).toThrow()})
describe('native receipt exclusion',()=>{
 it('rejects a concurrent click instead of queuing another write',async()=>{
  const a=createNativeAppointmentMockLock('test-lock'),b=createNativeAppointmentMockLock('test-lock');let resolve!:()=>void
  const wait=new Promise<void>(r=>{resolve=r}),first=a.run(async mark=>{mark('uncertain');await wait;mark('ready')})
  await expect(b.run(async()=>{})).rejects.toThrow();resolve();await first
 })
 it('corrupt or inaccessible storage fails closed',()=>{
  store.set('corrupt','{}');expect(createNativeAppointmentMockLock('corrupt').locked).toBe(true)
  vi.stubGlobal('uni',{getStorageSync:()=>{throw Error('unavailable')}});expect(createNativeAppointmentMockLock('storage-error').locked).toBe(true)
 })
})
