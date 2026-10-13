import type { QuotationCatalogItemRead } from './ports'

// Pinned R1: xlink-app@6c0a97b, placeOrders.vue package/procedure/material filters.
// Read-model-only classifier. Not authorization, pricing, Order validation or UI filtering.
export type R1CatalogFilterKind = 'strict_array' | 'procedure'
export type R1CatalogEligibility = 'match' | 'not_match' | 'unverified' | 'not_applicable'
const codeValue = (value: unknown): value is string | number =>
  (typeof value === 'string' && value.trim().length > 0)
  || (typeof value === 'number' && Number.isFinite(value))

export function parseR1CatalogFilterCodes(
  raw: unknown, kind: R1CatalogFilterKind,
): readonly string[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  let value: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim().replace(/&quot;/g, '"')
    if (!text) return undefined
    try { value = JSON.parse(text) as unknown }
    catch { return kind === 'procedure' ? [text] : undefined }
  }
  if (Array.isArray(value)) return value.every(codeValue) ? value.map(String) : undefined
  return kind === 'procedure' && codeValue(value) ? [String(value)] : undefined
}

// Caller must supply exact verified code-option values for the service-specific
// R1 dictionary. Unknown provider metadata MUST stay unverified, never hidden
// or treated as a selectable/saleable product.
export function classifyR1CatalogEligibility(input: {
  readonly item: QuotationCatalogItemRead
  readonly serviceType: string
  readonly selectedCode: string
  readonly verifiedOptionCodes?: readonly string[]
}): R1CatalogEligibility {
  const { item, serviceType, selectedCode, verifiedOptionCodes } = input
  if (item.kind === 'measure') return 'not_applicable'
  if (!selectedCode) return 'not_applicable'
  if (!serviceType.trim() || !verifiedOptionCodes
    || !verifiedOptionCodes.includes(selectedCode)) return 'unverified'
  if (item.kind === 'package') {
    const codes = ['11', '12', '40'].includes(serviceType)
      ? item.r1RepairPartsCodes : item.r1ConstructionPartsCodes
    if (!codes) return 'unverified'
    return codes.includes(selectedCode) ? 'match' : 'not_match'
  }
  if (item.kind === 'procedure') {
    if (!item.r1RepairProcedureCodes) return 'unverified'
    return item.r1RepairProcedureCodes.includes(selectedCode) ? 'match' : 'not_match'
  }
  if (item.type === undefined) return 'unverified'
  return String(item.type) === selectedCode ? 'match' : 'not_match'
}
