import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import type {
  QuotationOrderReadPort, SessionSnapshot, TechnicianApiReadPort, WorkOrderDetail,
  WorkflowHandlerIdentity,
} from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { reviewR1ActivePlaceOrderHandler } from '@features/work-orders/signing/r1-signing-node-handler-evidence'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'

const wo = 'synthetic-workorder-201'
const orderId = 'official-order-201'
const user = 'technician-201'
const role = 'role-201'
const session = (roleName=role, roleVersion='v1'): SessionSnapshot => ({
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>(user) },
  currentRole: { id: asOpaqueId<'RoleId'>(roleName) },
  roleVersion, capabilityNames: [],
})
const userHandler: WorkflowHandlerIdentity = {
  kind: 'user', userId: asOpaqueId<'UserId'>(user),
}
const roleHandler: WorkflowHandlerIdentity = {
  kind: 'role', roleId: asOpaqueId<'RoleId'>(role),
}
function detail(handlers: readonly WorkflowHandlerIdentity[] = [userHandler]): WorkOrderDetail {
  return {
    id: asOpaqueId<'WorkOrderId'>(wo),
    workflowRunId: asOpaqueId<'WorkflowRunId'>('run-201'),
    workflowNodes: [{
      id: asOpaqueId<'WorkflowNodeRuntimeId'>('node-201'),
      runId: asOpaqueId<'WorkflowRunId'>('run-201'),
      category: 'placeOrder', lifecycle: 'active',
      visibility: { evidenceState: 'verified' }, handlers,
    }],
  }
}
function delayed<T>() {
  let finish!: (v:T)=>void
  const promise = new Promise<T>(resolve=>{finish=resolve})
  return {promise, finish}
}

