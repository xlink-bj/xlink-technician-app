export const ORDER_EXTFIELD_ROUTE: 'biz/extField/query'
export const ORDER_EXTFIELD_PAGE_LIMIT: 50
export const ORDER_EXTFIELD_TENANT_SENTINEL: '__current_account_tenant__'

export interface SanitizedOrderExtField {
  readonly row: string
  readonly valueKeyAlias: string
  readonly labelConfigured: boolean
  readonly type: string
  readonly enabled: boolean | null
  readonly showList: readonly number[]
  readonly showListShape: 'VALID_ARRAY' | 'UNKNOWN'
  readonly required: boolean | null
  readonly multiple: boolean | null
  readonly operationType: string
  readonly visibility: string
  readonly stage: string
  readonly applicability: {
    readonly serviceTypeRestricted: boolean
    readonly serviceTypeRuleCount: number
    readonly personTypeRestricted: boolean
  }
  readonly condition: {
    readonly present: boolean
    readonly dependsOn: string | null
    readonly comparisonValue: 'REDACTED' | null
  }
  readonly dispensableRule: {
    readonly present: boolean
    readonly dependsOn: string | null
    readonly comparisonValue: 'REDACTED' | null
  }
  readonly provider: {
    readonly kind: string
    readonly configured: boolean
    readonly readiness: string
  }
  readonly runtimeCapability: 'PRESENTATION_ONLY' | 'SUPPORTED_GENERIC' | 'UNSUPPORTED'
}

export function buildOrderExtFieldRequestBody(): Readonly<Record<string, string>>
export function parseOrderExtFieldPage(payload: unknown):
  | { readonly ok: true; readonly rows: readonly Readonly<Record<string, unknown>>[]; readonly total: number }
  | { readonly ok: false; readonly reason: string }
export function sanitizeOrderExtFieldPage(payload: unknown):
  | {
      readonly ok: true
      readonly total: number
      readonly returned: number
      readonly truncated: boolean
      readonly pageLimit: 50
      readonly fields: readonly SanitizedOrderExtField[]
    }
  | { readonly ok: false; readonly reason: string }
export function summarizeEffectiveOrderExtFieldPage(
  payload: unknown,
  context: { readonly serviceType: string; readonly personType?: string | number },
):
  | {
      readonly ok: true
      readonly total: number
      readonly returned: number
      readonly truncated: boolean
      readonly pageLimit: 50
      readonly r1Projection: string
      readonly context: {
        readonly serviceTypePresent: true
        readonly submitOrderPersonTypeSource: 'R1_DEFAULT_0' | 'EXPLICIT_CONTEXT'
      }
      readonly effective: {
        readonly placeOrder: Readonly<Record<string, unknown>>
        readonly submitOrder: Readonly<Record<string, unknown>>
        readonly blockedServiceRules: number
        readonly blockedPersonRules: number
        readonly unknownStageRows: number
      }
      readonly providers: 'OMITTED_FROM_FIELD_SUMMARY'
    }
  | { readonly ok: false; readonly reason: string }
export function effectiveOrderExtFieldProviderPlan(
  payload: unknown,
  context: { readonly serviceType: string; readonly personType?: string | number },
):
  | { readonly ok: true; readonly codeIds: readonly string[]; readonly cascadeIds: readonly string[] }
  | { readonly ok: false; readonly reason: string }
export function sanitizeOrderCodeProviderResponse(payload: unknown, expectedIds: readonly string[]):
  | { readonly ok: true; readonly providers: number; readonly missingProviders?: number; readonly options: number; readonly emptyProviders: number }
  | { readonly ok: false; readonly reason: string }
export function sanitizeOrderCascadeProviderResponse(payload: unknown, expectedTypes: readonly string[]):
  | { readonly ok: true; readonly providers: number; readonly missingProviders?: number; readonly nodes: number; readonly leaves: number; readonly maxDepth: number; readonly terminalNodesWithEmptyChildren: number }
  | { readonly ok: false; readonly reason: string }
export function isAllowedEffectiveOrderExtFieldRequest(input: {
  readonly path: string
  readonly method: string
  readonly search?: string
  readonly body: URLSearchParams | string | Readonly<Record<string, string | number | boolean>>
  readonly currentWorkOrder: boolean
}): boolean
export function isAllowedEffectiveOrderCodeProviderRequest(input: {
  readonly path: string
  readonly method: string
  readonly search?: string
  readonly body: URLSearchParams | string | Readonly<Record<string, string | number | boolean>>
  readonly currentWorkOrder: boolean
  readonly expectedIds: readonly string[]
}): boolean
export function isAllowedEffectiveOrderCascadeProviderRequest(input: {
  readonly path: string
  readonly method: string
  readonly search?: string
  readonly body: URLSearchParams | string | Readonly<Record<string, string | number | boolean>>
  readonly currentWorkOrder: boolean
  readonly expectedTypes: readonly string[]
  readonly tenantId: string
}): boolean
export function isAllowedOrderExtFieldTarget(value: unknown): boolean
export function r1ServiceTypeApplies(config: Readonly<Record<string, unknown>>, serviceType: string): { state: string }
export function r1PersonTypeApplies(config: Readonly<Record<string, unknown>>, personType: string): { state: string }
export function providerRows(payload: unknown): readonly Record<string, unknown>[] | null
