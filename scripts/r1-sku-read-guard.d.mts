export interface R1SkuReadGuardRequest {
  readonly path: string
  readonly method: string
  readonly search: URLSearchParams
  readonly body: unknown
  readonly requestCount: number
}

export function r1MaterialSalesFieldsRequestBody(): Readonly<Record<string, string | number>>
export function r1MaterialSkuRequestBody(spuId: string): Readonly<Record<string, string | number>>
export function r1MaterialCodeOptionsRequestBody(valueOptionIds: readonly string[]): Readonly<Record<string, string>>
export function isAllowedR1MaterialSalesFieldsRequest(request: R1SkuReadGuardRequest): boolean
export function isAllowedR1MaterialCodeOptionsRequest(request: R1SkuReadGuardRequest & {
  readonly expectedValueOptionIds: readonly string[] | null
}): boolean
export function isAllowedR1SingleSpuMaterialSkuRequest(request: R1SkuReadGuardRequest & {
  readonly selectedSpuId: string | null
}): boolean
export const r1SkuReadAuditBounds: Readonly<{
  materialSalesRows: number
  materialSkuRows: number
}>