describe('M1 I6 R1 active WorkflowNode handler read evidence, never signing rights',()=>{
  beforeEach(()=>setActivePinia(createPinia()))

  it('proves exact current active handler via userId, roleId or raw R1 mixed identity',()=>{
    for(const handlers of [
      [userHandler], [roleHandler],
      [{kind:'unclassified' as const,value:user}],
      [{kind:'unclassified' as const,value:role}],
    ]){
      expect(reviewR1ActivePlaceOrderHandler(detail(handlers),session(),wo).verified).toBe(true)
    }
  })

  it('org+role, viewableRoleIds and current WorkOrder access alone do NOT imply handler rights',()=>{
    expect(reviewR1ActivePlaceOrderHandler(detail([{
      kind:'organizationRole',organizationId:asOpaqueId<'OrganizationId'>('org-201'),
      roleId:asOpaqueId<'RoleId'>(role),
    }]),session(),wo).verified).toBe(false)
    expect(reviewR1ActivePlaceOrderHandler(detail([]),session(),wo).verified).toBe(false)
    expect(reviewR1ActivePlaceOrderHandler(detail([{
      kind:'unclassified',value:'other-person',
    }]),session(),wo).verified).toBe(false)
  })

  it('fail-closed on stale WorkOrder, wrong workflow, ambiguous nodes, closed nodes, unknown visibility',()=>{
    const clean=detail()
    const n=clean.workflowNodes![0]!
    for(const bad of [
      {...clean,id:asOpaqueId<'WorkOrderId'>('another-workorder')},
      {...clean,workflowNodes:[{...n,runId:asOpaqueId<'WorkflowRunId'>('foreign-run')}]},
      {...clean,workflowNodes:[n,n]},
      {...clean,workflowNodes:[{...n,lifecycle:'closed' as const}]},
      {...clean,workflowNodes:[{...n,visibility:{evidenceState:'unknown' as const}}]},
      {...clean,workflowNodes:[{...n,category:'forms' as const}]},
    ]){
      expect(reviewR1ActivePlaceOrderHandler(bad,session(),wo).verified).toBe(false)
    }
    expect(reviewR1ActivePlaceOrderHandler(clean,null,wo).verified).toBe(false)
    expect(reviewR1ActivePlaceOrderHandler(clean,{...session(),roleVersion:undefined},wo).verified).toBe(false)
  })

  function setup(options: {
    read?:()=>Promise<unknown>
    isAllowed?:boolean
    visible?:boolean
  }={}){
    const current=ref<SessionSnapshot|null>(session())
    const visible=ref(options.visible??true)
    const api= { getWorkOrderDetail:vi.fn(options.read??(async()=>({
      state:'succeeded',data:detail(),
    }))) } as unknown as TechnicianApiReadPort
    const quote={
      getQuotationOrderById:vi.fn(async()=>({state:'failed_terminal' as const})),
      listTypeOneOrdersForWorkOrder:vi.fn(async()=>({
        state:'succeeded' as const,
        data:{items:[{id:orderId,serviceAppointmentId:wo,type:1 as const,
          groups:[],contentSupported:false,pdfState:'present_no_access' as const}]},
      })),
      readScopedTypeOneOrderForSigningReview:vi.fn(async()=>({
        state:'succeeded' as const,
        data:{order:{id:orderId,serviceAppointmentId:wo,type:1 as const,
          groups:[],contentSupported:false,pdfState:'present_no_access' as const},
          contractReadAuthorized:false as const,signingAuthorized:false as const},
      })),
    } as unknown as QuotationOrderReadPort
    const store=useSigningReviewReadStore()
    store.configure(quote,()=>current.value,id=>visible.value&&id===wo,api,()=>options.isAllowed??true)
    return {store,api,current,visible,quote}
  }

  it('performs one explicit fresh detail read after verified official Order only; no signing commands',async()=>{
    const a=setup()
    expect((await a.store.load(wo,orderId)).state).toBe('succeeded')
    expect(a.api.getWorkOrderDetail).not.toHaveBeenCalled()
    await a.store.loadNodeHandlerEvidence()
    expect(a.api.getWorkOrderDetail).toHaveBeenCalledTimes(1)
    expect(a.store.handlerSnapshot).toMatchObject({state:'verified'})
    expect(JSON.stringify(a.store.handlerSnapshot)).not.toContain(user)
    expect(a.quote).not.toHaveProperty('signContract')
    expect(a.quote).not.toHaveProperty('sendSms')
  })

  it('refuses any read without explicit DEV scoped permission',async()=>{
    const a=setup({isAllowed:false})
    await a.store.load(wo,orderId)
    await a.store.loadNodeHandlerEvidence()
    expect(a.store.handlerSnapshot.state).toBe('blocked')
    expect(a.api.getWorkOrderDetail).not.toHaveBeenCalled()
  })

  it('revokes a pending/verified node check on role version change or WorkOrder removal',async()=>{
    const wait=delayed<unknown>()
    const a=setup({read:()=>wait.promise})
    await a.store.load(wo,orderId)
    const pending=a.store.loadNodeHandlerEvidence()
    expect(a.store.handlerSnapshot.state).toBe('loading')
    a.current.value=session(role,'v2')
    wait.finish({state:'succeeded',data:detail()})
    await pending
    expect(a.store.handlerSnapshot.state).not.toBe('verified')
    expect(a.store.snapshot.state).toBe('idle')
    await a.store.load(wo,orderId)
    a.visible.value=false
    expect(a.store.handlerSnapshot.state).toBe('idle')
  })

  it('does not echo a backend exception or persist raw workflow handlers',async()=>{
    const a=setup({read:async()=>{throw new Error('PRIVATE_BACKEND_ROLE_SECRET')}})
    await a.store.load(wo,orderId)
    await a.store.loadNodeHandlerEvidence()
    expect(a.store.handlerSnapshot.state).toBe('blocked')
    expect(JSON.stringify(a.store.handlerSnapshot)).not.toContain('PRIVATE_BACKEND_ROLE_SECRET')
    expect(JSON.stringify(a.store.handlerSnapshot)).not.toContain(user)
  })
})
