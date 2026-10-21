import type { R1NodeFormListRead, R1NodeFormReference } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

type Plain = Readonly<Record<string, unknown>>
const CAP = 50
const asPlain = (value: unknown): Plain | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Plain : null
const identifier = (value: unknown): string | null =>
  (typeof value === 'string' || typeof value === 'number')
    && String(value).trim().length > 0 ? String(value).trim() : null

/** Source-verified R1 paths: forms => node.exts.formList;
 * repeat => node.formDataList populated by the separate queried-list workflow.
 * This does NOT initiate the repeat query and must not pretend it did.
 */
export function readR1NodeFormList(
  rawNode: Readonly<Record<string, unknown>>,
  nodeType: string | undefined,
): R1NodeFormListRead | undefined {
  if (nodeType !== 'forms' && nodeType !== 'repeat') return undefined
  const source = nodeType === 'forms' ? 'exts.formList' : 'formDataList'
  const value = nodeType === 'forms'
    ? asPlain(rawNode.exts)?.formList : rawNode.formDataList
  if (value === undefined || value === null) return undefined
  const invalid = (): R1NodeFormListRead => ({
    source, evidence: 'invalid', entries: [], truncated: false,
  })
  if (!Array.isArray(value)) return invalid()
  const entries: R1NodeFormReference[] = []
  const seen = new Set<string>()
  for (const raw of value.slice(0, CAP)) {
    const record = asPlain(raw)
    const id = record && identifier(record._id ?? record.id)
    if (!record || !id || seen.has(id)) return invalid()
    seen.add(id)
    const definitionId = identifier(record.formDefId)
    const title = typeof record.formTitle === 'string'
      ? record.formTitle.trim().slice(0, 80) : ''
    const state: R1NodeFormReference['state'] = record.state === -1
      ? 'deleted' : record.state === 1 ? 'active' : 'unknown'
    entries.push({
      id: asOpaqueId<'FormDataId'>(id),
      ...(definitionId ? { formDefinitionId: asOpaqueId<'FormDefinitionId'>(definitionId) } : {}),
      ...(title ? { title } : {}),
      state,
    })
  }
  return { source, evidence: 'available', entries, truncated: value.length > CAP }
}
