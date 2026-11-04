export interface R1SalesFieldIdentity {
  readonly name: string
  readonly valueOption: string
}

export interface R1SalesFieldDefinitions {
  readonly complete: true
  readonly fields: readonly R1SalesFieldIdentity[]
  readonly valueOptionIds: readonly string[]
}

export interface R1IncompleteEvidence {
  readonly complete: false
  readonly reason: string
}

export function firstOrderMaterialSkuIdentity(orders: readonly unknown[]): Readonly<{
  orderId: string
  skuId: string
  spuId: string
  unitPrice?: number
}> | undefined
export function firstOrderMaterialSpuIdentity(orders: readonly unknown[]): Readonly<{
  orderId: string
  spuId: string
  skuId?: string
  skuCode?: string
  unitPrice?: number
}> | undefined
export function orderMaterialSpuIdentities(orders: readonly unknown[]): readonly Readonly<{
  orderId: string
  spuId: string
  skuId?: string
  skuCode?: string
  unitPrice?: number
}>[]
export function summarizeOrderMaterialIdentities(orders: readonly unknown[]): Readonly<{
  readonly verified: true
  readonly typeOneOrderRowsReturned: number
  readonly orderRowsWithMaterialLines: number
  readonly materialLines: number
  readonly materialLinesWithSkuId: number
  readonly materialLinesWithSpuId: number
  readonly materialLinesWithBothSkuAndSpuId: number
  readonly materialLinesWithSkuIdOnly: number
  readonly materialLinesWithSpuIdOnly: number
  readonly materialLinesWithNeitherSkuNorSpuId: number
  readonly materialLinesWithSkuCode: number
  readonly materialLinesWithSpuCode: number
}> | Readonly<{ readonly verified: false; readonly reason: string }>
export function rowsFromEnvelope(raw: unknown): readonly unknown[] | null
export function totalFromEnvelope(raw: unknown): number | undefined
export function parseSalesFieldDefinitions(raw: unknown, pageLimit?: number): R1SalesFieldDefinitions | R1IncompleteEvidence
export function parseCodeDictionaries(
  raw: unknown,
  fields: readonly R1SalesFieldIdentity[],
): { readonly complete: true; readonly dictionaries: ReadonlyMap<string, ReadonlyMap<string, boolean>> }
  | R1IncompleteEvidence
export function summarizeSkuRead(
  raw: unknown,
  fields: readonly R1SalesFieldIdentity[],
  dictionaries: ReadonlyMap<string, ReadonlyMap<string, boolean>>,
  selectedIdentity: Readonly<{ skuId?: string; spuId: string; unitPrice?: number }>,
  pageLimit?: number,
): Readonly<Record<string, unknown>>
