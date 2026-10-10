import type { QuotationCatalogItemRead } from '@shared/ports'
import { classifyR1CatalogEligibility, type R1CatalogEligibility } from '@shared/quotation-catalog-eligibility'
import type { QuotationLineKind } from './model'

// Only for the isolated DEV Mock quotation WorkOrder. Synthetic taxonomy
// codes are NOT proof of current tenant's active R1 dictionary options.
export type SyntheticCatalogFilterOption = {
  readonly code: string
  readonly label: string
}
const options: Readonly<Record<QuotationLineKind, readonly SyntheticCatalogFilterOption[]>> = {
  package: [{ code: 'synthetic-roof', label: '模拟屋面' }, { code: 'synthetic-wall', label: '模拟外墙' }],
  procedure: [{ code: 'synthetic-prep', label: '模拟基层' }, { code: 'synthetic-seal', label: '模拟密封' }],
  material: [{ code: '1', label: '模拟材料类 1' }, { code: '2', label: '模拟材料类 2' }],
  measure: [],
}
export function syntheticCatalogFilterOptions(kind: QuotationLineKind): readonly SyntheticCatalogFilterOption[] {
  return options[kind]
}

// Source-type simulation uses the R1 waterproof branch 11 only in this
// synthetic mode; the actual Mock serviceType remains mock-service-waterproof.
export function syntheticCatalogFilterEligibility(
  item: QuotationCatalogItemRead,
  selectedCode: string,
): R1CatalogEligibility {
  if (!selectedCode) return 'not_applicable'
  return classifyR1CatalogEligibility({
    item,
    serviceType: '11',
    selectedCode,
    verifiedOptionCodes: options[item.kind].map((option) => option.code),
  })
}

export function syntheticCatalogFilterVisible(
  item: QuotationCatalogItemRead,
  selectedCode: string,
): boolean {
  return syntheticCatalogFilterEligibility(item, selectedCode) !== 'not_match'
}

export function syntheticCatalogFilterSelectable(
  item: QuotationCatalogItemRead,
  selectedCode: string,
): boolean {
  if (!selectedCode) return true
  return syntheticCatalogFilterEligibility(item, selectedCode) === 'match'
}
