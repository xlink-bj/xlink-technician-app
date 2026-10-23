import { describe, expect, it, vi } from 'vitest'
import { buildR1RepeatFormListQuery, readR1NodeFormList } from '@adapters/api/r1-node-form-list'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import {
  mockDetailScenarioIds, mockStatusOptionsResponse,
  mockWorkOrderDetailResponseFor,
} from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'

describe('F1 R1 multi-form existing records — source-bound, privacy-safe read', () => {
  it('reads forms from node.exts.formList and strips raw customer / form values', () => {
    const list = readR1NodeFormList({ exts: { formList: [
      { _id: 'f1', formDefId: 'def1', formTitle: '防水勘察表', state: 1, customerPhone: 'secret', exts: { comment: 'sensitive' } },
      { _id: 'f2', formDefId: 'def1', state: -1, values: { note: 'private' } },
    ] } }, 'forms')
    expect(list).toEqual({
      source: 'exts.formList', evidence: 'available', truncated: false, entries: [
        { id: 'f1', formDefinitionId: 'def1', title: '防水勘察表', state: 'active' },
        { id: 'f2', formDefinitionId: 'def1', state: 'deleted' },
      ],
    })
    expect(JSON.stringify(list)).not.toContain('secret')
    expect(JSON.stringify(list)).not.toContain('private')
  })
  it('reads repeat only from explicit formDataList and never fabricates an empty query result', () => {
    const repeat = readR1NodeFormList({ formDataList: [{ _id: 'a', state: 1 }, { _id: 'b', state: 0 }] }, 'repeat')
    expect(repeat).toMatchObject({ source: 'formDataList', evidence: 'available', entries: [
      { id: 'a', state: 'active' }, { id: 'b', state: 'unknown' },
    ] })
    expect(readR1NodeFormList({ exts: { formList: [] } }, 'repeat')).toBeUndefined()
    expect(readR1NodeFormList({}, 'forms')).toBeUndefined()
    expect(readR1NodeFormList({}, 'subflows')).toBeUndefined()
  })
  it('denies malformed or duplicate record references instead of showing an authoritative count', () => {
    for (const formList of [[{ _id: 'a' }, { _id: 'a' }], [{ fake: 'id' }], 'bad']) {
      expect(readR1NodeFormList({ exts: { formList } }, 'forms'))
        .toEqual({ source: 'exts.formList', evidence: 'invalid', entries: [], truncated: false })
    }
  })
  it('bounds list views and explicitly marks them incomplete', () => {
    const entries = Array.from({ length: 73 }, (_, i) => ({ _id: `f-${i}`, state: 1 }))
    const list = readR1NodeFormList({ exts: { formList: entries } }, 'forms')
    expect(list?.entries).toHaveLength(50)
    expect(list?.truncated).toBe(true)
  })
  it('encodes original R1 repeat query with effective workflowId and bounded FlipPageInfo', () => {
    const req = buildR1RepeatFormListQuery({
      definitionId: asOpaqueId<'FormDefinitionId'>('def-repeat'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('child-workflow-run'),
      page: 1, pageSize: 10,
    })
    expect(req).toEqual({
      method: 'POST', path: 'biz/extForm/query/def-repeat',
      body: {
        sortField: 'createTime', sortOrder: 'desc',
        'is:workflowId|string#and': 'child-workflow-run',
        'ne:state|integer#and': -1,
        page: 1, rows: 10,
      },
    })
    for (const [page,pageSize] of [[0,10],[1,0],[1,21],[11,10]]) {
      expect(() => buildR1RepeatFormListQuery({
        definitionId: asOpaqueId<'FormDefinitionId'>('def-repeat'),
        workflowRunId: asOpaqueId<'WorkflowRunId'>('child-run'),
        page, pageSize,
      })).toThrow()
    }
  })
  it('reads only scoped repeat references from a synthetic transport without returning form values', async () => {
    const execute = vi.fn(async () => ({ data: [
      { _id: 'saved-repeat-1', state: 1, formTitle: '合成重复记录', phone: 'private' },
    ], total: 1, page: 1, rows: 10 }))
    const adapter = createTechnicianApiReadAdapter({execute})
    const result = await adapter.listRepeatFormReferences!({
      definitionId: asOpaqueId<'FormDefinitionId'>('def-repeat'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('verified-child-workflow'),
      page: 1, pageSize: 10,
    })
    expect(result.state).toBe('succeeded')
    expect(result.data?.items).toEqual([{ id: 'saved-repeat-1', title: '合成重复记录', state: 'active' }])
    expect(JSON.stringify(result.data)).not.toContain('private')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({body: expect.objectContaining({
      'is:workflowId|string#and': 'verified-child-workflow',
    })}))
    const denied = await adapter.listRepeatFormReferences!({
      definitionId: asOpaqueId<'FormDefinitionId'>('def-repeat'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('verified-child-workflow'),
      page: 0, pageSize: 30,
    })
    expect(denied.error?.category).toBe('validation')
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('preserves real-shaped already-read forms evidence through the existing authorized detail adapter', async () => {
    const id = mockDetailScenarioIds[0]
    const original = mockWorkOrderDetailResponseFor(id)
    expect(original).toBeTruthy()
    const detail = JSON.parse(JSON.stringify(original)) as {
      data: { workflowNode: Array<Record<string, unknown>> }
    }
    const first = detail.data.workflowNode.find(node => (node.nodeDef as { nodeType?: string })?.nodeType === 'forms')
    expect(first).toBeDefined()
    first!.exts = { formList: [
      { _id: 'synthetic-record-1', formDefId: 'synthetic-definition', formTitle: '合成表单一', state: 1 },
    ] }
    const transport = { execute: vi.fn(async ({path}:{path:string}) =>
      path === 'code/query' ? mockStatusOptionsResponse : detail) }
    const result = await createTechnicianApiReadAdapter(transport).getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(id))
    expect(result.state).toBe('succeeded')
    const node = result.data?.workflowNodes?.find(x => x.sourceNodeType === 'forms')
    expect(node?.formList).toMatchObject({ source: 'exts.formList', evidence: 'available', entries: [
      { id: 'synthetic-record-1', title: '合成表单一' },
    ] })
    expect(node).not.toHaveProperty('exts')
    expect(node).not.toHaveProperty('nodeDef')
    expect(transport.execute).toHaveBeenCalled()
  })
})
