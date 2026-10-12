import type {
  QuotationOrderReadPort,
  ScopedSigningOrderReviewRead,
  SessionSnapshot,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { createOperationError } from '@shared/types'

/**
 * I6 PREPARATORY: the ONLY input to a future Signing preview is a currently
 * listed, authoritative type-1 Order. This is a read-only, ephemeral workspace;
 * it creates no Contract, PDF, QR code, SMS or signing entitlement.
 */
type SigningReviewState = 'idle' | 'loading' | 'ready' | 'failed_retryable' | 'failed_terminal'

export interface SigningReviewSnapshot {
  readonly state: SigningReviewState
  readonly workOrderId?: string
  readonly orderId?: string
  readonly review?: ScopedSigningOrderReviewRead
}

export interface SigningReviewReadWorkspace {
  readonly snapshot: () => SigningReviewSnapshot
  readonly clear: () => void
  readonly load: (workOrderId: string, orderId: string) => Promise<OperationSnapshot<ScopedSigningOrderReviewRead>>
}

type RuntimeScope = {
  readonly port: QuotationOrderReadPort
  readonly getSession: () => SessionSnapshot | null
  /** Must resolve against the live, current-role visible WorkOrder list. */
  readonly isCurrentWorkOrderListed: (workOrderId: string) => boolean
}

function authKey(session: SessionSnapshot | null): string | null {
  if (!session?.currentRole?.id || !session.roleVersion) return null
  return JSON.stringify([session.sessionRef, session.user.id, session.currentRole.id, session.roleVersion])
}

function validId(value: string): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
}

function denied(message: string, retryable = false): OperationSnapshot<ScopedSigningOrderReviewRead> {
  return {
    state: retryable ? 'failed_retryable' : 'failed_terminal',
    error: createOperationError(retryable ? 'network_retryable' : 'authorization_denied', message),
  }
}

export function createSigningReviewReadWorkspace(scope: RuntimeScope): SigningReviewReadWorkspace {
  let epoch = 0
  let current: SigningReviewSnapshot = { state: 'idle' }
  const snapshot = () => current
  function clear() {
    epoch += 1
    current = { state: 'idle' }
  }
  function currentScope(epochAtStart: number, key: string, workOrderId: string): boolean {
    try {
      return epoch === epochAtStart && authKey(scope.getSession()) === key
        && scope.isCurrentWorkOrderListed(workOrderId)
    } catch {
      return false
    }
  }
  function staleResult(version: number): OperationSnapshot<ScopedSigningOrderReviewRead> {
    // A new Order selection owns newer state; never clobber it.
    // A revoked role/work-order with no replacement request must not leave
    // the old signing preview stuck at "loading" after its response is dropped.
    if (epoch === version) current = { state: 'failed_terminal' }
    return denied('签约预览权限或页面范围已变化，原读取结果无效。')
  }
  async function load(workOrderId: string, orderId: string): Promise<OperationSnapshot<ScopedSigningOrderReviewRead>> {
    const version = ++epoch
    current = { state: 'idle' }
    let key: string | null = null
    try {
      key = authKey(scope.getSession())
      if (!key || !validId(workOrderId) || !validId(orderId)
        || !scope.isCurrentWorkOrderListed(workOrderId)
        || !scope.port.readScopedTypeOneOrderForSigningReview) {
        current = { state: 'failed_terminal' }
        return denied('签约预览身份或工单授权尚未核验，无法读取。')
      }
      current = { state: 'loading' }
      // The browse API is page-size bounded; absence from the returned page is
      // NOT evidence the Order does not exist, only that we cannot prove scope.
      const listed = await scope.port.listTypeOneOrdersForWorkOrder(workOrderId, 3)
      if (!currentScope(version, key, workOrderId)) return staleResult(version)
      if (listed.state !== 'succeeded' || !listed.data || !Array.isArray(listed.data.items)) {
        current = { state: listed.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal' }
        return denied('无法核验当前工单的正式订单列表。', listed.state === 'failed_retryable')
      }
      const rows = listed.data.items
      const ids = new Set<string>()
      const valid = rows.length <= 3 && rows.every(row => {
        if (!row || row.type !== 1 || row.serviceAppointmentId !== workOrderId
          || !validId(row.id) || ids.has(row.id)) return false
        ids.add(row.id)
        return true
      })
      if (!valid || !ids.has(orderId)) {
        current = { state: 'failed_terminal' }
        return denied('当前已授权列表不能证明目标正式订单归属，已停止签约预览。')
      }
      const read = await scope.port.readScopedTypeOneOrderForSigningReview(workOrderId, orderId)
      if (!currentScope(version, key, workOrderId)) return staleResult(version)
      if (read.state !== 'succeeded' || !read.data) {
        current = { state: read.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal' }
        return denied('正式订单详情暂无法完成签约只读核验。', read.state === 'failed_retryable')
      }
      const review = read.data
      if (review.contractReadAuthorized !== false || review.signingAuthorized !== false
        || review.order.id !== orderId || review.order.serviceAppointmentId !== workOrderId
        || review.order.type !== 1) {
        current = { state: 'failed_terminal' }
        return denied('签约预览的订单身份或权限投影不一致，已停止。')
      }
      // Never attach candidate quote payloads, contract details, PDFs, signer
      // capabilities or the previous selected Order to this state.
      current = { state: 'ready', workOrderId, orderId, review }
      return { state: 'succeeded', data: review }
    } catch {
      if (epoch === version) current = { state: 'failed_retryable' }
      return denied('签约只读服务暂不可用，未执行签署操作。', true)
    }
  }
  return { snapshot, clear, load }
}
