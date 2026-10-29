/**
 * Read-only, product-review-only UI contract.
 * Neither the "ready" discriminator nor a matched catalog ID grants a SKU
 * selection, backend read, legal quote, or official Order permission.
 */
export type QuoteSkuReadinessBlock =
  | 'no_selected_materials' | 'catalog_unavailable'
  | 'quote_source_identity_mismatch' | 'catalog_materials_incomplete'
  | 'source_preflight_blocked' | 'sales_option_source_blocked'

export type QuoteSkuReadiness =
  | {
      readonly state: 'blocked_synthetic'
      readonly reason: QuoteSkuReadinessBlock
      readonly realSkuAuthorized: false
      readonly officialOrderAllowed: false
    }
  | {
      readonly state: 'synthetic_structure_only'
      readonly materialSpuCount: number
      readonly saleFieldCount: number
      readonly saleOptionCount: number
      readonly realSkuAuthorized: false
      readonly officialOrderAllowed: false
      readonly tenantAuthorization: 'unverified'
      readonly workOrderAuthorization: 'unverified'
    }
