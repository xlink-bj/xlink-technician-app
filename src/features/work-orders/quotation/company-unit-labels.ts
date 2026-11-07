/** Parse the observed company dictionary envelope. Labels are rendering-only;
 * missing, empty or malformed providers never supply guessed unit meanings. */
export function companyUnitLabels(raw: unknown): ReadonlyMap<string, string> | null {
  if (!Array.isArray(raw) || raw.length !== 1) return null
  const row = record(raw[0])
  if (row?.codeId !== 'company' || row.eleid !== 'company') return null
  const options = record(row.options)
  if (!options) return null
  const entries = Object.entries(options)
  if (!entries.length || entries.length > 500
    || entries.some(([code, label]) => !code.trim() || typeof label !== 'string' || !label.trim())) return null
  return new Map(entries.map(([code, label]) => [code, (label as string).trim()]))
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
