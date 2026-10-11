import { makeSameCatalogSkuMock } from '@adapters/api/mock/quotation-sku-same-catalog'
import { projectR1MaterialSku } from '@shared/material-sku-contract'
import { projectR1PackageMaterialSku } from '@shared/package-material-sku-contract'
import { auditP1QuotationSkuLineage, type SkuLineageAudit } from '@features/work-orders/quotation/sku-identity-review'
import type { QuotationDraft } from '@features/work-orders/quotation/model'
import { syntheticMaterialSkuRows, syntheticMaterialSalesFields, syntheticMaterialSpu } from '@adapters/api/mock/material-sku'
import { syntheticPackageId, syntheticPackageMaterialLinks, syntheticPackageSkuRows, syntheticPackageSalesFields } from '@adapters/api/mock/package-material-sku'

/** Independent fixture diagnostic, NOT a live or authorized SKU source. */
export function compareQuoteWithStandaloneSkuDemo(draft: QuotationDraft): SkuLineageAudit | null {
  if (!import.meta.env.DEV) return null
  return auditP1QuotationSkuLineage(draft, {
    direct: [projectR1MaterialSku({
      spu: syntheticMaterialSpu, salesFields: syntheticMaterialSalesFields, skuRows: syntheticMaterialSkuRows,
    })],
    packages: [projectR1PackageMaterialSku({
      packageId: syntheticPackageId, pricingMethod: '1',
      materialLinks: syntheticPackageMaterialLinks,
      salesFields: syntheticPackageSalesFields, skuRows: syntheticPackageSkuRows,
    })],
  })
}


export type SameCatalogComparison =
  | { readonly state: 'blocked'; readonly reason: string }
  | { readonly state: 'ready_synthetic_only'; readonly audit: SkuLineageAudit }

/** Distinct, explicitly hypothetical SKU overlay of the SAME Quote Catalog IDs. */
export function compareQuoteWithSameCatalogSyntheticSku(draft: QuotationDraft): SameCatalogComparison | null {
  if (!import.meta.env.DEV) return null
  const src = makeSameCatalogSkuMock()
  if (src.state !== 'ready_synthetic_only') return { state: 'blocked', reason: src.reason }
  return {
    state: 'ready_synthetic_only',
    audit: auditP1QuotationSkuLineage(draft, {
      direct: src.direct, packages: src.packages,
    }, 'same_quote_catalog_synthetic_overlay'),
  }
}
