import { isDevMockJourneyEnabled, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'

/**
 * R1 source anchors: Order.type=1, Order.serviceAppointmentId, Contract.orderId,
 * Contract.serviceAppointmentId. All values here are SYNTHETIC and owned only
 * by the DEV Mock review surface, NOT by the order-read or signing API ports.
 * Real contract status enums, signer roles and document authorization remain
 * unknown; do not export any command or fake server-side status transitions.
 */
export const signingMockReviewRoute = '/pages/work-orders/signing-mock-review' as const
export type SigningMockScenario = 'normal' | 'no_orders' | 'read_error' | 'signed' | 'failed' | 'expired'

export interface SigningMockOrder {
  readonly id: string
  readonly type: 1
  readonly workOrderId: string
  readonly title: string
  readonly parts: readonly string[]
}

export interface SigningMockContract {
  readonly id: string
  readonly orderId: string
  readonly workOrderId: string
  readonly displayNumber: string
  /** DISPLAY CONCEPT, NOT a real Contract.exts.contractStatus mapping. */
  readonly demoState: 'pending' | 'signed' | 'failed' | 'expired'
}

export type SigningMockRead =
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'no_orders' }
  | { readonly kind: 'read_error' }
  | { readonly kind: 'ready'; readonly orders: readonly SigningMockOrder[];
      readonly selectedOrder: SigningMockOrder; readonly contract: SigningMockContract | null }

export interface SigningMockReadInput {
  readonly workOrderId: string
  readonly userId?: string
  readonly roleId?: string
  readonly orderId: string
  readonly scenario: SigningMockScenario
  /** Explicit injection is for unit tests only; callers must use the guarded default. */
  readonly devMockEnabled?: boolean
}

const workOrderId = mockJourneyWorkOrderId
const orders: readonly SigningMockOrder[] = [
  {
    id: 'mock-official-order-019-a', type: 1, workOrderId,
    title: '模拟正式订单 A', parts: ['屋面', '外墙'],
  },
  {
    id: 'mock-official-order-019-b', type: 1, workOrderId,
    title: '模拟正式订单 B', parts: ['卫生间'],
  },
]
const pendingContract: SigningMockContract = {
  id: 'mock-contract-019-b', orderId: orders[1].id, workOrderId,
  displayNumber: 'MOCK-CONTRACT-019-B', demoState: 'pending',
}
const scenarios: readonly SigningMockScenario[] = [
  'normal', 'no_orders', 'read_error', 'signed', 'failed', 'expired',
]

export function signingMockReviewUrl(): string {
  return signingMockReviewRoute + '?id=' + encodeURIComponent(mockJourneyWorkOrderId)
}

export function isSigningMockReviewAvailable(): boolean {
  return isDevMockJourneyEnabled()
}

/**
 * No network, persistence, user-generated Contract or Workflow mutation.
 * Intentionally separate from the current local quotation draft: a local quote
 * cannot be promoted to an official Order by this demo.
 */
export function readSigningMock(input: SigningMockReadInput): SigningMockRead {
  const enabled = input.devMockEnabled === undefined ? isDevMockJourneyEnabled() : input.devMockEnabled
  if (!enabled || input.workOrderId !== workOrderId
    || input.userId !== 'synthetic-user' || input.roleId !== 'synthetic-role') {
    return { kind: 'blocked', reason: '签约演示仅向已授权的本地 Mock 账号开放。' }
  }
  if (!scenarios.includes(input.scenario)) {
    return { kind: 'blocked', reason: '未知的签约演示场景。' }
  }
  if (input.scenario === 'read_error') return { kind: 'read_error' }
  if (input.scenario === 'no_orders') return { kind: 'no_orders' }

  const order = orders.find((item) => item.id === input.orderId && item.workOrderId === input.workOrderId)
  if (!order) return { kind: 'blocked', reason: '订单身份与当前工单不匹配。' }
  // The second synthetic official order alone owns an example contract.
  // No contract may be fabricated for the first order's local read state.
  const contract = order.id === pendingContract.orderId
    ? {
        ...pendingContract,
        demoState: input.scenario === 'normal' ? 'pending' : input.scenario,
      } as SigningMockContract
    : null
  return { kind: 'ready', orders, selectedOrder: order, contract }
}

export const signingMockOrderIds = orders.map((order) => order.id) as readonly string[]
export const signingMockScenarios: readonly { readonly value: SigningMockScenario; readonly label: string }[] = [
  { value: 'normal', label: '订单与合同' },
  { value: 'no_orders', label: '无正式订单' },
  { value: 'read_error', label: '读取失败' },
  { value: 'signed', label: '模拟已签署' },
  { value: 'failed', label: '模拟失败' },
  { value: 'expired', label: '模拟过期' },
]

export function signingMockStateLabel(state: SigningMockContract['demoState']): string {
  switch (state) {
    case 'pending': return '签署中 · 合成概念'
    case 'signed': return '已签署 · 合成概念'
    case 'failed': return '签署失败 · 合成概念'
    case 'expired': return '签署过期 · 合成概念'
  }
}
