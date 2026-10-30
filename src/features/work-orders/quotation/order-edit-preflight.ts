import type { QuotationOrderReadPort } from '@shared/ports'
import type { WorkOrderId, WorkflowNodeRuntimeId } from '@shared/types'
import { reconstructQuotationOrder, quotationOrderEditBlockers } from './order-reconstruction'
import type { QuotationDraft } from './model'

export type QuotationEditPreflightResult =
  | { readonly state: 'ready'; readonly draft: QuotationDraft }
  | { readonly state: 'blocked'; readonly message: string }
  | { readonly state: 'stale' }

/**
 * Read-only preflight for editing an existing official type=1 quotation Order.
 * Never mutates an active draft, authorizes a command, or guesses missing
 * catalog/Order identities. Callers retain Production read-only and role gates.
 */
export async function readQuotationOrderEditCandidate(input: {
  readonly orderId: string
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly orderRead: QuotationOrderReadPort
  /** Captures exact session/role/Work Order generation from the Store. */
  readonly stillCurrent: () => boolean
}): Promise<QuotationEditPreflightResult> {
  if (!input.stillCurrent()) return { state: 'stale' }
  const read = await input.orderRead.getQuotationOrderById(input.orderId)
  if (!input.stillCurrent()) return { state: 'stale' }

  if (read.state !== 'succeeded' || !read.data
    || read.data.id !== input.orderId
    || read.data.type !== 1
    || read.data.serviceAppointmentId !== input.workOrderId) {
    return { state: 'blocked', message: '待编辑订单无法权威读取或不属于当前工单。' }
  }
  const blockers = quotationOrderEditBlockers(read.data)
  if (blockers.length > 0) {
    return { state: 'blocked', message: blockers[0] }
  }
  const reconstructed = reconstructQuotationOrder(read.data, String(input.workflowNodeId))
  if (reconstructed.state !== 'ready') {
    return { state: 'blocked', message: reconstructed.reason }
  }
  return { state: 'ready', draft: reconstructed.draft }
}
