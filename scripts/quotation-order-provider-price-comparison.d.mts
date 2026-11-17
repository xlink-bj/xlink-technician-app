export interface DirectProviderPriceLine {
  readonly kind: 'procedure' | 'measure'
  readonly quantity?: number
  readonly unitPrice?: number
  readonly lineTotal?: number
  readonly contentSupported?: boolean
  readonly identity?: {
    readonly providerRowId?: string
    readonly providerRowIdSource?: 'r1_direct_provider_row_id'
    readonly providerReferenceId?: string
  }
}

export interface DirectProviderPriceOrder {
  readonly type: 1
  readonly serviceAppointmentId: string
  readonly groups?: readonly { readonly lines?: readonly (DirectProviderPriceLine | { readonly kind: 'package'; readonly children?: readonly DirectProviderPriceLine[] })[] }[]
}

export function summarizeDirectProviderPriceSnapshots(input: {
  readonly expectedWorkOrderId: string
  readonly orders: readonly DirectProviderPriceOrder[]
  readonly catalogProcedures: readonly { readonly kind: 'procedure'; readonly id: string; readonly guideUnitPrice?: number }[]
  readonly catalogMeasures: readonly { readonly kind: 'measure'; readonly id: string; readonly guideUnitPrice?: number }[]
  readonly procedureCatalogComplete: boolean
  readonly measureCatalogComplete: boolean
  readonly orderListTruncated?: boolean
}): Readonly<Record<string, unknown>>
