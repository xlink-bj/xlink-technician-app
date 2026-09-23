import type { OperationSnapshot } from '@shared/types'

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

/** Quotation-owned authoritative readback boundary, separate from technician/work-order reads. */
export interface QuotationOrderReadPort {
  getQuotationOrderById(id: string): Promise<OperationSnapshot<QuotationOrderRead>>
}
