import type {
  CodeOptionRead,
  QuotationCatalogFilterOptionsRead,
  QuotationCatalogItemRead,
} from '@shared/ports'
import type { QuotationLineKind } from './model'
import { classifyR1CatalogEligibility } from '@shared/quotation-catalog-eligibility'

export function quotationCatalogOptionsForKind(
  options: QuotationCatalogFilterOptionsRead | null | undefined,
  kind: QuotationLineKind,
): readonly CodeOptionRead[] {
  if (!options) return []
  switch (kind) {
    case 'package': return options.packageParts.options
    case 'procedure': return options.procedures.options
    case 'material': return options.materials.options
    case 'measure': return []
  }
}

/** Apply only the source-verified R1 browsing filters. Unknown item taxonomy is
 * retained under "全部" and is never promoted to a match for a selected code.
 */
export function filterQuotationCatalogItemsForR1(input: {
  readonly items: readonly QuotationCatalogItemRead[]
  readonly kind: QuotationLineKind
  readonly serviceType: string
  readonly options?: QuotationCatalogFilterOptionsRead | null
  readonly selectedCode?: string
  readonly selectedPackageAgeLimit?: string
}): readonly QuotationCatalogItemRead[] {
  const { items, kind, serviceType, options } = input
  const selectedCode = input.selectedCode ?? ''
  const selectedPackageAgeLimit = input.selectedPackageAgeLimit ?? ''
  const codeOptions = quotationCatalogOptionsForKind(options, kind)
  const verifiedCodes = codeOptions.map(option => option.value)

  if (selectedCode && !verifiedCodes.includes(selectedCode)) return []
  if (selectedPackageAgeLimit && (!options
    || !options.packageAgeLimits.options.some(option => option.value === selectedPackageAgeLimit))) return []

  return items.filter(item => {
    if (item.kind !== kind) return false
    if (selectedCode && classifyR1CatalogEligibility({
      item,
      serviceType,
      selectedCode,
      verifiedOptionCodes: verifiedCodes,
    }) !== 'match') return false
    if (selectedPackageAgeLimit) {
      return item.kind === 'package' && item.ageLimit !== undefined
        && String(item.ageLimit) === selectedPackageAgeLimit
    }
    return true
  })
}
