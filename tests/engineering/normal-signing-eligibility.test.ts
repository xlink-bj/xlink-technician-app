import {beforeEach,it,expect,vi} from 'vitest'
import {createPinia,setActivePinia} from 'pinia'
import {ref} from 'vue'
import {useSigningReviewReadStore} from '@features/work-orders/signing/signing-review-read-store'
import {reviewR1ActivePlaceOrderHandler} from '@features/work-orders/signing/r1-signing-node-handler-evidence'
import {reviewR1SigningIntent} from '@features/work-orders/signing/r1-signing-command-intents'
import {createQuotationOrderReadAdapter} from '@adapters/api/quotation-order-api'
beforeEach(()=>setActivePinia(createPinia()))
function fixture(){
 const actor=ref<any>({sessionRef:'synthetic-session',user:{id:'u'},currentRole:{id:'r'},capabilityNames:[]})
 const listed=ref(true)
 const order:any={id:'o',serviceAppointmentId:'s',type:1,state:1,processState:0,hasExts:true,isAgainState:'absent',groups:[],contentSupported:false,pdfState:'absent'}
 const detail:any={id:'s',workflowRunId:'w',workflowNodes:[{id:'n',runId:'w',category:'placeOrder',lifecycle:'active',isSystem:false,isSentinel:false,visibility:{evidenceState:'verified'},handlers:[{kind:'user',userId:'u'}]}]}
 const port:any={getQuotationOrderById:vi.fn(),listTypeOneOrdersForWorkOrder:vi.fn(async()=>({state:'succeeded',data:{items:[order],page:1,pageSize:3,totalCount:1}})),readScopedTypeOneOrderForSigningReview:vi.fn(async()=>({state:'succeeded',data:{order,signingAuthorized:false,contractReadAuthorized:false}})),listR1ContractsForSigningReview:vi.fn(async()=>({state:'succeeded',data:{completeness:'bounded_unverified',items:[]}}))}
 const node=vi.fn(async()=>({state:'succeeded',data:detail})),store=useSigningReviewReadStore()
 store.configure(port,()=>actor.value,id=>listed.value&&id==='s',{getWorkOrderDetail:node} as any,()=>true)
 return{actor,listed,order,detail,port,node,store}
}
it('accepts a nullable-version session for readonly current handler evidence',()=>{const f=fixture();expect(reviewR1ActivePlaceOrderHandler(f.detail,f.actor.value,'s').verified).toBe(true)})
it('normal store composes current Order, bounded Contract and fresh handler; never enables dispatch',async()=>{const f=fixture();expect((await f.store.load('s','o')).state).toBe('succeeded');await f.store.loadContracts();await f.store.loadNodeHandlerEvidence();expect(f.store.handlerSnapshot.state).toBe('verified');expect(f.store.initialSigningIntent.assessment).toBe('candidate');expect(f.store.initialSigningIntent.mayDispatch).toBe(false);expect(f.store.initialSigningIntent.backendPermissionProven).toBe(false);expect(f.port.getQuotationOrderById).not.toHaveBeenCalled()})
it.each(['absent','invalid','unread'] as const)('distinguishes complete EXTS %s isAgain from unknown',mode=>{const f=fixture();f.order.isAgainState=mode==='unread'?undefined:mode;const result=reviewR1SigningIntent('electronic',{workOrderId:'s',selectedOrderId:'o',officialOrder:f.order,contractState:'succeeded',contracts:[],currentRoleWorkOrderVerified:true,currentNodeHandlerVerified:true,currentIdentityVerified:true});expect(result.assessment).toBe(mode==='absent'?'candidate':'blocked');expect(result.mayDispatch).toBe(false)})
it.each(['logout','role','membership','session'] as const)('revokes composed eligibility on %s',async mode=>{const f=fixture();await f.store.load('s','o');await f.store.loadContracts();await f.store.loadNodeHandlerEvidence();if(mode==='logout')f.actor.value=null;if(mode==='role')f.actor.value={...f.actor.value,currentRole:{id:'other'}};if(mode==='session')f.actor.value={...f.actor.value,sessionRef:'replacement'};if(mode==='membership')f.listed.value=false;expect(f.store.handlerSnapshot.state).toBe('idle');expect(f.store.initialSigningIntent.assessment).toBe('blocked');expect(f.store.initialSigningIntent.mayDispatch).toBe(false)})
it('drops a late handler result after session expiry',async()=>{const f=fixture();await f.store.load('s','o');let finish!:(v:any)=>void;f.node.mockImplementationOnce(()=>new Promise(r=>finish=r));const pending=f.store.loadNodeHandlerEvidence();f.actor.value=null;finish({state:'succeeded',data:f.detail});await pending;expect(f.store.handlerSnapshot.state).not.toBe('verified');expect(f.store.initialSigningIntent.assessment).toBe('blocked')})
it('mismatched/ambiguous active nodes never qualify',async()=>{const f=fixture();f.actor.value.roleVersion='v';f.detail.workflowNodes[0].runId='foreign';await f.store.load('s','o');await f.store.loadContracts();await f.store.loadNodeHandlerEvidence();expect(f.store.handlerSnapshot.state).toBe('blocked');expect(f.store.initialSigningIntent.assessment).toBe('blocked')})
it.each([null,false,'',[],{},'bad',-1] as unknown[])('malformed isAgain %j stays unknown in the real read adapter',async value=>{
 const raw={_id:'o',type:1,state:1,processState:0,serviceAppointmentId:'s',bjProducts:JSON.stringify({orderList:[]}),exts:{isAgain:value}}
 const execute=vi.fn(async()=>({data:[raw],total:1,page:1,rows:3}))
 const adapter=createQuotationOrderReadAdapter({execute} as any,()=>true,()=> 'current-identity')
 const read=await adapter.listTypeOneOrdersForWorkOrder('s',3)
 expect(read.state).toBe('succeeded');if(read.state!=='succeeded'||!read.data)throw Error('missing read')
 expect(read.data.items[0]).toMatchObject({hasExts:true,isAgainState:'invalid'});expect(read.data.items[0].isAgain).toBeUndefined()
})
it('complete EXTS absence is explicit, rather than coerced to isAgain=0',async()=>{
 const execute=vi.fn(async()=>({data:[{_id:'o',type:1,state:1,serviceAppointmentId:'s',bjProducts:'{}',exts:{}}],total:1,page:1,rows:3}))
 const adapter=createQuotationOrderReadAdapter({execute} as any,()=>true,()=> 'current-identity'),read=await adapter.listTypeOneOrdersForWorkOrder('s',3)
 expect(read.state).toBe('succeeded');if(read.state!=='succeeded'||!read.data)throw Error('missing read')
 expect(read.data.items[0]).toMatchObject({hasExts:true,isAgainState:'absent'});expect(read.data.items[0].isAgain).toBeUndefined()
})
it.each([0,'0',1,'1'] as const)('projects a verified literal isAgain=%j without granting signing',async value=>{
 const execute=vi.fn(async()=>({data:[{_id:'o',type:1,state:1,processState:0,serviceAppointmentId:'s',bjProducts:'{}',exts:{isAgain:value}}],total:1,page:1,rows:3}))
 const adapter=createQuotationOrderReadAdapter({execute} as any,()=>true,()=> 'current-identity'),read=await adapter.listTypeOneOrdersForWorkOrder('s',3)
 expect(read.state).toBe('succeeded');if(read.state!=='succeeded'||!read.data)throw Error('missing read')
 const official=read.data.items[0]!;expect(official).toMatchObject({hasExts:true,isAgainState:'present',isAgain:Number(value)})
 const result=reviewR1SigningIntent('electronic',{workOrderId:'s',selectedOrderId:'o',officialOrder:official,contractState:'succeeded',contracts:[],currentRoleWorkOrderVerified:true,currentNodeHandlerVerified:true,currentIdentityVerified:true})
 expect(result.assessment).toBe(Number(value)===1?'blocked':'candidate');expect(result.mayDispatch).toBe(false)
})
