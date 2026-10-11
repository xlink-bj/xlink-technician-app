import type { OperationSnapshot } from '@shared/types'
import type { ReadPage } from './api'

export type QuotationOrderBrowseKind = 'package' | 'procedure' | 'material' | 'measure'

export interface QuotationOrderBrowseIdentity {
  readonly providerRowId?: string
  readonly providerReferenceId?: string
  readonly spuId?: string
  readonly skuId?: string
  readonly spuCode?: string
  readonly skuCode?: string
}

export interface QuotationOrderBrowseLine {
  readonly kind: QuotationOrderBrowseKind
  readonly label: string
  readonly quantity?: number
  readonly unit?: string
  readonly amount?: number
  readonly identity: QuotationOrderBrowseIdentity
  readonly children: readonly QuotationOrderBrowseLine[]
  readonly contentSupported: boolean
}

export interface QuotationOrderBrowseGroup {
  readonly repairParts: readonly string[]
  readonly partDescription?: string
  readonly maintainAreaNum?: string
  readonly totalAmount?: number
  readonly lines: readonly QuotationOrderBrowseLine[]
  readonly contentSupported: boolean
}

/** Ephemeral display projection from an authenticated Work Order-scoped Order read; never persisted or editable. */
export interface QuotationOrderBrowseItem {
  readonly id: string
  readonly type: 1
  readonly serviceAppointmentId: string
  readonly displayNumber?: string
  readonly state?: number
  readonly processState?: number
  readonly updateTime?: string
  readonly originPrice?: number
  readonly totalPrice?: number
  readonly groups: readonly QuotationOrderBrowseGroup[]
  readonly contentSupported: boolean
  readonly pdfState: 'absent' | 'present_no_access'
}

/** Minimal authoritative Order read model used by quotation submit/readback/edit. */
export interface QuotationOrderRead {
  readonly id: string
  readonly type: number
  readonly serviceAppointmentId: string
  readonly state?: number
  readonly processState?: number
  readonly workflowId?: string
  readonly ownerName?: string
  readonly description?: string
  readonly originPrice?: number
  readonly totalPrice?: number
  readonly preferentialAmount?: number
  readonly discount?: number
  readonly coupons?: string
  readonly qiniuList?: readonly string[]
  readonly bjProducts: Readonly<Record<string, unknown>>
  /** Explicitly projected Order fields used for guarded replace-snapshot updates only. */
  readonly replaceSnapshot: Readonly<Record<string, unknown>>
  readonly updateTime?: string
}

/**
 * Ephemeral Signing **review** only: exposes an accepted type=1 Order display
 * projection, never raw order, Contract contents, PDF URL, signer entitlement
 * or a permission to send/sign. This is not a Signing action contract.
 */
export interface ScopedSigningOrderReviewRead {
  readonly order: QuotationOrderBrowseItem
  readonly contractReadAuthorized: false
  readonly signingAuthorized: false
}

/** Quotation-owned authoritative readback boundary, separate from technician/work-order reads. */
export interface QuotationOrderReadPort {
  getQuotationOrderById(id: string): Promise<OperationSnapshot<QuotationOrderRead>>
  listTypeOneOrdersForWorkOrder(
    workOrderId: string,
    pageSize?: 1 | 3,
  ): Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>
  /** Explicit WorkOrder/Order scoped read for a future separately gated Signing review.
   * Optional: existing Quotation readback providers never imply safe Signing reads.
   */
  readScopedTypeOneOrderForSigningReview?(
    workOrderId: string, orderId: string,
  ): Promise<OperationSnapshot<ScopedSigningOrderReviewRead>>
}
