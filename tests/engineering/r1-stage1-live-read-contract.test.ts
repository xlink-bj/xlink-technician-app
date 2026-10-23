import { describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'

// Synthetic identities only. Shapes come from the audited R1 Source → DB → API
// read contract; no production work-order payloads are copied into fixtures.
const runId = asOpaqueId<'WorkflowRunId'>('synthetic-run-1')
const parentNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-parent-node')
const definitionId = asOpaqueId<'FormDefinitionId'>('synthetic-form-def')
const dataId = asOpaqueId<'FormDataId'>('synthetic-form-data')

const rawNode = {
  _id: 'synthetic-node-1',
  workflowId: 'synthetic-run-1',
  nodeDef: { nodeType: 'repeat', name: 'Synthetic repeated form' },
}

describe('R1 Stage1 production read contracts — synthetic only', () => {
  it('maps queryNode data array and preserves source-defined workflow identity', async () => {
    const execute = vi.fn(async () => ({ data: [rawNode] }))
    const adapter = createTechnicianApiReadAdapter({ execute })
    const result = await adapter.getWorkflowNodes(runId)

    expect(result).toMatchObject({ state: 'succeeded', data: [{
      id: 'synthetic-node-1', runId: 'synthetic-run-1', sourceNodeType: 'repeat',
    }] })
    expect(execute).toHaveBeenCalledWith({ method: 'POST', path: 'workflow/queryNode/synthetic-run-1' })
  })

  it('continues to map nested legacy workflow data.items', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: { items: [rawNode] } }) })
    expect((await adapter.getWorkflowNodes(runId)).data?.[0]?.id).toBe('synthetic-node-1')
  })

  it('fails closed on malformed node envelopes and contradictory run identifiers', async () => {
    for (const response of [
      { data: {} },
      { data: [{ ...rawNode, workflowId: 'different-run' }] },
      { data: [{ ...rawNode, runId: 'synthetic-run-1', workflowId: 'different-run' }] },
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => response })
      expect((await adapter.getWorkflowNodes(runId)).state).toBe('failed_terminal')
    }
  })

  it('flattens child Workflow[] while preserving predecessor links inside the child run', async () => {
    const execute = vi.fn(async () => ({ data: [{
      _id: 'synthetic-child-run',
      parentFlowNodeId: 'synthetic-parent-node',
      workflowNodeList: [
        { _id: 'synthetic-entry-node', workflowId: 'synthetic-child-run', nodeDef: { nodeType: 'forms' } },
        { _id: 'synthetic-child-node', workflowId: 'synthetic-child-run',
          parentWorkflowNodeId: 'synthetic-entry-node', nodeDef: { nodeType: 'repeat' } },
      ],
    }] }))
    const adapter = createTechnicianApiReadAdapter({ execute })
    const result = await adapter.getChildWorkflowNodes(parentNodeId)

    expect(result).toMatchObject({ state: 'succeeded', data: [
      { id: 'synthetic-entry-node', runId: 'synthetic-child-run', sourceNodeType: 'forms' },
      { id: 'synthetic-child-node', runId: 'synthetic-child-run',
        parentNodeId: 'synthetic-entry-node', sourceNodeType: 'repeat' },
    ] })
    expect(result.data?.[0]).not.toHaveProperty('parentNodeId')
    expect(result.data?.[1]?.parentNodeId).not.toBe(parentNodeId)
    expect(execute).toHaveBeenCalledWith({
      method: 'POST', path: 'workflow/queryByParentWorkflowNodeId/synthetic-parent-node',
    })
  })

  it('accepts an explicit zero-child-workflow response', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [] }) })
    expect(await adapter.getChildWorkflowNodes(parentNodeId)).toEqual({ state: 'succeeded', data: [] })
  })

  it('rejects a child Workflow without its node list, or a mismatched outer parent/run identity', async () => {
    for (const workflow of [
      { _id: 'synthetic-child-run' },
      { _id: 'synthetic-child-run', workflowNodeList: [{}] },
      { _id: 'synthetic-child-run', parentNodeId: 'other-parent', workflowNodeList: [] },
      { _id: 'synthetic-child-run', parentFlowNodeId: 'other-parent', workflowNodeList: [] },
      { _id: 'synthetic-child-run', parentFlowNodeId: 'synthetic-parent-node',
        parentNodeId: 'other-parent', workflowNodeList: [] },
      { _id: 'synthetic-child-run', workflowNodeList: [{ _id: 'node', workflowId: 'other-run' }] },
      { _id: 'synthetic-child-run', workflowNodeList: [{ _id: 'node', runId: 'synthetic-child-run', workflowId: 'other-run' }] },
      { _id: 'synthetic-child-run', workflowNodeList: [{ _id: 'node', parentNodeId: 'previous-a',
        parentWorkflowNodeId: 'previous-b' }] },
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [workflow] }) })
      expect((await adapter.getChildWorkflowNodes(parentNodeId)).state).toBe('failed_terminal')
    }
  })

  it('maps an exact-ID ordinary FormData row without formDefId from the URL definition', async () => {
    const execute = vi.fn(async () => ({ data: [{
      _id: 'synthetic-form-data', workflowId: 'synthetic-run-1',
      nodeId: 'synthetic-node-1', exts: { answer: 'synthetic value' },
    }], total: 1, page: 1, rows: 2 }))
    const adapter = createTechnicianApiReadAdapter({ execute })
    const result = await adapter.getFormDetail({ definitionId, dataId })

    expect(result).toMatchObject({ state: 'succeeded', data: {
      id: 'synthetic-form-data', definitionId: 'synthetic-form-def',
      workflowRunId: 'synthetic-run-1',
      values: { answer: 'synthetic value' },
    } })
    expect(execute).toHaveBeenCalledWith({
      method: 'POST', path: 'biz/extForm/query/synthetic-form-def',
      body: { sortField: 'createTime', sortOrder: 'desc',
        'is:_id|string#and': 'synthetic-form-data', page: 1, rows: 2 },
    })
  })

  it('maps FormData list rows without definition metadata only within a named definition query', async () => {
    const execute = vi.fn(async () => ({ data: [{
      _id: 'synthetic-form-data', exts: { answer: 'synthetic value' },
    }], total: 1 }))
    const adapter = createTechnicianApiReadAdapter({ execute })
    expect(await adapter.getFormData({ definitionId, dataId })).toMatchObject({
      state: 'succeeded', data: { items: [{ id: 'synthetic-form-data', definitionId: 'synthetic-form-def' }] },
    })
    expect(execute).toHaveBeenCalledWith({
      method: 'POST', path: 'biz/extForm/query/synthetic-form-def',
      body: { sortField: 'createTime', sortOrder: 'desc', 'is:_id|string#and': 'synthetic-form-data' },
    })
  })

  it('rejects a FormData definition contradiction even with a valid exact record ID', async () => {
    for (const item of [
      { _id: 'synthetic-form-data', formDefId: 'other-definition' },
      { _id: 'synthetic-form-data', formDefId: 'synthetic-form-def', extId: 'other-definition' },
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [item] }) })
      expect((await adapter.getFormDetail({ definitionId, dataId })).state).toBe('failed_terminal')
    }
  })

  it('retains exact saved-ID proof when FormData omits formDefId', async () => {
    for (const rows of [[], [{ _id: 'wrong-synthetic-form-data' }], [
      { _id: 'synthetic-form-data' }, { _id: 'synthetic-form-data' },
    ]]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: rows }) })
      expect((await adapter.getFormDetail({ definitionId, dataId })).state).toBe('failed_terminal')
    }
  })
})
