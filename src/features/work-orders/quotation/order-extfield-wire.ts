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
 * Order media requires a separate verified upload projection and stays blocked.
 */
export function projectR1OrderExtFieldWire(
  definitions: readonly OrderExtFieldWireDefinition[],
  values: Readonly<Record<string, unknown>>,
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
    if (field.type === 'file' || field.type === 'image') return { state: 'blocked', reason: 'media_not_verified' }
    if (!scalar(value) && !(Array.isArray(value) && value.every(scalar))) {
      return { state: 'blocked', reason: 'unsupported_value' }
    }
    exts[field.name] = Array.isArray(value) ? [...value] : value
  }
  return { state: 'projected', exts }
}
