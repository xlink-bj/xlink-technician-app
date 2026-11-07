import type { CodeOptionRead, CodeOptionsQuery, ReadPage } from '@shared/ports'
import { AdapterMappingError } from '../common/operations'
import { asRecord, type AdapterRecord } from '../common/records'

interface CodeQueryRequest {
  readonly method: 'POST'
  readonly path: 'code/query'
  readonly body: Readonly<Record<string, string | number>>
}

// FlipPageInfo uses page/rows; CodeService fixes order ASC, but the verified
// EMongoTemplate sidx/sord override permits an _id tie-breaker for safe paging.
// This is a complete bounded read, never an _all request or a first-page cache.
export const codeQueryPageSize = 50
export const codeQueryMaxPages = 10
export const codeQueryMaxItems = codeQueryPageSize * codeQueryMaxPages

function filter(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
    throw new AdapterMappingError(`Code query ${label} is malformed`)
  }
  return value
}

function integer(record: AdapterRecord, key: string): number {
  const raw = record[key]
  const value = typeof raw === 'number' ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AdapterMappingError(`Code query ${key} is missing or malformed`)
  }
  return value
}

function requiredText(record: AdapterRecord, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
    throw new AdapterMappingError(`Code query row ${key} is missing or malformed`)
  }
  return value
}

/** All pages must agree before any options are exposed. dataCount is the
 * current page length in Java FlipInfo, NOT a fallback for total. */
export async function readCompleteCodeOptions(
  query: CodeOptionsQuery,
  execute: (request: CodeQueryRequest) => Promise<unknown>,
  assertCurrent: () => void,
): Promise<ReadPage<CodeOptionRead>> {
  const type = filter(query.valueOption, 'type')
  const parentId = filter(query.parentValue, 'parentId')
  const body: Record<string, string | number> = {
    rows: codeQueryPageSize, sidx: 'order,_id', sord: 'asc',
    ...(type !== undefined ? { 'is:type|string#and': type } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  }
  const items: CodeOptionRead[] = []
  const ids = new Set<string>()
  const values = new Set<string>()
  let expectedTotal: number | undefined

  for (let page = 1; page <= codeQueryMaxPages; page += 1) {
    assertCurrent()
    const raw = await execute({ method: 'POST', path: 'code/query', body: { ...body, page } })
    assertCurrent()
    const envelope = asRecord(raw, 'Code query response')
    if (envelope.success === false || !Array.isArray(envelope.data)) {
      throw new AdapterMappingError('Code query response is malformed or failed')
    }
    if (envelope.all === true || envelope.needTotal === false
      || (envelope.sortField !== undefined && envelope.sortField !== 'order,_id')
      || (envelope.sortOrder !== undefined && String(envelope.sortOrder).toLowerCase() !== 'asc')) {
      throw new AdapterMappingError('Code query response does not confirm bounded, counted, stable paging')
    }
    const total = integer(envelope, 'total')
    if (integer(envelope, 'page') !== page || integer(envelope, 'rows') !== codeQueryPageSize
      || (envelope.size !== undefined && integer(envelope, 'size') !== codeQueryPageSize)) {
      throw new AdapterMappingError('Code query page or size does not match the request')
    }
    if (total > codeQueryMaxItems) {
      throw new AdapterMappingError('Code query exceeds the 10-page / 500-item limit')
    }
    if (expectedTotal !== undefined && total !== expectedTotal) {
      throw new AdapterMappingError('Code query total changed between pages')
    }
    expectedTotal = total
    const expectedLength = Math.min(codeQueryPageSize, total - items.length)
    if (envelope.data.length !== expectedLength
      || (envelope.dataCount !== undefined && integer(envelope, 'dataCount') !== envelope.data.length)
      || (envelope.pages !== undefined && integer(envelope, 'pages') !== Math.ceil(total / codeQueryPageSize))) {
      throw new AdapterMappingError('Code query page is incomplete or its counts are inconsistent')
    }
    for (const rawItem of envelope.data) {
      const row = asRecord(rawItem, 'Code query row')
      const id = requiredText(row, '_id')
      const value = requiredText(row, 'value')
      const label = requiredText(row, 'name')
      if (row.id !== undefined && row.id !== id) {
        throw new AdapterMappingError('Code query row contains contradictory identities')
      }
      if ((type !== undefined && row.type !== type)
        || (parentId !== undefined && row.parentId !== parentId)) {
        throw new AdapterMappingError('Code query row does not match the requested filter')
      }
      if (ids.has(id) || values.has(value)) {
        throw new AdapterMappingError('Code query contains duplicate row identities or values')
      }
      ids.add(id)
      values.add(value)
      items.push({ value, label })
    }
    if (items.length === total) return { items, totalCount: total }
  }
  throw new AdapterMappingError('Code query completeness was not proven within the page limit')
}
