import type { QuotationOrderBrowseItem } from './ports'

/**
 * Source-verified R1 signing candidate filter, shared by the UI, scoped
 * read workspace and API adapter. `basic/order/query` may return a cancelled
 * state=-1 row that R1's signing list (`clearOrderFieldQuery`) excludes.
 *
 * This only permits a pre-signing READ preview. It does not prove handler,
 * contract-read or signing-command authorization.
 */
export function isSigningReadOrderCandidate(
  order: Pick<QuotationOrderBrowseItem, 'type' | 'state'> | null | undefined,
): boolean {
  return order?.type === 1 && (order.state === 0 || order.state === 1)
}

/** Business-facing fallback, never a guess about Contract existence. */
export function unavailableSigningReadReason(state: number | undefined): string {
  return state === -1
    ? '订单已取消，无法进入签约进度核验'
    : '订单状态待核验，暂无法查看签约进度'
}
