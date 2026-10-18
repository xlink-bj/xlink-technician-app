/**
 * Per-scenario synthetic command state transition engine.
 * Intentionally preserves R1-shaped mock payloads and state changes byte for
 * byte. No production command/transport or data fixture authority.
 *
 * The router gets one default engine whose injected current() is lazy; tests
 * construct independent engines backed by distinct MockCommandState stores.
 */
import { appointmentFormDefinitionWireId } from '../appointment-contract'
import type { MockCommandState } from './command-state'

export interface MockCommandStateReader {
  readonly current: () => MockCommandState
}

function mutableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function createMockCommandTransitionEngine({ current: mockCommandState }: MockCommandStateReader) {
function responseForDetail(id: string): unknown | null {
  return mockCommandState().detailResponses.get(id) ?? null
}

function listItemForWorkOrder(id: string): Record<string, unknown> | null {
  const envelope = mutableRecord(mockCommandState().listResponse)
  const items = envelope?.data
  if (!Array.isArray(items)) return null
  for (const item of items) {
    const record = mutableRecord(item)
    const data = mutableRecord(record?.data)
    if (data?._id === id) return record
  }
  return null
}

function detailDataForWorkOrder(id: string): Record<string, unknown> | null {
  const envelope = mutableRecord(responseForDetail(id))
  const payload = mutableRecord(envelope?.data)
  return mutableRecord(payload?.serviceAppointment)
}

function detailNodesForWorkOrder(id: string): unknown[] | null {
  const envelope = mutableRecord(responseForDetail(id))
  const payload = mutableRecord(envelope?.data)
  if (!payload) return null
  return Array.isArray(payload.workflowNode) ? payload.workflowNode : null
}

function acceptMockWorkOrder(id: string): void {
  const listItem = listItemForWorkOrder(id)
  const listNode = mutableRecord(listItem)
  if (listNode) {
    const listData = mutableRecord(listNode.data)
    if (listData) listData.status = 'mock-status-appointment-pending'
    listNode.nodeDef = { nodeType: 'forms', name: '预约上门时间', formDefId: appointmentFormDefinitionWireId, userChoose: ['synthetic-role'] }
    listNode.state = 0
  }

  const data = detailDataForWorkOrder(id)
  if (data) {
    data.status = 'mock-status-appointment-pending'
    const nodes = detailNodesForWorkOrder(id)
    if (nodes) {
      nodes.splice(0, nodes.length, {
        _id: 'mock-workflow-node-003-appointment',
        state: 0,
        nodeDef: {
          nodeType: 'forms',
          name: '预约上门时间',
          formDefId: appointmentFormDefinitionWireId,
          userChoose: ['synthetic-role'],
        },
      })
    }
  }
}

function saveMockAppointment(dataStr: unknown): string {
  if (typeof dataStr !== 'string') throw new Error('Appointment form data is missing')
  const values = JSON.parse(dataStr) as Record<string, unknown>
  const formDataId = typeof values._id === 'string' && values._id.length > 0
    ? values._id
    : 'mock-form-data-003-appointment'
  mockCommandState().formData.set(formDataId, {
    _id: formDataId,
    extId: appointmentFormDefinitionWireId,
    exts: {
      need: values.need ?? null,
      datetime: values.datetime ?? null,
      note: values.note ?? null,
    },
    state: 1,
  })
  return formDataId
}

function completeMockAppointment(id: string, formDataId: string): void {
  const nodes = detailNodesForWorkOrder(id)
  if (!nodes) return
  for (const value of nodes) {
    const node = mutableRecord(value)
    if (!node) continue
    const nodeDef = mutableRecord(node.nodeDef)
    if (nodeDef?.formDefId === appointmentFormDefinitionWireId) {
      node.state = 10
      node.formDataId = formDataId
    }
  }
}

function saveMockDynamicForm(dataStr: unknown, definitionId: string): string {
  if (typeof dataStr !== 'string') throw new Error('Dynamic form data is missing')
  const values = JSON.parse(dataStr) as Record<string, unknown>
  const formDataId = typeof values._id === 'string' && values._id.length > 0
    ? values._id
    : `mock-form-data-${definitionId}`
  const metadata = new Set(['_id', 'sid', 'smodule', 'nodeId', 'workflowId', 'state'])
  const formValues = Object.fromEntries(Object.entries(values).filter(([key]) => !metadata.has(key)))
  mockCommandState().formData.set(formDataId, {
    _id: formDataId,
    extId: definitionId,
    exts: formValues,
    ...(typeof values.workflowId === 'string'
      ? { workflowId: values.workflowId, workflowRunId: values.workflowId }
      : {}),
    state: 1,
  })
  return formDataId
}

function completeMockDynamicForm(id: string, formDataId: string, definitionId: string): void {
  const nodes = detailNodesForWorkOrder(id)
  if (!nodes) return
  for (const value of nodes) {
    const node = mutableRecord(value)
    const nodeDef = mutableRecord(node?.nodeDef)
    if (nodeDef?.formDefId === definitionId && node) {
      node.state = 10
      node.formDataId = formDataId
    }
  }
}


  return {
    responseForDetail,
    acceptMockWorkOrder,
    saveMockAppointment,
    completeMockAppointment,
    saveMockDynamicForm,
    completeMockDynamicForm,
  }
}
