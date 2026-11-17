export interface CatalogContextAuditOptions {
  readonly catalogContextOrdinal: number
  readonly catalogContextOnly: boolean
  readonly activeOrderFieldsOnly: boolean
  readonly compareSelectedOrderMaterialPrices: boolean
  readonly compareSelectedOrderPackagePrices: boolean
  readonly compareSelectedOrderProcedureMeasurePrices: boolean
  readonly discoverDirectMaterialOrder: boolean
  readonly discoverDirectProviderOrder: boolean
  readonly discoverDirectMeasureOrder: boolean
}

export interface CatalogContextSelection {
  readonly eligible: boolean
  readonly distinct: boolean
  readonly ordinal: number | null
  readonly selected: boolean
}

export declare function parseCatalogContextAuditArgs(args?: string[]): CatalogContextAuditOptions

export declare function createPlaceOrderCatalogContextSelector(targetOrdinal?: number): Readonly<{
  consider(context: unknown, expectedWorkOrderId: string): CatalogContextSelection
  readonly distinctCount: number
}>
