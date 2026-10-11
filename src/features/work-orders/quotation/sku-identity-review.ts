import type { MaterialSkuRead } from '@shared/material-sku-contract'
import type { PackageMaterialSkuRead } from '@shared/package-material-sku-contract'
import type { QuotationDraft, QuotationConfiguredPackageMaterial } from './model'

/** DEV-only identity audit. Identity correlation never selects SKU or authorizes a business write. */
export type SkuLineageStatus = 'demo_ids_correspond' | 'catalog_id_mismatch' | 'source_missing'
  | 'source_ambiguous' | 'body_id_mismatch' | 'layer_unverified'
  | 'source_incomplete' | 'pricing_path_not_applicable' | 'package_unconfigured'
export interface SkuLineageFinding {
  readonly groupId: string
  readonly selectionId: string
  readonly kind: 'direct' | 'package' | 'package_material'
  readonly catalogId: string
  readonly status: SkuLineageStatus
  readonly skuSelected: false
}
export interface SkuLineageAudit {
  readonly source: 'independent_synthetic_fixtures' | 'same_quote_catalog_synthetic_overlay'
  readonly findings: readonly SkuLineageFinding[]
  readonly total: number
  readonly correlatedForDemo: number
  readonly mismatched: number
  readonly realSkuAuthorized: false
  readonly officialOrderAllowed: false
}
type Sources = {
  readonly direct: readonly MaterialSkuRead[]
  readonly packages: readonly PackageMaterialSkuRead[]
}
const spu = (v: MaterialSkuRead): string | null =>
  v.state === 'blocked' ? null : v.spuId
const pkg = (v: PackageMaterialSkuRead): string | null =>
  v.state === 'ready' || v.state === 'not_applicable' ? v.packageId : null
const finding = (groupId: string, selectionId: string, kind: SkuLineageFinding['kind'], catalogId: string, status: SkuLineageStatus): SkuLineageFinding =>
  ({ groupId, selectionId, kind, catalogId, status, skuSelected: false })

function directStatus(id: string, sources: Sources): SkuLineageStatus {
  const ids = sources.direct.map(spu).filter((v): v is string => v !== null)
  if (!ids.length) return 'source_missing'
  if (!ids.includes(id)) return 'catalog_id_mismatch'
  if (ids.filter((v) => v === id).length !== 1) return 'source_ambiguous'
  return sources.direct.find((v) => spu(v) === id)?.state === 'ready'
    ? 'demo_ids_correspond' : 'source_incomplete'
}
function packageChildStatus(
  item: QuotationConfiguredPackageMaterial,
  source: Extract<PackageMaterialSkuRead, { readonly state: 'ready' }>,
): SkuLineageStatus {
  // Compare the exact R1 typed layer. The presentation-normalized string
  // is not sufficient evidence for numeric versus text layer identity.
  const layer = source.layers.find((v) => v.rawLayer === item.layer)
  if (!layer) return 'layer_unverified'
  if (!item.providerComponentId?.trim() || !item.catalogId.trim()
    || (item.providerReferenceId && item.providerReferenceId !== item.catalogId)) return 'body_id_mismatch'
  const same = layer.options.filter((v) =>
    v.linkId === item.providerComponentId && v.materialId === item.catalogId)
  if (same.length !== 1) return 'body_id_mismatch'
  return same[0].skuRead.state === 'ready' ? 'demo_ids_correspond' : 'source_incomplete'
}
export function auditP1QuotationSkuLineage(
  draft: QuotationDraft, sources: Sources,
  provenance: SkuLineageAudit['source'] = 'independent_synthetic_fixtures',
): SkuLineageAudit {
  const findings: SkuLineageFinding[] = []
  for (const group of draft.groups) {
    for (const material of group.materials) {
      findings.push(finding(group.groupId, material.selectionId, 'direct', material.catalogId,
        directStatus(material.catalogId, sources)))
    }
    for (const quotePackage of group.projPackages) {
      const ids = sources.packages.map(pkg).filter((v): v is string => v !== null)
      const candidates = sources.packages.filter((v) => pkg(v) === quotePackage.catalogId)
      const top: SkuLineageStatus = !ids.length ? 'source_missing'
        : !candidates.length ? 'catalog_id_mismatch'
          : candidates.length !== 1 ? 'source_ambiguous'
            : candidates[0].state === 'not_applicable' ? 'pricing_path_not_applicable'
              : candidates[0].state !== 'ready' ? 'source_incomplete' : 'demo_ids_correspond'
      findings.push(finding(group.groupId, quotePackage.selectionId, 'package', quotePackage.catalogId, top))
      if (!quotePackage.configuration) {
        findings.push(finding(group.groupId, quotePackage.selectionId, 'package_material',
          quotePackage.catalogId, 'package_unconfigured'))
        continue
      }
      for (const material of quotePackage.configuration.materials) {
        const status: SkuLineageStatus = top !== 'demo_ids_correspond' ? top
          : candidates[0].state === 'ready' ? packageChildStatus(material, candidates[0]) : 'source_incomplete'
        findings.push(finding(group.groupId, quotePackage.selectionId, 'package_material', material.catalogId, status))
      }
    }
  }
  return {
    source: provenance,
    findings, total: findings.length,
    correlatedForDemo: findings.filter((v) => v.status === 'demo_ids_correspond').length,
    mismatched: findings.filter((v) => ['catalog_id_mismatch', 'source_ambiguous', 'body_id_mismatch', 'layer_unverified'].includes(v.status)).length,
    realSkuAuthorized: false, officialOrderAllowed: false,
  }
}
