import { describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from '@features/work-orders/action-form-schema'
import { evaluateFieldState, normalizeFieldValue, normalizeSubmission } from '@runtimes/dynamic-form'
import { projectR1MaterialSku } from '@shared/material-sku-contract'
import { isProductionReadOnlyReadAllowed } from '@shared/config'
import { asOpaqueId } from '@shared/types'

// Source-pinned to xlink-app@6c0a97b serviceAppointment.vue and placeOrders.vue.
// All payloads below are SYNTHETIC, not fresh Production or tenant samples.
const run = asOpaqueId<'WorkflowRunId'>('matrix-run')
const parent = asOpaqueId<'WorkflowNodeRuntimeId'>('matrix-outer-parent')
const formDefinitionId = asOpaqueId<'FormDefinitionId'>('matrix-form-def')
const orderWorkOrderId = 'matrix-work-order'
const orderId = 'matrix-order'

function fieldRecord(type: string, extra: Record<string, unknown> = {}) {
  return {
    _id: `matrix-${type}`, extId: 'matrix-form-def', name: type,
    nameDisp: `Source ${type}`, required: '1', showList: ['4'], type, ...extra,
  }
}

function officialOrder(extra: Record<string, unknown> = {}) {
  return {
    _id: orderId, type: 1, serviceAppointmentId: orderWorkOrderId,
    bjProducts: { orderList: [{
      repairParts: ['roof'], projPackages: { data: [] },
      procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
    }] }, ...extra,
  }
}

describe('R1 three-pillar source-backed contract matrix — synthetic only', () => {
  it('classifies explicit child nodeDef action types without converting an unresolved child into an action', async () => {
    const types = ['forms', 'repeat', 'subflows', 'placeOrder', 'user', 'accept', 'allot', 'dispatch', 'system', 'sentinel', 'unseen']
    const execute = vi.fn(async (_request: unknown) => ({ data: [{
      _id: 'matrix-child-run', parentFlowNodeId: 'matrix-outer-parent',
      workflowNodeList: [...types.map((nodeType, index) => ({
        _id: `node-${index}`, workflowId: 'matrix-child-run',
        nodeDef: { nodeType },
        ...(index === 1 ? { parentWorkflowNodeId: 'node-0' } : {}),
      })), { _id: 'node-missing', workflowId: 'matrix-child-run' }],
    }] }))
    const result = await createTechnicianApiReadAdapter({ execute }).getChildWorkflowNodes(parent)
    expect(result.state).toBe('succeeded')
    expect(result.data?.map(node => node.category)).toEqual([
      'forms', 'repeat', 'subworkflow', 'placeOrder', 'user', 'accept', 'allot',
      'dispatch', 'system', 'sentinel', 'unsupported', 'unsupported',
    ])
    expect(result.data?.map(node => node.nodeTypeEvidence)).toEqual([
      ...Array(11).fill('runtime_node_def'), 'unresolved',
    ])
    expect(result.data?.[1]?.parentNodeId).toBe('node-0')
    expect(result.data?.[11]?.sourceNodeType).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[0]).toEqual({ method: 'POST', path: 'workflow/queryByParentWorkflowNodeId/matrix-outer-parent' })
  })

  it('does not infer child runtime types from a separate definition array or positional indexes', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [{
      _id: 'matrix-child-run', parentFlowNodeId: 'matrix-outer-parent',
      def: { nodes: [{ nodeType: 'repeat' }] },
      workflowNodeList: [{ _id: 'runtime-node', workflowId: 'matrix-child-run' }],
    }] }) })
    const child = (await adapter.getChildWorkflowNodes(parent)).data?.[0]
    expect(child).toMatchObject({ category: 'unsupported', nodeTypeEvidence: 'unresolved' })
    expect(child?.formDefinitionId).toBeUndefined()
  })

  it('projects R1 mobile detail visibility and presentation-only image/title fields, without upload capability', async () => {
    const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [
      fieldRecord('image', { frontEndConfig: JSON.stringify({ list: ['https://synthetic.invalid/guide.jpg'] }) }),
      fieldRecord('title'),
      fieldRecord('switch', { frontEndConfig: JSON.stringify({ mpDetailHide: true }) }),
      fieldRecord('checkbox', { options: [{ value: 'roof', label: '屋顶' }] }),
    ] }) })
    const fields = (await adapter.getFormDefinition(formDefinitionId)).data!.fields!
    expect(fields.map(field => field.fieldId)).toEqual(['matrix-image', 'matrix-title', 'matrix-switch', 'matrix-checkbox'])
    expect(fields[0]).toMatchObject({ presentationOnly: true, type: 'image' })
    expect(fields[1]).toMatchObject({ presentationOnly: true, type: 'title' })
    expect(fields[2]).toMatchObject({ mobileDetailHidden: true })
    expect(evaluateFieldState(actionFormSchemaFor(fields[0]!), { surface: ACTION_FORM_SURFACE }).capability)
      .toBe('PRESENTATION_ONLY')
    expect(evaluateFieldState(actionFormSchemaFor(fields[2]!), { surface: ACTION_FORM_SURFACE }).visible)
      .toBe(false)
    const submission = normalizeSubmission({ fields: fields.map(field => actionFormSchemaFor(field)),
      surface: ACTION_FORM_SURFACE,
      values: { image: 'unverified-upload', title: 'unverified', switch: '1', checkbox: ['roof'] },
    })
    expect(submission).toEqual({ ok: true, value: { values: { checkbox: ['roof'] } } })
    expect(JSON.stringify(fields)).not.toContain('guide.jpg')
  })

  it('keeps van-switch wire values 1/0, checkbox arrays, and refuses invented area serialization', () => {
    expect(normalizeFieldValue('switch', '1')).toEqual({ ok: true, value: '1' })
    expect(normalizeFieldValue('switch', '0')).toEqual({ ok: true, value: '0' })
    expect(normalizeFieldValue('checkbox', ['one', 'two'])).toEqual({ ok: true, value: ['one', 'two'] })
    expect(normalizeFieldValue('checkbox', 'one')).toMatchObject({ ok: false, reason: 'invalid_value' })
    expect(normalizeFieldValue('area', ['province', 'city'])).toMatchObject({ ok: false, reason: 'unsupported_field_type' })
  })

  it('fails closed for malformed mobile applicability and frontend hide metadata', async () => {
    for (const input of [
      fieldRecord('text', { showList: ['4', {}] }),
      fieldRecord('text', { showList: '4' }),
      fieldRecord('text', { frontEndConfig: '{malformed' }),
      fieldRecord('text', { frontEndConfig: '{"mpDetailHide":"false"}' }),
    ]) {
      const adapter = createTechnicianApiReadAdapter({ execute: async () => ({ data: [input] }) })
      const field = (await adapter.getFormDefinition(formDefinitionId)).data?.fields?.[0]
      expect(field?.unsupportedReason).toBeTruthy()
    }
  })

  it('rejects SKU alias conflicts before a wrong SPU or SKU reaches a selection preview', async () => {
    const ctx = { workOrderId: asOpaqueId<'WorkOrderId'>(orderWorkOrderId), serviceType: 'waterproof' }
    for (const sku of [
      { _id: 'sku-a', id: 'sku-b', spuid: 'spu-a' },
      { _id: 'sku-a', spuid: 'spu-a', spuId: 'spu-b' },
    ]) {
      const catalog = createQuotationCatalogReadAdapter({ execute: async () => ({ data: [
        { ...sku, state: 1, name: 'Synthetic SKU' },
      ] }) })
      expect((await catalog.listMaterialSkuVariants!(ctx, 'direct_material', ['spu-a'])).state).toBe('failed_terminal')
    }
  })

  it('rejects an explicit contradictory SKU alias in the pure SPU-selection contract', () => {
    const spu = { _id: 'spu-a', exts: { color: ['black'] } }
    const salesFields = [{ name: 'color', nameDisp: '颜色', valueOption: 'colors',
      colName: 'material', state: 1, frontEndConfig: '{"salesAttribute":true}' }]
    const sku = { _id: 'sku-a', spuid: 'spu-a', exts: { color: 'black' }, state: 1 }
    expect(projectR1MaterialSku({ spu, salesFields, skuRows: [{ ...sku, id: 'sku-other' }] }))
      .toMatchObject({ state: 'blocked' })
    expect(projectR1MaterialSku({ spu, salesFields, skuRows: [{ ...sku, spuId: 'spu-other' }] }))
      .toMatchObject({ state: 'blocked' })
  })

  it('does not combine conflicting SKU/SPU provenance from Order line and its nested material', async () => {
    for (const line of [
      { spuid: 'spu-a', material: { name: 'Synthetic material', spuid: 'spu-b' } },
      { skuId: 'sku-a', material: { name: 'Synthetic material', skuId: 'sku-b' } },
    ]) {
      const order = officialOrder({ bjProducts: { orderList: [{
        repairParts: ['roof'], projPackages: { data: [] }, procedures: { data: [] },
        materials: { data: [line] }, measures: { data: [] },
      }] } })
      const adapter = createQuotationOrderReadAdapter({ execute: async () => ({ data: [order] }) }, () => true)
      expect((await adapter.listTypeOneOrdersForWorkOrder(orderWorkOrderId)).state).toBe('failed_terminal')
    }
  })

  it('honors R1 Contract state=1 OR exts.contractStatus=-2 and rejects a contradictory query row', async () => {
    const read = async (contract: Record<string, unknown>) => createQuotationOrderReadAdapter({
      execute: async request => request.path === 'basic/order/query'
        ? { data: [officialOrder()] }
        : { data: [{ _id: 'contract-a', orderId, serviceAppointmentId: orderWorkOrderId, ...contract }] },
    }, () => true, () => 'synthetic-role-session', () => true)
      .listR1ContractsForSigningReview!(orderWorkOrderId, orderId)
    expect((await read({ state: 1, exts: { contractStatus: '2' } })).state).toBe('succeeded')
    expect((await read({ state: 0, exts: { contractStatus: '-2' } })).state).toBe('succeeded')
    expect((await read({ state: 0, exts: { contractStatus: '2' } })).state).toBe('failed_terminal')
    expect(isProductionReadOnlyReadAllowed({ method: 'POST', path: 'basic/contract/query.do' })).toBe(false)
    expect(isProductionReadOnlyReadAllowed({ method: 'POST', path: 'workflowDef/queryById/private-def' })).toBe(false)
  })

  it('retains source-valid negative Order and Contract lifecycle states instead of erasing them', async () => {
    const row = officialOrder({ state: -1, processState: -2 })
    const transport = { execute: async (request: { path: string }) => request.path === 'basic/order/queryById'
      ? { data: row }
      : { data: [row] } }
    const adapter = createQuotationOrderReadAdapter(transport, () => true)
    const list = await adapter.listTypeOneOrdersForWorkOrder(orderWorkOrderId)
    expect(list).toMatchObject({
      state: 'succeeded', data: { items: [{ state: -1, processState: -2 }] },
    })
    const detail = await adapter.getQuotationOrderById(orderId)
    expect(detail).toMatchObject({ state: 'succeeded', data: { state: -1, processState: -2 } })

    const contract = createQuotationOrderReadAdapter({
      execute: async (request) => request.path === 'basic/order/query'
        ? { data: [officialOrder()] }
        : { data: [{ _id: 'contract-cancelled', orderId, serviceAppointmentId: orderWorkOrderId,
          state: -1, exts: { contractStatus: '-2' } }] },
    }, () => true, () => 'synthetic-role-session', () => true)
    expect(await contract.listR1ContractsForSigningReview!(orderWorkOrderId, orderId))
      .toMatchObject({ state: 'succeeded', data: { items: [{ state: -1, contractStatus: '-2' }] } })
  })

  it('does not turn missing or malformed lifecycle codes into a valid zero-state action', async () => {
    for (const raw of [null, '', 'not-a-status', 1.25, Number.POSITIVE_INFINITY]) {
      const adapter = createQuotationOrderReadAdapter({
        execute: async () => ({ data: [officialOrder({ state: raw, processState: raw })] }),
      }, () => true)
      const result = await adapter.listTypeOneOrdersForWorkOrder(orderWorkOrderId)
      expect(result.state).toBe('succeeded')
      expect(result.data?.items[0]).not.toHaveProperty('state')
      expect(result.data?.items[0]).not.toHaveProperty('processState')
    }
  })
})
