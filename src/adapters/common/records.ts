import { AdapterMappingError } from './operations'

export type AdapterRecord = Record<string, unknown>

export function asRecord(value: unknown, label: string): AdapterRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdapterMappingError(`${label} must be an object`)
  }

  return value as AdapterRecord
}

export function optionalRecord(value: unknown): AdapterRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as AdapterRecord
}

export function firstString(record: AdapterRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

export function optionalString(record: AdapterRecord, keys: readonly string[]): string | undefined {
  return firstString(record, keys)
}

/** IDs may arrive under legacy and modern aliases. A present second alias
 * must corroborate the first; choosing the first one is not provenance. */
export function consistentWireIdentity(
  record: AdapterRecord,
  keys: readonly string[],
  label: string,
): string | undefined {
  const ids = keys
    .map((key) => optionalString(record, [key]))
    .filter((id): id is string => Boolean(id))
  if (new Set(ids).size > 1) throw new AdapterMappingError(`${label} contains contradictory identities`)
  return ids[0]
}

export function assertMatchingWireIdentity(
  record: AdapterRecord,
  keys: readonly string[],
  expected: string,
  label: string,
): void {
  const id = consistentWireIdentity(record, keys, label)
  if (id !== undefined && id !== expected) {
    throw new AdapterMappingError(`${label} conflicts with the requested identity`)
  }
}

export function optionalPositiveInteger(
  record: AdapterRecord,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (Number.isInteger(numberValue) && numberValue > 0) return numberValue
  }
  return undefined
}

export function optionalNonNegativeInteger(
  record: AdapterRecord,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (Number.isInteger(numberValue) && numberValue >= 0) return numberValue
  }
  return undefined
}

/** R1 lifecycle enums may include meaningful negative values (for example,
 * Order state=-1 and processState=-1/-2). Missing/null/blank is not zero. */
export function optionalSignedInteger(
  record: AdapterRecord,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) continue
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return undefined
}

export function requiredString(record: AdapterRecord, keys: readonly string[], label: string): string {
  const value = firstString(record, keys)
  if (!value) throw new AdapterMappingError(`${label} is missing`)
  return value
}

export function nestedRecord(record: AdapterRecord, keys: readonly string[]): AdapterRecord | undefined {
  for (const key of keys) {
    const nested = optionalRecord(record[key])
    if (nested) return nested
  }
  return undefined
}

export function nestedValue(record: AdapterRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}
