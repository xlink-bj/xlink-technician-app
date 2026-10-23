import type { SessionSnapshot } from '@shared/ports'
import { mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import {
  syntheticMaterialSalesFields, syntheticMaterialSkuRows, syntheticMaterialSpu,
} from '@adapters/api/mock/material-sku'
import {
  syntheticPackageId, syntheticPackageMaterialLinks, syntheticPackageSalesFields,
  syntheticPackageSkuRows,
} from '@adapters/api/mock/package-material-sku'
import {
  createSkuSyntheticReadGate,
  type SkuMockPage, type SkuMockReadFailure, type SkuMockReadScope,
} from '@shared/sku-synthetic-read-gate'
import { projectR1MaterialSku, type MaterialSkuRead } from '@shared/material-sku-contract'
import { projectR1PackageMaterialSku, type PackageMaterialSkuRead } from '@shared/package-material-sku-contract'
import {
  canReadMaterialSkuMock, isMaterialSkuMockAvailable,
  type MaterialSkuReviewScenario, type PackageSkuMockScenario,
} from './material-sku-mock-review'

export type SyntheticReviewAdmission =
  | { readonly status: 'accepted_synthetic' }
  | { readonly status: 'blocked'; readonly reason: SkuMockReadFailure }

export interface SyntheticDirectReviewResult {
  readonly admission: SyntheticReviewAdmission
  readonly read: MaterialSkuRead
}
export interface SyntheticPackageReviewResult {
  readonly admission: SyntheticReviewAdmission
  readonly read: PackageMaterialSkuRead
}

const directDenied: MaterialSkuRead = { state: 'blocked', reason: 'malformed_source' }
const packageDenied: PackageMaterialSkuRead = { state: 'blocked', reason: 'invalid_material_source' }
const skuIds = [syntheticMaterialSpu._id,
  ...syntheticPackageMaterialLinks.map(link => link.materialId)]

/**
 * Only the exact credential-free QA principal may declare synthetic catalog
 * provenance; these invented tenant/source codes are NOT real customer data.
 * A real SessionSnapshot cannot be passed off as an authorized SKU scope.
 */
export function syntheticSkuReviewScope(input: {
  readonly session: SessionSnapshot | null
  readonly workOrderId: string
}): SkuMockReadScope | null {
  const session = input.session
  if (!session || session.sessionRef !== 'local-mock-only-session'
    || !canReadMaterialSkuMock({
      userId: session.user.id,
      roleId: session.currentRole?.id,
      workOrderId: input.workOrderId,
    })) return null
  return {
    sessionRef: session.sessionRef,
    userId: session.user.id,
    roleId: session.currentRole!.id,
    roleVersion: session.roleVersion ?? 'synthetic-unversioned-role',
    tenantId: 'synthetic-no-real-tenant',
    workOrderId: mockJourneyWorkOrderId,
    serviceType: '11',
    sourceType: 'synthetic-waterproof-source',
    contextRevision: 1,
    listedSpuIds: [...new Set(skuIds)],
    provenance: 'verified_synthetic_catalog',
  }
}

function directFixtureRows(scenario: MaterialSkuReviewScenario): readonly unknown[] {
  if (scenario === 'no_skus') return []
  if (scenario === 'ambiguous') return [
    syntheticMaterialSkuRows[0],
    { ...syntheticMaterialSkuRows[0], _id: 'synthetic-sku-ambiguous' },
  ]
  if (scenario === 'foreign') return [
    { ...syntheticMaterialSkuRows[0], spuid: 'other-synthetic-spu' },
  ]
  return syntheticMaterialSkuRows
}

function packageFixtureRows(scenario: PackageSkuMockScenario): readonly unknown[] {
  switch (scenario) {
    case 'no_skus': return syntheticPackageSkuRows.filter(row => row.spuid !== 'synthetic-spu-coating')
    case 'ambiguous': return [...syntheticPackageSkuRows,
      { ...syntheticPackageSkuRows[0], _id: 'synthetic-sku-ambiguous-package' }]
    case 'orphan': return [...syntheticPackageSkuRows,
      { ...syntheticPackageSkuRows[0], _id: 'synthetic-foreign-sku', spuid: 'other-spu' }]
    case 'duplicate': return [...syntheticPackageSkuRows, syntheticPackageSkuRows[0]]
    default: return syntheticPackageSkuRows
  }
}

function page(rows: readonly unknown[], limit: number): SkuMockPage {
  // Synthetic data fits one complete bounded page. Do not emulate paging by
  // returning a truncated page with hasMore=false.
  return { items: rows, hasMore: rows.length > limit, total: rows.length }
}

function blocked(reason: SkuMockReadFailure): SyntheticReviewAdmission {
  return { status: 'blocked', reason }
}

/**
 * This coordinator connects the already-reviewed role/WorkOrder gate to the
 * two actual DEV review projections. Every source row passes through the gate
 * before any SKU is matched or rendered. No API transport or SDK is reachable.
 */
export function createSyntheticSkuReviewCoordinator(options: {
  readonly currentScope: () => SkuMockReadScope | null
  readonly enabled?: () => boolean
}) {
  const enabled = options.enabled ?? isMaterialSkuMockAvailable
  let directScenario: MaterialSkuReviewScenario = 'normal'
  let packageScenario: PackageSkuMockScenario = 'normal'
  const directGate = createSkuSyntheticReadGate({
    enabled, currentScope: options.currentScope,
    fetchSyntheticPage: async (_ids, limit) => page(directFixtureRows(directScenario), limit),
  })
  const packageGate = createSkuSyntheticReadGate({
    enabled, currentScope: options.currentScope,
    fetchSyntheticPage: async (_ids, limit) => page(packageFixtureRows(packageScenario), limit),
  })
  return {
    invalidate(): void {
      directGate.invalidate()
      packageGate.invalidate()
    },
    async direct(scenario: MaterialSkuReviewScenario): Promise<SyntheticDirectReviewResult> {
      directGate.invalidate()
      directScenario = scenario
      const scope = options.currentScope()
      const result = await directGate.read({
        workOrderId: scope?.workOrderId ?? '',
        requestedSpuIds: [syntheticMaterialSpu._id],
      })
      if (result.state !== 'accepted_synthetic') return {
        admission: blocked(result.reason), read: directDenied,
      }
      return {
        admission: { status: 'accepted_synthetic' },
        read: projectR1MaterialSku({
          spu: syntheticMaterialSpu,
          salesFields: scenario === 'malformed'
            ? [{ ...syntheticMaterialSalesFields[0], frontEndConfig: '{invalid' }]
            : syntheticMaterialSalesFields,
          skuRows: result.skuRows,
        }),
      }
    },
    async package(scenario: PackageSkuMockScenario): Promise<SyntheticPackageReviewResult> {
      packageGate.invalidate()
      packageScenario = scenario
      const scope = options.currentScope()
      const result = await packageGate.read({
        workOrderId: scope?.workOrderId ?? '',
        requestedSpuIds: [...new Set(syntheticPackageMaterialLinks.map(link => link.materialId))],
      })
      if (result.state !== 'accepted_synthetic') return {
        admission: blocked(result.reason), read: packageDenied,
      }
      return {
        admission: { status: 'accepted_synthetic' },
        read: projectR1PackageMaterialSku({
          packageId: syntheticPackageId,
          pricingMethod: scenario === 'pricing_other' ? '2' : '1',
          materialLinks: syntheticPackageMaterialLinks,
          salesFields: syntheticPackageSalesFields,
          skuRows: result.skuRows,
        }),
      }
    },
  }
}
