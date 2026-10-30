/**
 * DEV-only quotation review capability. The feature owns the presentation
 * contract; a QA page provides the actual synthetic journey implementation.
 * No real Order, Workflow, Quotation or network write belongs to this port.
 */
export interface MockCommercialReviewScope {
  readonly workOrderId: string
  readonly userId?: string
  readonly roleId?: string
}

export type MockCommercialReviewCheckpoint =
  | 'quotation_preview'
  | 'sku_review'
  | 'order_contract_review'

export interface MockCommercialReviewProgress {
  readonly confirmed: readonly MockCommercialReviewCheckpoint[]
  readonly paused: boolean
  readonly complete: boolean
}

export interface MockCommercialReviewPort {
  readonly canReview: (scope: MockCommercialReviewScope) => boolean
  readonly materialSkuReviewUrl: () => string
  readonly signingMockReviewUrl: () => string
  readonly readProgress: (scope: MockCommercialReviewScope) => MockCommercialReviewProgress
  readonly confirmCheckpoint: (scope: MockCommercialReviewScope, step: MockCommercialReviewCheckpoint) => boolean
  readonly pause: (scope: MockCommercialReviewScope) => boolean
  readonly resume: (scope: MockCommercialReviewScope) => boolean
  readonly revokeLast: (scope: MockCommercialReviewScope) => boolean
}
