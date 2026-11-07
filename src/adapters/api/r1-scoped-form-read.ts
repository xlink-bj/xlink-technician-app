import type { FormDataRead, FormValueCodec, R1NodeFormListRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import type { ApiReadTransport } from './technician-api'
import { formData } from './read-models/form'

export interface R1ScopedFormScope {
  readonly tenantId: string
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly workflowRunId: string
  readonly formDefinitionId: string
  readonly sourceNodeType: 'forms' | 'repeat'
}
export interface R1ScopedFormRecord {
  readonly ownership: R1ScopedFormScope
  /** Display-only data deliberately excludes appointment edit provenance. */
  readonly data: Omit<FormDataRead, 'appointmentReplacement'>
}
const fail = (): never => { throw new Error('R1 scoped form read evidence is missing, stale, or contradictory') }
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
const id = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.trim() === v ? v : fail()
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

/** The caller supplies already-proven role/node scope, never route parameters alone.
 * This reader verifies persisted ownership and never grants command authority. */
export function createR1ScopedFormReader(input: {
  readonly transport: ApiReadTransport
  readonly scope: R1ScopedFormScope
  readonly isCurrent: () => boolean
  readonly formList?: R1NodeFormListRead
  readonly valueCodec?: FormValueCodec
}) {
  const scope = Object.freeze({ ...input.scope })
  const references = input.formList ? {
    ...input.formList, entries: input.formList.entries.map(entry => ({ ...entry })),
  } : undefined
  let discovered = new Set<string>()
  function current() {
    if (!input.isCurrent() || !['forms', 'repeat'].includes(scope.sourceNodeType)) { discovered.clear(); fail() }
    for (const key of ['tenantId', 'workOrderId', 'runtimeNodeId', 'workflowRunId', 'formDefinitionId'] as const) id(scope[key])
  }
  function map(raw: unknown): R1ScopedFormRecord {
    const row = object(raw)
    for (const [key, expected] of Object.entries({ tenantId: scope.tenantId, sid: scope.workOrderId, nodeId: scope.runtimeNodeId, workflowId: scope.workflowRunId })) {
      if (id(row[key]) !== expected) fail()
    }
    const aliases = ['_id', 'id', 'dataId'].filter(key => key in row)
    if (!aliases.length) fail()
    const recordId = id(row[aliases[0]!])
    if (aliases.some(key => id(row[key]) !== recordId) || row.state !== 1) fail()
    for (const key of ['extId', 'definitionId', 'formDefId', 'formDefinitionId']) {
      if (key in row && id(row[key]) !== scope.formDefinitionId) fail()
    }
    const mapped = formData(row, input.valueCodec, asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId))
    // Do not clone or expose the mapper's identity-signed edit provenance.
    const data = { id: mapped.id, definitionId: mapped.definitionId,
      ...(mapped.workflowRunId ? { workflowRunId: mapped.workflowRunId } : {}),
      ...(mapped.values ? { values: structuredClone(mapped.values) } : {}),
    }
    return freeze({ ownership: scope, data })
  }
  async function page(pageNumber: number, exactId?: string) {
    current()
    const rows = exactId ? 2 : 20
    const raw = await input.transport.execute({
      method: 'POST', path: `biz/extForm/query/${encodeURIComponent(scope.formDefinitionId)}`,
      body: {
        sortField: 'createTime', sortOrder: 'desc',
        'is:sid|string#and': scope.workOrderId,
        'is:nodeId|string#and': scope.runtimeNodeId,
        'is:workflowId|string#and': scope.workflowRunId,
        'ne:state|integer#and': -1,
        ...(exactId ? { 'is:_id|string#and': exactId } : {}), page: pageNumber, rows,
      },
    })
    current()
    const envelope = object(raw)
    const total = envelope.total
    if (!Number.isSafeInteger(total) || (total as number) < 0 || (total as number) > 200
      || envelope.page !== pageNumber || (envelope.size ?? envelope.rows) !== rows
      || ('rows' in envelope && envelope.rows !== rows) || !Array.isArray(envelope.data)) fail()
    const data = envelope.data as unknown[]
    if (data.length !== Math.min(rows, Math.max(0, (total as number) - (pageNumber - 1) * rows))) fail()
    // Backend com/osg/entity/FlipInfo.java:getDataCount returns getData().size().
    if ('dataCount' in envelope && envelope.dataCount !== data.length) fail()
    if ('pages' in envelope && envelope.pages !== Math.ceil((total as number) / rows)) fail()
    return { total: total as number, records: data.map(map) }
  }
  async function exact(recordId: string) {
    const result = await page(1, recordId)
    if (result.total !== 1 || result.records[0]?.data.id !== recordId) fail()
    return result.records[0]!
  }
  return {
    async discover(): Promise<readonly R1ScopedFormRecord[]> {
      discovered = new Set()
      current()
      const records: R1ScopedFormRecord[] = []
      if (scope.sourceNodeType === 'forms') {
        if (!references || references.source !== 'exts.formList' || references.evidence !== 'available' || references.truncated || references.entries.length > 50) fail()
        const seen = new Set<string>()
        for (const entry of references!.entries) {
          const key = id(entry.id)
          if (seen.has(key) || !['active', 'deleted'].includes(entry.state)
            || (entry.formDefinitionId !== undefined && entry.formDefinitionId !== scope.formDefinitionId)) fail()
          seen.add(key)
        }
        for (const entry of references!.entries) if (entry.state === 'active') records.push(await exact(entry.id))
      } else {
        let total: number | undefined
        for (let n = 1; n <= 10; n++) {
          const result = await page(n)
          if (total !== undefined && total !== result.total) fail()
          total = result.total
          records.push(...result.records)
          if (records.length === total) break
        }
        if (records.length !== total) fail()
      }
      current()
      const ids = records.map(record => String(record.data.id))
      if (new Set(ids).size !== ids.length) fail()
      discovered = new Set(ids)
      return Object.freeze(records)
    },
    async select(recordId: string): Promise<R1ScopedFormRecord> {
      current()
      if (!discovered.has(id(recordId))) fail()
      return exact(recordId)
    },
  }
}
