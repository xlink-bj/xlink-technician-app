import { makeSameCatalogSkuMock } from '@adapters/api/mock/quotation-sku-same-catalog'
import {
  mockQuotationMaterialListResponse,
  mockQuotationPackageDetailResponse,
} from '@adapters/api/mock/quotation-catalog'
import { syntheticMaterialSalesFields } from '@adapters/api/mock/material-sku'
import type { QuotationDraft } from '@features/work-orders/quotation/model'
import { auditP1QuotationSkuLineage } from '@features/work-orders/quotation/sku-identity-review'
import {
  preflightSkuSourceIdentity,
  type SkuSourceIdentityPreflightInput,
} from '@shared/sku-live-read-preflight'
import {
  auditSyntheticSkuSalesOptions,
  type SyntheticSkuOptionFixture,
} from '@shared/sku-synthetic-sale-options'
import { asOpaqueId } from '@shared/types'

/**
 * DEV quote review: catalog identity -> scoped source preflight -> sale field
 * -> tenant code options. This is *not* a live SKU query / approval path.
 *
 * The synthetic principal, tenant, SPU sale fields and code responses below
 * are imaginary test fixtures. They never come from a user session or backend.
 */
type Rec = Readonly<Record<string, unknown>>
const rec = (v: unknown): Rec | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Rec : null
const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.trim() === v

export type QuoteSkuReadinessBlock =
  | 'no_selected_materials' | 'catalog_unavailable'
  | 'quote_source_identity_mismatch' | 'catalog_materials_incomplete'
  | 'source_preflight_blocked' | 'sales_option_source_blocked'

export type QuoteSkuReadiness =
  | { readonly state: 'blocked_synthetic'; readonly reason: QuoteSkuReadinessBlock;
      readonly realSkuAuthorized: false; readonly officialOrderAllowed: false }
  | { readonly state: 'synthetic_structure_only'; readonly materialSpuCount: number;
      readonly saleFieldCount: number; readonly saleOptionCount: number;
      readonly realSkuAuthorized: false; readonly officialOrderAllowed: false;
      readonly tenantAuthorization: 'unverified'; readonly workOrderAuthorization: 'unverified' }

const deny = (reason: QuoteSkuReadinessBlock): QuoteSkuReadiness => ({
  state: 'blocked_synthetic', reason, realSkuAuthorized: false,
  officialOrderAllowed: false,
})

export interface QuoteSkuReadinessFaults {
  /** Only explicit test-driven faults. Never use this as business admission. */
  readonly catalogSource?: Parameters<typeof makeSameCatalogSkuMock>[0]
  readonly principal?: SkuSourceIdentityPreflightInput['principal']
  readonly codeTenantId?: string
  readonly codeResults?: readonly unknown[]
  readonly saleFieldRows?: readonly unknown[]
  readonly catalogListingComplete?: boolean
}

/**
 * Pure; does not load real account, customer, order or networking.
 * The function is guarded by DEV in both itself AND its UI caller.
 */
export function reviewP1SyntheticSkuReadiness(
  draft: QuotationDraft,
  faults: QuoteSkuReadinessFaults = {},
): QuoteSkuReadiness | null {
  if (!import.meta.env.DEV) return null

  const catalog = makeSameCatalogSkuMock(faults.catalogSource)
  if (catalog.state !== 'ready_synthetic_only') return deny('catalog_unavailable')
  const lineage = auditP1QuotationSkuLineage(draft, {
    direct: catalog.direct, packages: catalog.packages,
  }, 'same_quote_catalog_synthetic_overlay')

  // Identity audit must be complete for the EXACT draft, not a product-name
  // or layer-number coincidence. Unconfigured package cannot pass.
  if (!lineage.total) return deny('no_selected_materials')
  if (lineage.correlatedForDemo !== lineage.total) {
    return deny('quote_source_identity_mismatch')
  }

  const ids = new Set<string>()
  for (const group of draft.groups) {
    for (const material of group.materials) ids.add(material.catalogId)
    for (const pkg of group.projPackages) {
      for (const material of pkg.configuration?.materials ?? []) ids.add(material.catalogId)
    }
  }
  if (!ids.size) return deny('no_selected_materials')

  const materialList = rec(faults.catalogSource?.materialList ?? mockQuotationMaterialListResponse)
  const packageDetail = rec(faults.catalogSource?.packageDetail ?? mockQuotationPackageDetailResponse)
  const entity = rec(packageDetail?.entity)
  const direct = materialList?.data
  const packageMaterials = entity?.materialList
  if (!Array.isArray(direct) || !Array.isArray(packageMaterials)) {
    return deny('catalog_materials_incomplete')
  }
  const listed = [
    ...direct.map(row => rec(row)?._id),
    ...packageMaterials.map(row => rec(row)?.materialId),
  ]
  if (!listed.every(validId)) return deny('catalog_materials_incomplete')
  const allListedIds = [...new Set(listed)]
  const selected = [...ids]

  // A synthetic principal is deliberate: this shows structural checks
  // without using or pretending to verify the authenticated technician.
  const tenantId = 'dev-mock-tenant'
  const principal = faults.principal === undefined ? {
    sessionRef: 'dev-mock-session', userId: 'dev-mock-technician',
    roleId: 'dev-mock-role', roleVersion: '1', tenantId,
    workOrderId: draft.workOrderId,
  } : faults.principal
  const source: SkuSourceIdentityPreflightInput = {
    principal,
    catalogContext: {
      workOrderId: asOpaqueId<'WorkOrderId'>(draft.workOrderId),
      serviceType: 'mock-service-waterproof',
      sourceType: 'mock-source-standard',
    },
    listedMaterialSpuIds: allListedIds,
    selectedMaterialSpuIds: selected,
    catalogListingComplete: faults.catalogListingComplete ?? true,
  }
  const preflight = preflightSkuSourceIdentity(source)
  if (preflight.state !== 'source_identity_only') return deny('source_preflight_blocked')

  // The original Quote Catalog does not contain these tenant, attribute or
  // code option records. They are explicit hypothetical TEST overlays.
  const defaults = [
    { eleid: 'synthetic-thickness', options: { '2': '2 mm' } },
    { eleid: 'synthetic-color', options: { grey: '灰色' } },
  ]
  const fields = faults.saleFieldRows ?? syntheticMaterialSalesFields.map(field => ({
    ...field, tenantId,
  }))
  let saleFieldCount = 0
  let saleOptionCount = 0
  for (const spuId of selected) {
    const fixture: SyntheticSkuOptionFixture = {
      provenance: 'synthetic_fixture',
      codeTenantId: faults.codeTenantId ?? tenantId,
      complete: true,
      spu: {
        _id: spuId, state: 1, tenantId,
        exts: { thickness: ['2'], color: ['grey'] },
      },
      extFields: fields,
      codeResults: faults.codeResults ?? defaults,
    }
    const check = auditSyntheticSkuSalesOptions(source, fixture)
    if (check.state !== 'synthetic_structure_only' || !check.fields.length) {
      return deny('sales_option_source_blocked')
    }
    saleFieldCount += check.fields.length
    saleOptionCount += check.fields.reduce((n, f) => n + f.options.length, 0)
  }
  return {
    state: 'synthetic_structure_only',
    materialSpuCount: selected.length, saleFieldCount, saleOptionCount,
    realSkuAuthorized: false, officialOrderAllowed: false,
    tenantAuthorization: 'unverified', workOrderAuthorization: 'unverified',
  }
}
