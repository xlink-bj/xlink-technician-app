import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tryMockRead, resetMockCommandState } from '@adapters/api/mock/router'
import { mockCommandState } from '@adapters/api/mock/command-state'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/fixtures'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'

beforeEach(() => {
  vi.stubEnv('DEV', true); vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true'); vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', { getStorageSync: () => '' })
  resetBusinessMockCache(); resetMockCommandState(); setBusinessMockMode('data')
})
afterEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetBusinessMockCache(); resetMockCommandState()
})

describe.each([['appointment', appointmentFormDefinitionWireId], ['Survey', mockSurveyFormDefinitionId]])(
  '%s exact FormData query follows the existing R1 filtered-page subset', (model, definitionId) => {
    function fixture(state = 1) {
      const record = { _id: 'mock-exact-' + model, extId: definitionId, formDefId: definitionId, tenantId: 'mock-tenant-exact',
        sid: 'mock-work-order-exact', nodeId: 'mock-node-exact', workflowId: 'mock-run-exact', state,
        createTime: '2026-11-14 10:00:00', exts: { memo: 'synthetic only', audit: { retained: true } } }
      mockCommandState().formData.set(record._id, record)
      const body = { 'is:_id|string#and': record._id, 'is:sid|string#and': record.sid,
        'is:nodeId|string#and': record.nodeId, 'is:workflowId|string#and': record.workflowId,
        'ne:state|integer#and': -1, page: 1, rows: 2, sortField: 'createTime', sortOrder: 'desc' }
      const read = (patch: Record<string, unknown> = {}) => tryMockRead(`biz/extForm/query/${definitionId}`,
        { ...body, ...patch }, { latencyMs: 0 })
      return { record, read }
    }
    it('echoes the real scoped reader row bound and preserves the complete raw value', async () => {
      const f = fixture(), before = JSON.stringify([...mockCommandState().formData])
      expect(await f.read()).toEqual({ data: [f.record], total: 1, page: 1, rows: 2, size: 2, dataCount: 1, pages: 1 })
      expect(JSON.stringify([...mockCommandState().formData])).toBe(before)
    })
    it('lets the real scoped forms reader discover and independently select an owned record', async () => {
      const f = fixture(), scope = { tenantId: f.record.tenantId, workOrderId: f.record.sid,
        runtimeNodeId: f.record.nodeId, workflowRunId: f.record.workflowId, formDefinitionId: definitionId,
        sourceNodeType: 'forms' as const }
      const reader = createR1ScopedFormReader({ scope, isCurrent: () => true,
        transport: { execute: request => tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 }) },
        formList: { source: 'exts.formList', evidence: 'available', truncated: false,
          entries: [{ id: f.record._id as never, state: 'active' }] } })
      expect((await reader.discover()).map(row => String(row.data.id))).toEqual([f.record._id])
      expect((await reader.select(f.record._id)).ownership).toEqual(scope)
    })
    it.each(['sid', 'nodeId', 'workflowId'])('intersects exact ID with %s instead of exposing a sibling scope', async key => {
      const f = fixture()
      expect(await f.read({ [`is:${key}|string#and`]: 'another-scope' })).toMatchObject({ data: [], total: 0 })
    })
    it('applies state exclusion before returning an exact row', async () => {
      const f = fixture(-1)
      expect(await f.read()).toMatchObject({ data: [], total: 0 })
    })
    it('honors an empty later page without rewriting the total', async () => {
      const f = fixture()
      expect(await f.read({ page: 2 })).toEqual({ data: [], total: 1, page: 2, rows: 2, size: 2, dataCount: 0, pages: 1 })
    })
    it.each([{ rows: 0 }, { page: 0 }, { _all: 1 }, { 'is:unknown|string#and': 'x' }])(
      'rejects an unsupported exact query %j rather than widening it', async patch => {
        expect(await fixture().read(patch)).toMatchObject({ success: false })
      })
  },
)
