import {beforeEach,it,expect,vi} from 'vitest'
import {createPinia,setActivePinia} from 'pinia'
import {ref} from 'vue'
import {useSigningReviewReadStore} from '@features/work-orders/signing/signing-review-read-store'
import {reviewR1ActivePlaceOrderHandler} from '@features/work-orders/signing/r1-signing-node-handler-evidence'
import {reviewR1SigningIntent} from '@features/work-orders/signing/r1-signing-command-intents'
beforeEach(()=>setActivePinia(createPinia()))
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>resolve=r);return{promise,resolve}}
function fixture(){
 const actor=ref<any>({sessionRef:'independent-session',user:{id:'engineer'},currentRole:{id:'role'},capabilityNames:[]})
 const listed=ref(true),orders:any={}
 for(const id of ['order-a','order-b'])orders[id]={id,serviceAppointmentId:'job',type:1,state:1,processState:0,hasExts:true,isAgainState:'absent',groups:[],contentSupported:false,pdfState:'absent'}
 const detail:any={id:'job',workflowRunId:'flow',workflowNodes:[{id:'node',runId:'flow',category:'placeOrder',lifecycle:'active',isSystem:false,isSentinel:false,visibility:{evidenceState:'verified'},handlers:[{kind:'user',userId:'engineer'}]}]}
 const contracts=vi.fn(async()=>({state:'succeeded',data:{completeness:'bounded_unverified',items:[]}}))
 const port:any={getQuotationOrderById:vi.fn(),
  listTypeOneOrdersForWorkOrder:vi.fn(async()=>({state:'succeeded',data:{items:Object.values(orders),page:1,pageSize:3,totalCount:2}})),
  readScopedTypeOneOrderForSigningReview:vi.fn(async(_job:string,id:string)=>({state:'succeeded',data:{order:orders[id],contractReadAuthorized:false,signingAuthorized:false}})),
  listR1ContractsForSigningReview:contracts}
 const node=vi.fn(async()=>({state:'succeeded',data:detail})),store=useSigningReviewReadStore()
 const configure=()=>store.configure(port,()=>actor.value,id=>listed.value&&id==='job',{getWorkOrderDetail:node} as any,()=>true)
 configure()
 return{actor,listed,orders,detail,node,port,contracts,store,configure}
}
async function qualified(f:ReturnType<typeof fixture>){
 expect((await f.store.load('job','order-a')).state).toBe('succeeded');await f.store.loadContracts();await f.store.loadNodeHandlerEvidence()
 expect(f.store.initialSigningIntent.assessment).toBe('candidate');expect(f.store.initialSigningIntent.mayDispatch).toBe(false)
}
it.each([undefined,null,''])('readonly nullable roleVersion=%j never creates signing authority',async value=>{
 const f=fixture();f.actor.value={...f.actor.value,roleVersion:value};await qualified(f)
 expect(f.store.initialSigningIntent).toMatchObject({backendPermissionProven:false,actualBusinessOutcomeKnown:false,mayDispatch:false})
 expect(f.port.getQuotationOrderById).not.toHaveBeenCalled()
})
it.each(['changed','removed'] as const)('a supplied version %s immediately revokes all composed evidence',async mode=>{
 const f=fixture();f.actor.value={...f.actor.value,roleVersion:'version-a'};await qualified(f)
 f.actor.value={...f.actor.value,roleVersion:mode==='changed'?'version-b':undefined}
 expect(f.store.snapshot.state).toBe('idle');expect(f.store.handlerSnapshot.state).toBe('idle');expect(f.store.contractSnapshot.state).toBe('idle')
 expect(f.store.initialSigningIntent.assessment).toBe('blocked');expect(f.store.initialSigningIntent.mayDispatch).toBe(false)
})
it('a late handler for A cannot qualify a newly selected Order B',async()=>{
 const f=fixture();await f.store.load('job','order-a');const gate=deferred();f.node.mockImplementationOnce(()=>gate.promise)
 const pending=f.store.loadNodeHandlerEvidence();await vi.waitFor(()=>expect(f.node).toHaveBeenCalledOnce())
 await f.store.load('job','order-b');gate.resolve({state:'succeeded',data:f.detail});await pending
 expect(f.store.snapshot.orderId).toBe('order-b');expect(f.store.handlerSnapshot.state).toBe('idle')
 expect(f.store.initialSigningIntent.assessment).toBe('blocked');expect(f.store.initialSigningIntent.mayDispatch).toBe(false)
})
it('a late Contract result for A cannot replace B current Contract evidence',async()=>{
 const f=fixture();await f.store.load('job','order-a');const gate=deferred();f.contracts.mockImplementationOnce(()=>gate.promise)
 const pending=f.store.loadContracts();await vi.waitFor(()=>expect(f.contracts).toHaveBeenCalledOnce())
 await f.store.load('job','order-b');gate.resolve({state:'succeeded',data:{completeness:'bounded_unverified',items:[{id:'contract-a',orderId:'order-a',serviceAppointmentId:'job',state:1,contractStatus:'2'}]}});await pending
 expect(f.store.snapshot.orderId).toBe('order-b');expect(f.store.contractSnapshot).toEqual({state:'idle',items:[]})
 expect(f.store.initialSigningIntent.mayDispatch).toBe(false)
})
it('reconfiguration cannot adopt an older pending handler even for identical IDs',async()=>{
 const f=fixture();await f.store.load('job','order-a');const gate=deferred();f.node.mockImplementationOnce(()=>gate.promise)
 const pending=f.store.loadNodeHandlerEvidence();await vi.waitFor(()=>expect(f.node).toHaveBeenCalledOnce())
 f.configure();await f.store.load('job','order-a');gate.resolve({state:'succeeded',data:f.detail});await pending
 expect(f.store.handlerSnapshot.state).toBe('idle');expect(f.store.initialSigningIntent.assessment).toBe('blocked')
})
it('an organization-role handler does not borrow an unverified session organization',()=>{
 const f=fixture();f.actor.value.user.orgId='organization';f.detail.workflowNodes[0].handlers=[{kind:'organizationRole',organizationId:'organization',roleId:'role'}]
 expect(reviewR1ActivePlaceOrderHandler(f.detail,f.actor.value,'job').verified).toBe(false)
})
it.each(['logout','membership','role'] as const)('pending handler is discarded on %s without new reads',async mode=>{
 const f=fixture();await f.store.load('job','order-a');const gate=deferred();f.node.mockImplementationOnce(()=>gate.promise)
 const pending=f.store.loadNodeHandlerEvidence();await vi.waitFor(()=>expect(f.node).toHaveBeenCalledOnce())
 if(mode==='logout')f.actor.value=null
 if(mode==='membership')f.listed.value=false
 if(mode==='role')f.actor.value={...f.actor.value,currentRole:{id:'replacement'}}
 gate.resolve({state:'succeeded',data:f.detail});await pending
 expect(f.store.handlerSnapshot.state).not.toBe('verified');expect(f.store.initialSigningIntent.assessment).toBe('blocked');expect(f.node).toHaveBeenCalledOnce()
})
it.each(['electronic','offline','resign','resend_sms','cancel'] as const)('composed %s output always denies dispatch',kind=>{
 const f=fixture();const intent=reviewR1SigningIntent(kind,{workOrderId:'job',selectedOrderId:'order-a',officialOrder:f.orders['order-a'],contractState:'succeeded',contracts:[],currentIdentityVerified:true,currentRoleWorkOrderVerified:true,currentNodeHandlerVerified:true})
 expect(intent.descriptor.kind).toBe(kind)
 expect(intent).toMatchObject({mayDispatch:false,backendPermissionProven:false,actualBusinessOutcomeKnown:false})
})
