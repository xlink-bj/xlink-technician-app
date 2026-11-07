import { afterEach, expect, it, vi } from 'vitest'
import { createLocalSigningReadAuthority, localSigningReadScope as s } from '@app/local-signing-read-authority'
import type { AuthSessionPort, TechnicianApiReadPort } from '@shared/ports'
import type { UniRequestExecutor } from '@adapters/auth/uni-auth-backend'
import type { ApiReadRequest } from '@adapters/api/technician-api'
const origin = 'http://127.0.0.1:5189'
const env = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_API_BASE_URL: origin+'/xlink/wm',
 VITE_XLINK_AUTH_TENANT: s.tenantId, VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'false',
 VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false', VITE_XLINK_LOCAL_SESSION_RESTORE: 'natural-readonly-v1',
 VITE_XLINK_LOCAL_SIGNING_READ: 'normal-order-readonly-v1' }
afterEach(() => vi.unstubAllGlobals())
function fixture(patch: Record<string,unknown> = {}, testOrigin = origin, platformDefault = false) {
 let listed = true, revoked = false, calls = 0, revokeAt = Infinity
 let actor = { sessionRef:'test-only-ref', user:{id:s.userId}, currentRole:{id:s.roleId} }
 const detail = { serviceAppointment: { _id:s.workOrderId, tenantId:s.tenantId, orgId:s.orgId, state:1,
  serviceType:'11', exts:{sourceType:'4'}, workflowId:s.workflowRunId },
 workflow:{_id:s.workflowRunId, tenantId:s.tenantId,formDataId:s.workOrderId,state:0},
 workflowNode:[{_id:s.runtimeNodeId,tenantId:s.tenantId,orgId:s.orgId,workflowId:s.workflowRunId,workflowFormDataId:s.workOrderId,
  workflowFormColName:'serviceAppointment',state:0,nodeDef:{nodeType:'placeOrder'},handlerIds:[s.userId]}] }
 const order:Record<string,unknown> = {_id:s.orderId,tenantId:s.tenantId,orgId:s.orgId,serviceAppointmentId:s.workOrderId,type:1,state:0,bjProducts:JSON.stringify({orderList:[]})}
 const contracts:Record<string,unknown>[] = []
 const request = vi.fn<UniRequestExecutor>(o => { calls++; o.success?.({statusCode:revoked || calls===revokeAt ? 401:200,header:{},cookies:[],data: revoked || calls===revokeAt ? {valid:false}: {valid:true,data:{user:{_id:s.userId},currentRole:{_id:s.roleId},tenantId:s.tenantId,orgId:s.orgId,capabilityNames:[],fresh:true,membershipVerified:true}}}) })
 const execute = vi.fn(async (q:ApiReadRequest) => q.path.includes('queryById/') ? {success:true,status:1,data:detail}
  : {page:1,size:3,total:q.path==='basic/order/query'?1:contracts.length,data:q.path==='basic/order/query'?[order]:contracts})
 const listWorkOrders = vi.fn(async () => {listed=true;return {state:'succeeded',data:{page:1,totalCount:1,items:[{id:s.workOrderId}]}}})
 const authority = createLocalSigningReadAuthority({env:{...env,...patch},origin:testOrigin,...(platformDefault ? {} : { request }),transport:{execute},
 auth:{getCurrentSession:()=>actor} as unknown as Pick<AuthSessionPort,'getCurrentSession'>,
 read:{listWorkOrders,isWorkOrderListedForCurrentSession:()=>listed} as unknown as Pick<TechnicianApiReadPort,'listWorkOrders'|'isWorkOrderListedForCurrentSession'>})
 return {authority,request,execute,detail,order,contracts,listWorkOrders,setListed:(v:boolean)=>{listed=v},revoke:()=>{revoked=true},revokeAt:(v:number)=>{revokeAt=v},changeActor:()=>{actor={...actor,sessionRef:'changed'}}}
}
it('requires preparation and uses true fingerprint without fabricating roleVersion',async()=>{
 const x=fixture();expect(x.authority.currentKey()).toContain('null');expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)
 await x.authority.prepare(s.workOrderId,s.orderId);expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(true)
 x.changeActor();expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)
})
for(const patch of [{DEV:false},{PROD:true},{VITE_XLINK_LOCAL_SIGNING_READ:''},{VITE_XLINK_MOCK:'true'},
 {VITE_XLINK_ENABLE_REAL_WRITES:'true'},{VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true'}, {VITE_XLINK_AUTH_TENANT:'wrong'},
 {VITE_XLINK_LOCAL_SESSION_RESTORE:'ack-audit-readonly-v1'},{VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS:'true'}])
 it('closed mode '+JSON.stringify(patch),async()=>{const x=fixture(patch);await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow();expect(x.request).not.toHaveBeenCalled();expect(x.execute).not.toHaveBeenCalled()})
for(const wrong of ['https://127.0.0.1:5189','http://localhost:5189','http://127.0.0.1:5190'])it('rejects origin '+wrong,()=>expect(fixture({},wrong).authority.enabled()).toBe(false))
it('rebuilds cold authorization only from bounded ordinary list',async()=>{const x=fixture();x.setListed(false);await x.authority.prepare(s.workOrderId,s.orderId);expect(x.listWorkOrders).toHaveBeenCalledWith({page:1,pageSize:20})})
it('rejects stale list and revoked fresh authority',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);x.setListed(false);expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).not.toBe('succeeded');x.setListed(true);x.revoke();await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow()})
it('second authority failure prevents consuming raw detail',async()=>{const x=fixture();x.revokeAt(3);await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow();expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)})
for(const patch of [{tenantId:'other'},{orgId:'other'},{_id:'other'},{state:10},{serviceType:'other'},{exts:{sourceType:'4',scheduleFlag:'x'}}])it('rejects raw SA '+JSON.stringify(patch),async()=>{const x=fixture();Object.assign(x.detail.serviceAppointment,patch);await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow()})
for(const patch of [{tenantId:'other'},{orgId:'other'},{serviceAppointmentId:'other'},{type:0},{state:10}])it('rejects raw Order '+JSON.stringify(patch),async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);Object.assign(x.order,patch);expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).not.toBe('succeeded');expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)})
it('never forwards direct Order lookups',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);x.execute.mockClear();expect((await x.authority.port.getQuotationOrderById(s.orderId)).state).not.toBe('succeeded');expect(x.execute).not.toHaveBeenCalled()})
it('contract query includes exact Order and org; empty remains bounded unverified',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);const result=await x.authority.port.listR1ContractsForSigningReview!(s.workOrderId,s.orderId);expect(result).toMatchObject({state:'succeeded',data:{items:[],completeness:'bounded_unverified'}});expect(x.execute.mock.calls.find(([q])=>q.path==='basic/contract/query.do')?.[0].body).toMatchObject({'is:orderId|string#and':s.orderId,'is:orgId|string#and':s.orgId});expect(x.execute.mock.calls.every(([q])=>!Object.hasOwn(q.body??{},'_all'))).toBe(true)})
for(const patch of [{tenantId:'other'},{orgId:'other'},{serviceAppointmentId:'other'},{orderId:'other'}])it('rejects Contract '+JSON.stringify(patch),async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);x.contracts.push({_id:'contract',tenantId:s.tenantId,orgId:s.orgId,serviceAppointmentId:s.workOrderId,orderId:s.orderId,state:1,...patch});expect((await x.authority.port.listR1ContractsForSigningReview!(s.workOrderId,s.orderId)).state).not.toBe('succeeded')})
it('does not allow smaller alternate order query shape',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);x.execute.mockClear();expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,1)).state).not.toBe('succeeded');expect(x.execute).not.toHaveBeenCalled()})
it('scoped review preserves contractRead and signingAuthorized false',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);expect(await x.authority.port.readScopedTypeOneOrderForSigningReview!(s.workOrderId,s.orderId)).toMatchObject({state:'succeeded',data:{contractReadAuthorized:false,signingAuthorized:false}})})
it('missing selected Order never reaches Contract transport',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);x.order._id='other-order';expect((await x.authority.port.listR1ContractsForSigningReview!(s.workOrderId,s.orderId)).state).not.toBe('succeeded');expect(x.execute.mock.calls.some(([q])=>q.path==='basic/contract/query.do')).toBe(false)})
it('actor changes during raw Order read invalidate result',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);const original=x.execute.getMockImplementation()!;x.execute.mockImplementation(async q=>{const raw=await original(q);if(q.path==='basic/order/query')x.changeActor();return raw});expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).not.toBe('succeeded')})
it('cold list total above 200 cannot authorize',async()=>{const x=fixture();x.setListed(false);x.listWorkOrders.mockResolvedValue({state:'succeeded',data:{page:1,totalCount:201,items:[{id:s.workOrderId}]}});await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow();expect(x.execute).not.toHaveBeenCalled()})
for(const scheduleFlag of [false,0,[],{}])it('rejects nonempty scheduleFlag even falsy '+JSON.stringify(scheduleFlag),async()=>{const x=fixture();Object.assign(x.detail.serviceAppointment.exts,{scheduleFlag});await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow()})
it('other SID and Order cannot prepare or call live transport',async()=>{const x=fixture();await expect(x.authority.prepare('other',s.orderId)).rejects.toThrow();await expect(x.authority.prepare(s.workOrderId,'other')).rejects.toThrow();expect(x.request).not.toHaveBeenCalled();expect(x.execute).not.toHaveBeenCalled()})
it('ignores only top-level SA revision increment on read',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);Object.assign(x.detail.serviceAppointment,{_version:20});expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).toBe('succeeded');Object.assign(x.detail.serviceAppointment,{_version:21});expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).toBe('succeeded')})
for(const field of ['saIdentity','saOther','node','workflow'])it('still rejects detail change '+field,async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);if(field==='saIdentity')Object.assign(x.detail.serviceAppointment,{orgId:'other'});if(field==='saOther')Object.assign(x.detail.serviceAppointment,{description:'changed'});if(field==='node')x.detail.workflowNode[0]!.state=10;if(field==='workflow')Object.assign(x.detail.workflow,{_version:7});expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).not.toBe('succeeded')})
it('Contract total over three rejects even an empty bounded page',async()=>{const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId);const original=x.execute.getMockImplementation()!;x.execute.mockImplementation(async q=>{const raw=await original(q);return q.path==='basic/contract/query.do'?{page:1,size:3,total:4,data:[]}:raw});expect((await x.authority.port.listR1ContractsForSigningReview!(s.workOrderId,s.orderId)).state).not.toBe('succeeded')})
it('late superseded Order failure cannot clear a newer prepared authority',async()=>{
 const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId)
 const original=x.execute.getMockImplementation()!
 let release!:()=>void, signalStarted!:()=>void
 const blocked=new Promise<void>(resolve=>{release=resolve})
 const started=new Promise<void>(resolve=>{signalStarted=resolve})
 let firstOrder=true
 x.execute.mockImplementation(async q=>{
  if(q.path==='basic/order/query' && firstOrder){firstOrder=false;signalStarted();await blocked;throw Error('old delayed read failed')}
  return original(q)
 })
 const oldRead=x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)
 await started
 await x.authority.prepare(s.workOrderId,s.orderId)
 expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).toBe('succeeded')
 release()
 expect((await oldRead).state).not.toBe('succeeded')
 expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(true)
 expect(await x.authority.port.listR1ContractsForSigningReview!(s.workOrderId,s.orderId)).toMatchObject({state:'succeeded',data:{items:[],completeness:'bounded_unverified'}})
})
it('same-generation Order transport failure still revokes prepared authority',async()=>{
 const x=fixture();await x.authority.prepare(s.workOrderId,s.orderId)
 const original=x.execute.getMockImplementation()!
 x.execute.mockImplementation(async q=>{if(q.path==='basic/order/query')throw Error('current read failed');return original(q)})
 expect((await x.authority.port.listTypeOneOrdersForWorkOrder(s.workOrderId,3)).state).not.toBe('succeeded')
 expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)
 x.execute.mockClear()
 expect((await x.authority.port.listR1ContractsForSigningReview!(s.workOrderId,s.orderId)).state).not.toBe('succeeded')
 expect(x.execute).not.toHaveBeenCalled()
})
it('uses the adapter-owned platform default only for the unchanged authority protocol',async()=>{
 const x=fixture({},origin,true)
 vi.stubGlobal('uni',{request:x.request})
 expect(x.request).not.toHaveBeenCalled()
 await x.authority.prepare(s.workOrderId,s.orderId)
 expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(true)
 expect(x.request).toHaveBeenCalledTimes(3)
 for(const [options] of x.request.mock.calls){
  expect(options.url).toBe(origin+'/xlink/__local/session-authority')
  expect(options.method).toBe('POST')
  expect(options.header).toMatchObject({'Content-Type':'application/json'})
  expect(options.data).toEqual({sessionRef:'test-only-ref',userId:s.userId,roleId:s.roleId,tenantId:s.tenantId,orgId:s.orgId})
 }
 expect(x.execute.mock.calls.every(([q])=>q.path===`basic/serviceAppointment/queryById/${s.workOrderId}`)).toBe(true)
})
it('closed local mode never invokes the adapter platform fallback',async()=>{
 const x=fixture({VITE_XLINK_LOCAL_SIGNING_READ:''},origin,true)
 vi.stubGlobal('uni',{request:x.request})
 await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow()
 expect(x.request).not.toHaveBeenCalled()
 expect(x.execute).not.toHaveBeenCalled()
 expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)
})
it('unavailable platform executor fails closed before any business read',async()=>{
 const x=fixture({},origin,true)
 vi.stubGlobal('uni',undefined)
 await expect(x.authority.prepare(s.workOrderId,s.orderId)).rejects.toThrow()
 expect(x.execute).not.toHaveBeenCalled()
 expect(x.authority.isContractReadAllowed(s.workOrderId)).toBe(false)
})
