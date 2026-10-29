import { describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { readR1NodeFormList } from '@adapters/api/r1-node-form-list'
import { asOpaqueId } from '@shared/types'

// These payloads are deliberately synthetic. They exercise source-mapped R1
// identity/wrapper contracts, not real tenant values or live API permissions.
const formDef = asOpaqueId<'FormDefinitionId'>('synthetic-definition')
const savedId = asOpaqueId<'FormDataId'>('synthetic-saved')
const workflowRun = asOpaqueId<'WorkflowRunId'>('synthetic-run')

describe('R1 model boundary — source-aligned negative contract cases', () => {
  it('does not turn contradictory WorkflowDefinition identities into the requested definition', async () => {
    const definition = asOpaqueId<'WorkflowDefinitionId'>('synthetic-workflow-def')
    for (const wire of [
      { data: { _id: 'different-workflow-def' } },
      { data: { id: 'synthetic-workflow-def', defId: 'different-workflow-def' } },
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => wire })
      expect((await adapter.getWorkflowDefinition(definition)).state).toBe('failed_terminal')
    }
    const matching = createTechnicianApiReadAdapter({
      execute: async () => ({ data: { _id: 'synthetic-workflow-def' } }),
    })
    expect((await matching.getWorkflowDefinition(definition)).data?.id).toBe(definition)
  })

  it('refuses contradictory run/predecessor identities on inline detail nodes', async () => {
    for (const node of [
      { _id: 'synthetic-node', runId: 'other-run', workflowId: 'synthetic-run' },
      { _id: 'synthetic-node', parentNodeId: 'before-a', parentWorkflowNodeId: 'before-b' },
    ]) {
      const adapter = createTechnicianApiReadAdapter({
        execute: async (request) => request.path.includes('queryById')
          ? { data: { serviceAppointment: { _id: 'synthetic-workorder', workflowId: 'synthetic-run' },
            workflowNode: [{ ...node, nodeDef: { nodeType: 'repeat' } }] } }
          : { data: [] },
      })
      const result = await adapter.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-workorder'))
      expect(result.state).toBe('failed_terminal')
    }
  })

  it('rejects conflicting ExtField row IDs without confusing them with form definition IDs', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: [{ _id: 'field-row-a', id: 'field-row-b', extId: 'synthetic-definition',
        name: 'roofPosition', type: 'text' }],
    }) })
    expect((await adapter.getFormDefinition(formDef)).state).toBe('failed_terminal')
  })

  it('does not silently drop malformed ExtField rows and turn an incomplete form into a valid one', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: [
        { _id: 'field-one', extId: 'synthetic-definition', name: 'roofPosition', type: 'text' },
        { _id: 'field-two', extId: 'synthetic-definition', type: 'text' },
      ],
    }) })
    expect((await adapter.getFormDefinition(formDef)).state).toBe('failed_terminal')
  })

  it('retains distinct R1 ExtField rows that legitimately share a value key', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: [
        { _id: 'field-one', extId: 'synthetic-definition', name: 'roofPosition', type: 'text' },
        { _id: 'field-two', extId: 'synthetic-definition', name: 'roofPosition', type: 'text' },
      ],
    }) })
    expect((await adapter.getFormDefinition(formDef)).data?.fields?.map((row) => row.fieldId))
      .toEqual(['field-one', 'field-two'])
  })

  it('blocks nested Workflow identity that contradicts a saved FormData run', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: [{ _id: 'synthetic-saved', workflowId: 'synthetic-run',
        workflow: { workflowId: 'another-run' }, exts: { answer: 'synthetic' } }],
    }) })
    expect((await adapter.getFormDetail({ definitionId: formDef, dataId: savedId })).state).toBe('failed_terminal')
  })

  it('retains a matching nested run without requiring the optional run ID on all records', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: [{ _id: 'synthetic-saved', workflow: { workflowId: 'synthetic-run' } }],
    }) })
    expect((await adapter.getFormDetail({ definitionId: formDef, dataId: savedId })).data?.workflowRunId)
      .toBe('synthetic-run')
  })

  it('accepts the R1 construction-acceptance nested data.data wrapper and proves exact saved ID', async () => {
    const definitionId = asOpaqueId<'FormDefinitionId'>('3285058246984486156')
    const dataId = asOpaqueId<'FormDataId'>('synthetic-acceptance-saved')
    const execute = vi.fn(async () => ({ data: { data: {
      _id: 'synthetic-acceptance-saved', formDefId: '3285058246984486156',
      exts: { note: 'synthetic' },
    } } }))
    const adapter = createTechnicianApiReadAdapter({ execute })
    expect(await adapter.getFormDetail({ definitionId, dataId })).toMatchObject({
      state: 'succeeded', data: { id: 'synthetic-acceptance-saved',
        definitionId: '3285058246984486156', values: { note: 'synthetic' } },
    })
    expect(execute).toHaveBeenCalledWith({
      method: 'GET', path: 'biz/extForm/findByIdWithWorkflow',
      query: { extId: '3285058246984486156', id: 'synthetic-acceptance-saved' },
    })
  })

  it('rejects conflicting saved record identity on a nested construction-acceptance wrapper', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: { _id: 'other-record', data: { _id: 'synthetic-acceptance-saved' } },
    }) })
    expect((await adapter.getFormDetail({
      definitionId: asOpaqueId<'FormDefinitionId'>('3285058246984486156'),
      dataId: asOpaqueId<'FormDataId'>('synthetic-acceptance-saved'),
    })).state).toBe('failed_terminal')
  })

  it('rejects an exact-ID FormData query returning an unrelated or ambiguous row', async () => {
    for (const rows of [
      [{ _id: 'different-saved' }],
      [{ _id: 'synthetic-saved' }, { _id: 'different-saved' }],
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: rows }) })
      expect((await adapter.getFormData({ definitionId: formDef, dataId: savedId })).state).toBe('failed_terminal')
    }
  })

  it('does not certify exact FormData as unique when R1 total count contradicts the returned page', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({
      data: [{ _id: 'synthetic-saved' }], page: 1, rows: 2, total: 2,
    }) })
    expect((await adapter.getFormDetail({ definitionId: formDef, dataId: savedId })).state)
      .toBe('failed_terminal')
    expect((await adapter.getFormData({ definitionId: formDef, dataId: savedId })).state)
      .toBe('failed_terminal')
  })

  it('keeps repeat reference identity, definition and run aliases internally consistent', async () => {
    const base = { _id: 'synthetic-saved', workflowId: 'synthetic-run', formDefId: 'synthetic-definition', state: 1 }
    for (const row of [
      { ...base, id: 'other-saved' },
      { ...base, formDefinitionId: 'other-definition' },
      { ...base, runId: 'other-run' },
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [row] }) })
      expect((await adapter.listRepeatFormReferences!({
        definitionId: formDef, workflowRunId: workflowRun, page: 1, pageSize: 20,
      })).state).toBe('failed_terminal')
    }
    const legacy = readR1NodeFormList({ exts: { formList: [
      { _id: 'saved-a', id: 'saved-b', formDefId: 'synthetic-definition' },
    ] } }, 'forms')
    expect(legacy?.evidence).toBe('invalid')
    const contradictoryDefinition = readR1NodeFormList({ exts: { formList: [
      { _id: 'saved-a', formDefId: 'synthetic-definition', formDefinitionId: 'other-definition' },
    ] } }, 'forms')
    expect(contradictoryDefinition?.evidence).toBe('invalid')
  })

  it('rejects a contradictory Order ID even on the bounded Order list read', async () => {
    const adapter = createQuotationOrderReadAdapter({
      execute: async () => ({ data: [{
        _id: 'order-one', id: 'order-two', serviceAppointmentId: 'synthetic-workorder',
        type: 1, bjProducts: { orderList: [] },
      }] }),
    }, () => true)
    expect((await adapter.listTypeOneOrdersForWorkOrder('synthetic-workorder')).state).toBe('failed_terminal')
  })

  it('rejects contradictory Contract IDs on the read-only signing summary route', async () => {
    const adapter = createQuotationOrderReadAdapter({
      execute: async (request) => request.path === 'basic/contract/query.do'
        ? { data: [{ _id: 'contract-one', id: 'contract-two', orderId: 'order-one',
          serviceAppointmentId: 'synthetic-workorder' }] }
        : { data: [{ _id: 'order-one', type: 1, serviceAppointmentId: 'synthetic-workorder',
          bjProducts: { orderList: [] } }] },
    }, () => true, () => 'synthetic-role-session', () => true)
    expect((await adapter.listR1ContractsForSigningReview!(
      'synthetic-workorder', 'order-one',
    )).state).toBe('failed_terminal')
  })
})
