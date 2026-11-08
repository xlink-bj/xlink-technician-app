import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { tryMockRead, resetMockCommandState } from '@adapters/api/mock/router'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { mockCommandState } from '@adapters/api/mock/command-state'
import { mockR1FormData, mockSyntheticDynamicFormDefinitionId as definition } from '@adapters/api/mock/fixtures'
import { asOpaqueId } from '@shared/types'
import { queryMockR1FormRows } from '@adapters/api/mock/r1-form-query'

const path = `biz/extForm/query/${definition}`
const query = { 'is:workflowId|string#and': 'mock-workflow-run-021',
  'ne:state|integer#and': -1, sortField: 'createTime', sortOrder: 'desc', page: 1, rows: 1 }
const read = (body: Record<string, unknown>) => tryMockRead(path, body, { latencyMs: 0 })
beforeEach(() => {
  vi.stubEnv('DEV', true); vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true'); vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', { getStorageSync: () => '' })
  resetBusinessMockCache(); resetMockCommandState(); setBusinessMockMode('data')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetBusinessMockCache(); resetMockCommandState() })

describe('R1 synthetic repeat query uses the requested filter and page contract', () => {
  it('real adapter can read bounded pages without oversized-page mapping failure', async () => {
    const execute = async (request: ApiReadRequest) => {
      const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
      if (raw === null) throw Error('Unknown API; no network fallback')
      return raw
    }
    const api = createTechnicianApiReadAdapter({ execute })
    const ids: string[] = []
    for (const page of [1, 2]) {
      const result = await api.listRepeatFormReferences!({ definitionId: asOpaqueId<'FormDefinitionId'>(definition),
        workflowRunId: asOpaqueId<'WorkflowRunId'>('mock-workflow-run-021'), page, pageSize: 1 })
      expect(result.state).toBe('succeeded')
      expect(result.data).toMatchObject({ page, pageSize: 1, totalCount: 2 })
      ids.push(...result.data!.items.map(row => String(row.id)))
    }
    expect(new Set(ids)).toEqual(new Set([mockR1FormData.repeatFirst, mockR1FormData.repeatSecond]))
    expect(await read({ ...query, page: 3 })).toMatchObject({ data: [], page: 3, rows: 1, total: 2 })
  })
  it('exact ID and workflow filters intersect, rather than accepting a sibling run', async () => {
    expect(await read({ ...query, 'is:_id|string#and': mockR1FormData.repeatFirst,
      'is:workflowId|string#and': 'another-run' })).toMatchObject({ data: [], total: 0 })
  })
  it('echoes the exact-read row bound used by the real scoped reader', async () => {
    expect(await read({ 'is:_id|string#and': mockR1FormData.repeatFirst, page: 1, rows: 2 }))
      .toMatchObject({ page: 1, rows: 2, total: 1, data: [{ _id: mockR1FormData.repeatFirst }] })
  })
  it('applies known ownership filters; missing historical ownership is not fabricated', async () => {
    expect(await read({ ...query, 'is:sid|string#and': 'another-order' })).toMatchObject({ total: 0, data: [] })
    expect(await read({ ...query, 'is:nodeId|string#and': 'another-node' })).toMatchObject({ total: 0, data: [] })
  })
  it('does not broaden invalid paging or unsupported filters to a successful full list', async () => {
    for (const extra of [{ page: 0 }, { rows: 0 }, { page: 1.5 }, { rows: 201 }, { 'is:unknown|string#and': 'x' }]) {
      expect(await read({ ...query, ...extra })).toMatchObject({ success: false })
    }
  })
  it('filters state before pagination, keeps total and preserves raw metadata', async () => {
    const source = { _id: 'mock-special-form-data-repeat-101', extId: definition,
      workflowId: 'mock-workflow-run-021', sid: 'mock-work-order-021-local-repeat',
      nodeId: 'mock-workflow-node-021-repeat', state: 1,
      createTime: '2026-01-01 12:00:00', exts: { audit: { retained: true } } }
    mockCommandState().formData.set(source._id, source)
    mockCommandState().formData.set('mock-special-form-data-repeat-102', { ...source,
      _id: 'mock-special-form-data-repeat-102', state: -1 })
    const first = await read(query) as { data: unknown[]; total: number }
    expect(first.total).toBe(3)
    expect(first.data).toEqual([source])
    const before = JSON.stringify([...mockCommandState().formData])
    const owned = { ...query, 'is:_id|string#and': source._id,
      'is:sid|string#and': source.sid, 'is:nodeId|string#and': source.nodeId }
    expect(await read(owned)).toMatchObject({ total: 1, data: [source] })
    expect(await read({ ...owned, 'is:nodeId|string#and': 'another-node' })).toMatchObject({ total: 0, data: [] })
    expect(JSON.stringify([...mockCommandState().formData])).toBe(before)
    expect(await read({ ...query, 'is:_id|string#and': 'mock-special-form-data-repeat-102' }))
      .toMatchObject({ data: [], total: 0 })
  })
  it('sorts retained timestamps before paging without mutating raw records or inventing missing dates', () => {
    const rows = [
      { _id: 'old', createTime: '2026-01-01 01:00:00', exts: { unknown: ['retained'] } },
      { _id: 'missing' }, { _id: 'new', createTime: '2026-01-02 01:00:00' },
    ]
    const original = structuredClone(rows)
    expect(queryMockR1FormRows(rows, { sortField: 'createTime', sortOrder: 'desc', rows: 1, page: 1 }))
      .toMatchObject({ total: 3, data: [{ _id: 'new' }] })
    expect(queryMockR1FormRows(rows, { sortField: 'createTime', sortOrder: 'asc', rows: 1, page: 1 }))
      .toMatchObject({ total: 3, data: [rows[0]] })
    expect(rows).toEqual(original)
    expect(queryMockR1FormRows(rows, { sortField: 'createTime', sortOrder: 'desc', rows: 1, page: 3 }))
      .toMatchObject({ total: 3, data: [{ _id: 'missing' }] })
  })
  it('known state exclusion and exact identity are intersected before computing total', () => {
    const rows = [{ _id: 'active', state: 1 }, { _id: 'deleted', state: -1 }]
    expect(queryMockR1FormRows(rows, { 'ne:state|integer#and': -1, rows: 1, page: 1 }))
      .toMatchObject({ total: 1, data: [rows[0]] })
    expect(queryMockR1FormRows(rows, { 'ne:state|integer#and': -1, 'is:_id|string#and': 'deleted' }))
      .toMatchObject({ total: 0, data: [] })
  })

  it('echoes FlipInfo size/pages/dataCount for first, last and empty pages', async () => {
    expect(await read(query)).toMatchObject({ page: 1, rows: 1, size: 1, pages: 2, dataCount: 1, total: 2 })
    expect(await read({ ...query, page: 3 })).toMatchObject({ page: 3, rows: 1, size: 1, pages: 2, dataCount: 0, total: 2 })
    expect(await read({ ...query, 'is:workflowId|string#and': 'missing' }))
      .toMatchObject({ total: 0, pages: 0, dataCount: 0 })
  })
  it('returns detached JSON rows without granting a caller mutation of shared source metadata', () => {
    const source = [{ _id: 'one', exts: { audit: { value: 'before' } } }]
    const response = queryMockR1FormRows(source, {}) as { data: typeof source }
    response.data[0]!.exts.audit.value = 'caller'
    expect(source[0]!.exts.audit.value).toBe('before')
  })
  it('snapshots rows before router latency so later in-place updates cannot rewrite a started read', async () => {
    vi.useFakeTimers()
    const source = { _id: 'mock-special-form-data-repeat-201', extId: definition,
      workflowId: 'mock-workflow-run-021', sid: 'mock-work-order-021-local-repeat', state: 1,
      exts: { inspectionSummary: 'read-start' } }
    mockCommandState().formData.set(source._id, source)
    const pending = tryMockRead(path, { 'is:_id|string#and': source._id }, { latencyMs: 20 })
    source.exts.inspectionSummary = 'later-write'
    await vi.advanceTimersByTimeAsync(20)
    expect(await pending).toMatchObject({ data: [{ exts: { inspectionSummary: 'read-start' } }] })
    expect(source.exts.inspectionSummary).toBe('later-write')
  })

  it('uses backend ascending order when createTime sortOrder is omitted', () => {
    expect(queryMockR1FormRows([{ _id: 'new', createTime: '2026-02-02' }, { _id: 'old', createTime: '2026-01-01' }],
      { sortField: 'createTime', page: 1, rows: 1 })).toMatchObject({ data: [{ _id: 'old' }] })
  })

})
