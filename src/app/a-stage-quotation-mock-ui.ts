/** A-only quotation action: an explicit Mock-owned transport is the *only*
 * mutation backend. The ordinary App order command path stays disabled. */
import {
  isDevMockJourneyEnabled, mockJourneyNodes, mockJourneyOrderWorkflowDefinitionId,
  mockJourneyStage, mockJourneyWorkOrderId, mockJourneyOfficialOrderId,
  mockJourneyOrderWorkflowRunId,
} from '@adapters/api/mock/journey'
import { tryMockRead, tryMockCommand } from '@adapters/api/mock/router'
import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'
import { QuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import {
  restoreQuotationOrderSubmissionState, submitQuotationOrder,
} from '@features/work-orders/quotation/order-submission'
import type { QuotationEngineResult } from '@features/work-orders/quotation/engine'
import type { StoragePort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

export interface AStageQuoteActor { readonly userId: string; readonly roleId: string; readonly identity: string }
export function isAStageMockOrderEnabled(input: {
  readonly workOrderId: string | null | undefined
  readonly userId: string | null | undefined
  readonly roleId: string | null | undefined
}): boolean {
  return isDevMockJourneyEnabled() && mockJourneyStage() === 'quotation'
    && input.workOrderId === mockJourneyWorkOrderId
    && input.userId === 'synthetic-user' && input.roleId === 'synthetic-role'
}

export function createAStageMockQuoteOrderController(options: {
  readonly getActor: () => AStageQuoteActor | null
  readonly storage: StoragePort
}) {
  const expected = options.getActor()
  let inFlight = false
  const authorized = () => Boolean(expected?.identity
    && isAStageMockOrderEnabled({ workOrderId: mockJourneyWorkOrderId,
      userId: expected.userId, roleId: expected.roleId })
    && options.getActor()?.identity === expected.identity
    && options.getActor()?.userId === expected.userId
    && options.getActor()?.roleId === expected.roleId)

  // Each route is exact and never falls through to a remote HTTP request.
  const command = createQuotationOrderCommandAdapter({
    async execute(request) {
      if (!authorized()) throw new Error('Mock Order actor or stage has changed')
      if (!(request.path === `workflow/startWorkflow/order/null/${mockJourneyOrderWorkflowDefinitionId}`
        && request.body?.saId === mockJourneyWorkOrderId)
        && !(request.path === 'basic/order/upsert' && typeof request.body?.order === 'string'
          && (() => {
            try {
              const order = JSON.parse(request.body.order as string) as Record<string, unknown>
              return order.serviceAppointmentId === mockJourneyWorkOrderId && order.type === 1
            } catch { return false }
          })())) throw new Error('Order mutation is not owned by A Mock')
      const raw = await tryMockCommand(request.path, request.body ?? {})
      if (raw === null) throw new Error('A Mock Order command unavailable; no real fallback')
      return raw
    },
  })
  const readApi = new QuotationOrderReadAdapter({
    async execute(request) {
      if (!authorized() || request.path !== 'basic/order/queryById'
        || request.body?.id !== mockJourneyOfficialOrderId) {
        throw new Error('Order read is not scoped to this synthetic task')
      }
      const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
      if (raw === null) throw new Error('A Mock Order read unavailable; no real fallback')
      return raw
    },
  })
  function input(engine: QuotationEngineResult) {
    if (!expected || engine.state !== 'ready' || !engine.payload
      || engine.payload.serviceAppointmentId !== mockJourneyWorkOrderId
      || !Number.isFinite(engine.payload.totalPrice) || engine.payload.totalPrice <= 0) return null
    return {
      userId: asOpaqueId<'UserId'>(expected.userId),
      authorizationIdentityKey: expected.identity,
      authorizationCurrent: authorized,
      workOrderId: asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockJourneyNodes.quotation),
      workflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>(mockJourneyOrderWorkflowDefinitionId),
      expectedDraftVersion: engine.draftVersion,
      evaluatedDraftVersion: engine.draftVersion,
      engineReady: true as const,
      payload: engine.payload,
      command, readApi, storage: options.storage,
      // A synthetic Order never silently removes the editable local quote.
      finalizeDraft: async () => ({ state: 'succeeded' as const, data: undefined }),
    }
  }
  async function submit(engine: QuotationEngineResult): Promise<{
    readonly state: 'succeeded' | 'blocked' | 'uncertain'; readonly message: string
  }> {
    if (!authorized()) return { state: 'blocked', message: '账号、角色或 Mock 流程已变化。' }
    if (inFlight) return { state: 'blocked', message: '上一笔 Mock 订单正在提交。' }
    const ctx = input(engine)
    if (!ctx) return { state: 'blocked', message: '本机报价尚未完成价格和订单协议校验；SKU 价格不明时禁止提交。' }
    inFlight = true
    try {
      const result = await submitQuotationOrder(ctx)
      if (!authorized()) return { state: 'uncertain', message: '身份发生变化，Mock 订单回执已保留。' }
      return result.state === 'succeeded' && result.order?.id === mockJourneyOfficialOrderId
        ? { state: 'succeeded', message: '已创建并回读本机 Mock 报价订单；未生成真实订单或合同。' }
        : { state: 'uncertain', message: 'Mock 订单结果尚未确认，已阻止自动重试；请读取订单记录核对。' }
    } catch { return { state: 'uncertain', message: 'Mock 订单操作结果待核对，禁止再次提交。' } }
    finally { inFlight = false }
  }
  async function readStatus(engine: QuotationEngineResult) {
    if (!authorized()) return 'blocked' as const
    const ctx = input(engine)
    if (!ctx) return 'blocked' as const
    const result = await restoreQuotationOrderSubmissionState(ctx)
    return result.state === 'succeeded' ? 'succeeded' as const
      : result.state === 'failed_terminal' ? 'blocked' as const
      : result.state === 'failed_ambiguous_after_dispatch' || result.state === 'write_succeeded_readback_pending'
        ? 'uncertain' as const : 'ready' as const
  }
  /** Manual read-only diagnosis for a lost ACK. This never clears an ambiguous
   * receipt, retries a mutation, or infers that a missing read means no write. */
  async function verifyPending(engine: QuotationEngineResult): Promise<{
    readonly state: 'confirmed' | 'not_found' | 'blocked' | 'unknown'
    readonly message: string
  }> {
    if (!authorized()) return { state: 'blocked', message: '账号或角色已变化，不能跨角色回查。' }
    const ctx = input(engine)
    if (!ctx || await readStatus(engine) !== 'uncertain') {
      return { state: 'blocked', message: '当前没有可独立核对的待确认订单回执。' }
    }
    const read = await readApi.getQuotationOrderById(mockJourneyOfficialOrderId)
    if (!authorized()) return { state: 'blocked', message: '回查过程中身份已变化。' }
    if (read.state !== 'succeeded' || !read.data) {
      return { state: 'not_found', message: '暂未确认订单记录；无法证明请求未执行，防重复提交保护仍然有效。' }
    }
    const order = read.data
    if (order.id !== mockJourneyOfficialOrderId || order.type !== 1
      || order.serviceAppointmentId !== mockJourneyWorkOrderId
      || order.workflowId !== mockJourneyOrderWorkflowRunId
      || order.totalPrice !== ctx.payload.totalPrice
      || order.originPrice !== ctx.payload.originPrice) {
      return { state: 'unknown', message: '回查订单与本次报价不一致；已保留防重复提交保护。' }
    }
    return { state: 'confirmed', message: '只读回查已确认本机 Mock 订单及金额；待确认回执仍保留，不会再次创建订单。' }
  }
  return { submit, readStatus, verifyPending }
}
