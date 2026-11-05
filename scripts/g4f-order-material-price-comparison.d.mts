export interface DirectMaterialPriceLine {
  readonly kind: 'material' | string
  readonly label?: string
  readonly contentSupported?: boolean
  readonly unitPrice?: number
  readonly identity?: {
    readonly spuId?: string
    readonly spuIdSource?: 'order_line_spu' | 'embedded_product_spu' | 'embedded_material_id' | 'material_reference' | 'row_id_fallback'
    readonly skuId?: string
    readonly skuCode?: string
  }
  readonly children?: readonly DirectMaterialPriceLine[]
}

export interface DirectMaterialPriceOrder {
  readonly id?: string
  readonly type: number
  readonly serviceAppointmentId: string
  readonly groups: readonly { readonly lines: readonly DirectMaterialPriceLine[] }[]
}

export function summarizeDirectMaterialPriceSnapshots(input: {
  readonly expectedWorkOrderId: string
  readonly orders: readonly DirectMaterialPriceOrder[]
  readonly catalogMaterials: readonly { readonly id: string; readonly kind: string; readonly price?: number }[]
  readonly activeSkuRows: readonly { readonly id?: string; readonly spuId: string }[]
  readonly orderListTruncated?: boolean
}): Readonly<{
  state: string
  orders: number
  directMaterialLines: number
  catalogSpuMatches: number
  comparableLines: number
  equalToCurrent: number
  differentFromCurrent: number
  unknownLines: number
  skuOrAmbiguousIdentity: number
  currentSkuVariantAmbiguity: number
  duplicateCatalogIdentities: number
  rowIdFallbackCatalogIdMatches: number
  spuIdentitySources: Readonly<{
    orderLine: number
    embeddedProduct: number
    embeddedMaterial: number
    materialReference: number
    rowIdFallback: number
    missing: number
    other: number
  }>
  identityConflicts: number
  orderListTruncated: boolean
}>
