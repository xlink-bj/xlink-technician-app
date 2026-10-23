/**
 * R1 'forms': full-fidelity plan for workflowNode/updateExts/{runtimeId}.
 * Preserve the authoritative backend EXTS payload (including unknown fields)
 * rather than rebuilding it from the redacted WorkOrder form summary.
 *
 * SOURCE_ONLY: never performs a request. JSON media type is required for
 * updateExts; the ordinary form-urlencoded CommandTransport is INELIGIBLE.
 */
export type R1JsonObject = Readonly<Record<string, unknown>>
export interface R1FormsUpdateExtsPlan {
  readonly method: 'POST'
  readonly path: string
  readonly contentType: 'application/json'
  readonly body: R1JsonObject
  readonly previousIds: readonly string[]
  readonly updatedIds: readonly string[]
}
export type R1FormsChange =
  | { readonly kind: 'saved'; readonly record: R1JsonObject }
  | { readonly kind: 'delete'; readonly recordId: string }

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function identified(record: R1JsonObject): string {
  const value = record._id
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    throw new Error('R1 formList item requires one authoritative saved _id')
  }
  return value
}
function safeCopy<T>(input: T): T {
  try {
    // Reject cyclic/non-JSON data; clone to avoid mutating caller-owned
    // backend snapshots. Ensure encoded JSON has no missing shape.
    const copy: unknown = JSON.parse(JSON.stringify(input))
    if (copy === null || copy === undefined) throw new Error('missing JSON')
    return copy as T
  } catch {
    throw new Error('Full-fidelity R1 exts must be a JSON-compatible object')
  }
}
export function planR1FormsUpdateExts(input: {
  readonly workflowNodeId: string
  readonly sourceNodeType: 'forms'
  readonly authoritativeExts: R1JsonObject
  readonly change: R1FormsChange
}): R1FormsUpdateExtsPlan {
  if (input.sourceNodeType !== 'forms') throw new Error('Only R1 forms may update node exts.formList')
  if (!input.workflowNodeId.trim() || input.workflowNodeId !== input.workflowNodeId.trim())
    throw new Error('Runtime node ID is required')
  if (!plain(input.authoritativeExts) || !Array.isArray(input.authoritativeExts.formList))
    throw new Error('Authoritative node exts.formList must be fetched before editing')
  const copy = safeCopy(input.authoritativeExts)
  if (!plain(copy) || !Array.isArray(copy.formList) || copy.formList.length > 100)
    throw new Error('Unbounded or malformed formList')
  const items: R1JsonObject[] = copy.formList.map(x => {
    if (!plain(x)) throw new Error('Malformed formList item')
    return x
  })
  const existing = items.map(identified)
  if (new Set(existing).size !== existing.length) throw new Error('Duplicate existing FormData identity')
  let changed: R1JsonObject[]
  if (input.change.kind === 'saved') {
    const candidate = safeCopy(input.change.record)
    if (!plain(candidate)) throw new Error('Saved FormData must be a JSON object')
    const id = identified(candidate)
    if (candidate.state === -1) throw new Error('Cannot treat a deleted form as newly saved')
    const saved = { ...candidate, state: candidate.state ?? 1 }
    if (candidate.formDefId !== undefined && typeof candidate.formDefId !== 'string')
      throw new Error('Invalid saved FormDefinition ID')
    changed = existing.includes(id)
      ? items.map(item => identified(item) === id ? saved : item)
      : [...items, saved]
  } else {
    const id = input.change.recordId
    if (!existing.includes(id)) throw new Error('Cannot remove a form absent from authoritative formList')
    changed = items.map(item => identified(item) === id ? { ...item, state: -1 } : item)
  }
  if (changed.length > 100) throw new Error('Updated formList exceeds bounded transaction limit')
  const payload = { ...copy, formList: changed }
  return {
    method: 'POST',
    path: `workflowNode/updateExts/${encodeURIComponent(input.workflowNodeId)}`,
    contentType: 'application/json',
    body: payload,
    previousIds: existing,
    updatedIds: changed.map(identified),
  }
}
