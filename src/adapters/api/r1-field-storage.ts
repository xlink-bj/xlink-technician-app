/** Storage metadata only; never a field/node/actor permission grant. */
export interface R1FieldStorage {
  readonly fieldId: string
  readonly valueKey: string
  readonly preset?: boolean
}

/** R1 saveForm copies non-preset business values to exts, retaining the root
 * copy too. Work on the authoritative original, not flattened display values.
 * Unknown original/hidden fields remain untouched. No I/O or edit authority. */
export function projectR1PresetStorage(
  original: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
  fields?: readonly R1FieldStorage[],
): Record<string, unknown> {
  const result = { ...original, ...patch }
  if (!fields) return result
  if (fields.length > 200 || fields.some(field => !field.fieldId || !field.valueKey
    || field.valueKey.trim() !== field.valueKey)
    || new Set(fields.map(field => field.fieldId)).size !== fields.length) {
    throw new Error('Invalid R1 field storage metadata')
  }
  const keys = new Set(fields.filter(field => field.preset === false).map(field => field.valueKey))
  const supplied = [...keys].filter(key => Object.hasOwn(patch, key))
  if (!supplied.length) return result
  const oldExts = original.exts
  if (oldExts !== undefined && (oldExts === null || typeof oldExts !== 'object' || Array.isArray(oldExts))) {
    throw new Error('R1 field storage requires complete original exts')
  }
  const exts = { ...(oldExts as Record<string, unknown> | undefined) }
  for (const key of supplied) {
    if (['__proto__', 'prototype', 'constructor', 'exts'].includes(key)) throw new Error('Invalid R1 extension business key')
    exts[key] = patch[key]
  }
  return { ...result, exts }
}
