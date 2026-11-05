/** R1 placeOrders.vue:4230–4238,4276–4284. Pure projection, never a write gate. */
export interface OrderExtFieldWireDefinition {
  readonly name: string
  readonly type: string
}

export type OrderExtFieldWireResult =
  | { readonly state: 'projected'; readonly exts: Readonly<Record<string, unknown>> }
  | { readonly state: 'blocked'; readonly reason: 'invalid_definition' | 'unsupported_value' | 'media_not_verified' }

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
function scalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

/**
 * Callers supply the complete configured ExtField set, independently of stage
 * visibility. This does not validate requiredness, options, permissions or price.
 * Order file projection requires explicit queue-backed keys; other media stays blocked.
 */
export function projectR1OrderExtFieldWire(
  definitions: readonly OrderExtFieldWireDefinition[],
  values: Readonly<Record<string, unknown>>,
  verifiedMediaKeys: readonly string[] = [],
): OrderExtFieldWireResult {
  const exts: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const types = new Map<string, string>()
  for (const field of definitions) {
    if (!field || typeof field.name !== 'string' || !field.name.trim()
      || unsafeKeys.has(field.name) || typeof field.type !== 'string' || !field.type.trim()
      || (types.has(field.name) && types.get(field.name) !== field.type)) {
      return { state: 'blocked', reason: 'invalid_definition' }
    }
    types.set(field.name, field.type)
    if (!Object.prototype.hasOwnProperty.call(values, field.name)) continue
    const value = values[field.name]
    if (typeof value === 'number' && !Number.isFinite(value)) return { state: 'blocked', reason: 'unsupported_value' }
    // Exact R1 presence condition: value || value === 0. Empty arrays are truthy.
    if (!value && value !== 0) continue
    if (field.type === 'file' && verifiedMediaKeys.includes(field.name)) {
      const encoded = encodeOrderMedia(value)
      if (encoded === null) return { state: 'blocked', reason: 'media_not_verified' }
      if (encoded) exts[field.name] = encoded
      continue
    }
    if (field.type === 'file' || field.type === 'image') return { state: 'blocked', reason: 'media_not_verified' }
    if (!scalar(value) && !(Array.isArray(value) && value.every(scalar))) {
      return { state: 'blocked', reason: 'unsupported_value' }
    }
    exts[field.name] = Array.isArray(value) ? [...value] : value
  }
  return { state: 'projected', exts }
}

/** Order-only R1 URL-list codec. Never used for FormData's object-list wire. */
export interface OrderMediaValue { readonly url: string }
function safeOrderUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[,\s]/.test(value)) return false
  return /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\\s,]*)?$/i.test(value)
}
export function encodeOrderMedia(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 10) return null
  const urls: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Object.keys(item).join(',') !== 'url' || !safeOrderUrl(item.url)) return null
    // R1 strips image transformation query parameters before Order writes.
    const url = item.url.split('?')[0]
    if (urls.includes(url)) return null
    urls.push(url)
  }
  return urls.join(',')
}
export function decodeOrderMedia(value: unknown): readonly OrderMediaValue[] | null {
  if (value === undefined || value === '') return []
  if (typeof value !== 'string') return null
  const items = value.split(',').map(url => ({ url }))
  return encodeOrderMedia(items) === null ? null : items
}
