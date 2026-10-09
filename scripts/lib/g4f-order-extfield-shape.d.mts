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
export function isAllowedOrderExtFieldTarget(value: unknown): boolean
