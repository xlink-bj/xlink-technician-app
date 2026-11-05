export interface PackagePriceLine {
  readonly kind: 'package' | string
  readonly quantity?: number
  readonly unitPrice?: number
  readonly lineTotal?: number
  readonly r1PackagePriceSnapshot?: { readonly unitAmount?: number; readonly totalAmount?: number }
  readonly packagePricingMethod?: string
  readonly packageSkuCompositionUnsupported?: boolean
  readonly identity?: { readonly providerRowId?: string }
  readonly children?: readonly {
    readonly kind: 'material' | string
    readonly packageMaterialLayer?: string | number
    readonly packageComponentMarkup?: number
    readonly identity?: {
      readonly providerRowId?: string
      readonly providerReferenceId?: string
      readonly spuId?: string
      readonly spuIdSource?: string
    }
  }[]
}

export interface PackagePriceOrder {
  readonly type: number
  readonly serviceAppointmentId: string
  readonly groups: readonly { readonly lines: readonly PackagePriceLine[] }[]
}

export function summarizePackagePriceSnapshots(input: {
  readonly expectedWorkOrderId: string
  readonly orders: readonly PackagePriceOrder[]
  readonly catalogPackages: readonly {
    readonly id: string
    readonly kind: string
    readonly price?: number
    readonly minimumPrice?: number
    readonly pricingMethod?: string
  }[]
  readonly packageDetails: readonly {
    readonly package: { readonly id: string }
    readonly materials: readonly {
      readonly id?: string
      readonly referenceId?: string
      readonly layer?: string | number
      readonly price?: number
    }[]
  }[]
  readonly packageCatalogComplete: boolean
  readonly packageDetailsComplete: boolean
  readonly orderListTruncated?: boolean
}): Readonly<{
  state: string
  orders: number
  packageLines: number
  catalogPackageMatches: number
  detailMatches: number
  comparableLines: number
  equalToCurrent: number
  differentFromCurrent: number
  unknownLines: number
  skuPackageLines: number
  ambiguousIdentityLines: number
  componentSnapshotDifferences: number
  identityConflicts: number
  orderListTruncated: boolean
}>
