import type { QuotationCatalogContext } from '@shared/ports'

/**
 * P1 #75: pure source-identity preflight for a POTENTIAL future SKU read.
 *
 * This never authorizes a backend read, constructs a network request, or
 * supplies a real SKU provider. The server must independently bind the
 * authenticated principal, WorkOrder, service/source type and allowed SPUs.
 */
export interface SkuReadPrincipalSnapshot {
  readonly sessionRef: string
  readonly userId: string
  readonly roleId: string
  readonly roleVersion: string
  readonly tenantId: string
  readonly workOrderId: string
}

export interface SkuSourceIdentityPreflightInput {
  readonly principal: SkuReadPrincipalSnapshot | null
  /** Derived from CURRENT WorkOrder's ServiceAppointment, not caller input. */
  readonly catalogContext: QuotationCatalogContext | null
  /** IDs extracted from a complete current catalog response; still not an ACL. */
  readonly listedMaterialSpuIds: readonly string[]
  /** SPU IDs obtained from the actual selected Material / Package body link. */
  readonly selectedMaterialSpuIds: readonly string[]
  /** A paginated or partially loaded catalog never proves the full source. */
  readonly catalogListingComplete: boolean
}

export type SkuSourceIdentityBlock =
  | 'principal_missing'
  | 'work_order_context_missing'
  | 'source_type_missing'
  | 'work_order_mismatch'
  | 'catalog_incomplete'
  | 'catalog_ids_invalid'
  | 'selected_ids_invalid'
  | 'selected_spu_not_in_catalog'

export type SkuSourceIdentityPreflight =
  | { readonly state: 'blocked'; readonly reason: SkuSourceIdentityBlock; readonly liveReadAuthorized: false }
  | {
      readonly state: 'source_identity_only'
      readonly workOrderId: string
      readonly serviceType: string
      readonly sourceType: string
      readonly selectedMaterialSpuIds: readonly string[]
      /** Always false even if every source ID matches. */
      readonly liveReadAuthorized: false
      readonly backendAuthorization: 'unverified'
      readonly salesAttributes: 'unverified'
      readonly tenantCodeOptions: 'unverified'
      readonly paginationAndSkuScope: 'unverified'
    }

const textId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim()

const blocked = (reason: SkuSourceIdentityBlock): SkuSourceIdentityPreflight =>
  ({ state: 'blocked', reason, liveReadAuthorized: false })

function idsValid(ids: readonly string[], max: number): boolean {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= max
    && ids.every(textId) && new Set(ids).size === ids.length
}

/** Source identity is necessary, never sufficient, for real SKU access. */
export function preflightSkuSourceIdentity(
  input: SkuSourceIdentityPreflightInput,
): SkuSourceIdentityPreflight {
  const p = input.principal
  if (!p || ![
    p.sessionRef, p.userId, p.roleId, p.roleVersion, p.tenantId, p.workOrderId,
  ].every(textId)) return blocked('principal_missing')

  const ctx = input.catalogContext
  if (!ctx || !textId(ctx.workOrderId) || !textId(ctx.serviceType)) {
    return blocked('work_order_context_missing')
  }
  // An omitted sourceType is *not* equivalent to a verified backend scope.
  // GoodsServiceImpl.queryWithRank switches org/scope logic on property presence.
  if (!textId(ctx.sourceType)) return blocked('source_type_missing')
  if (ctx.workOrderId !== p.workOrderId) return blocked('work_order_mismatch')
  if (input.catalogListingComplete !== true) return blocked('catalog_incomplete')
  if (!idsValid(input.listedMaterialSpuIds, 200)) return blocked('catalog_ids_invalid')
  if (!idsValid(input.selectedMaterialSpuIds, 10)) return blocked('selected_ids_invalid')
  const listed = new Set(input.listedMaterialSpuIds)
  if (!input.selectedMaterialSpuIds.every(id => listed.has(id))) {
    return blocked('selected_spu_not_in_catalog')
  }
  return {
    state: 'source_identity_only',
    workOrderId: p.workOrderId,
    serviceType: ctx.serviceType,
    sourceType: ctx.sourceType,
    selectedMaterialSpuIds: [...input.selectedMaterialSpuIds],
    liveReadAuthorized: false,
    backendAuthorization: 'unverified',
    salesAttributes: 'unverified',
    tenantCodeOptions: 'unverified',
    paginationAndSkuScope: 'unverified',
  }
}
