import type { OperationSnapshot } from '@shared/types'
import type { ReadPage } from './api'

export type QuotationOrderBrowseKind = 'package' | 'procedure' | 'material' | 'measure'

export interface QuotationOrderBrowseIdentity {
  readonly providerRowId?: string
  /** Provenance for audit-grade Procedure/Measure provider identity; generic row IDs are insufficient for price comparison. */
  readonly providerRowIdSource?: 'r1_direct_provider_row_id'
  readonly providerReferenceId?: string
  readonly spuId?: string
  /** Provenance for audit-grade SPU association. Generic row-ID fallback is insufficient for price comparison. */
  readonly spuIdSource?: 'order_line_spu' | 'embedded_product_spu' | 'embedded_material_id' | 'material_reference' | 'r1_direct_material_row_id' | 'row_id_fallback'
  readonly skuId?: string
  readonly spuCode?: string
  readonly skuCode?: string
}

export interface QuotationOrderBrowseLine {
  readonly kind: QuotationOrderBrowseKind
  readonly label: string
  readonly quantity?: number
  readonly unit?: string
  /** R1 persisted Order `amount`; never fall back to the current catalog `price`. */
  readonly unitPrice?: number
  /** R1 persisted Order `totalAmount`; never inferred from catalog price × quantity. */
  readonly lineTotal?: number
  readonly identity: QuotationOrderBrowseIdentity
  readonly children: readonly QuotationOrderBrowseLine[]
  /** Ephemeral, sanitized R1 fields used only to verify Package price lineage. */
  readonly r1PackagePriceSnapshot?: {
    readonly unitAmount: number
    readonly totalAmount: number
  }
  readonly packagePricingMethod?: string
  readonly packageSkuCompositionUnsupported?: boolean
  readonly packageMaterialLayer?: string | number
  readonly packageComponentMarkup?: number
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
  /** Optional R1 Order.contractId; when present it narrows Contract status to the exact record. */
  readonly contractId?: string
  readonly displayNumber?: string
  readonly state?: number
  readonly processState?: number
  /** Sanitized R1 initial-sign guard; missing fields are NOT assumed false. */
  readonly hasExts?: boolean
  readonly isAgain?: number
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
  /** Explicit, role-scoped R1 Contract status metadata read; never grants document or signing access. */
  listR1ContractsForSigningReview?(
    workOrderId: string, orderId: string,
  ): Promise<OperationSnapshot<R1ScopedContractRead>>
}


/** Sanitized active R1 Contract metadata only. No PDF URL, phone, signer, QR or commands. */
export interface R1ScopedContractSummary {
  readonly id: string
  readonly orderId: string
  readonly serviceAppointmentId: string
  readonly displayNumber?: string
  readonly contractStatus?: string
  readonly state?: number
  readonly signedDate?: string
}
/** A bounded R1 query cannot prove that all Contract records exist in its first page. */
export interface R1ScopedContractRead {
  readonly items: readonly R1ScopedContractSummary[]
  readonly completeness: 'bounded_unverified'
}
