import { isBusinessMockMode, type BusinessMockMode } from './config'
import { appointmentFormDefinitionWireId } from '../appointment-contract'
import {
  isSyntheticWorkOrderId,
  mockAppointmentFormDefinitionResponse,
  mockOrdinaryListResponse,
  mockRepairPartsCascadeResponse,
  mockSurveyPartsCascadeResponse,
  mockRoleFunctionResponse,
  mockSanodeListResponse,
  mockStatusOptionsResponse,
  mockSurveyCodeOptionsResponse,
  mockCommandScenarioIds,
  mockQuotationWorkflowNodeId,
  mockSyntheticDynamicFormDefinitionId,
  mockSyntheticInspectionFormDefinitionResponse,
  mockSurveyFormDefinitionId,
  mockSurveyFormDefinitionResponse,
  mockSurveyLeakageCauseResponse,
  mockWorkOrderActivityResponseFor,
  mockWorkOrderDetailResponses,
  mockWorkOrderDetailResponseFor,
} from './fixtures'
import type { ApiCommandRequest } from '../technician-api-commands'

export interface MockReadOptions {
  readonly latencyMs?: number
  /** Authenticated actor values used only to bind bounded fixture markers. */
  readonly actor?: MockReadActor | null
}

export interface MockReadActor {
  readonly userId?: string
  readonly roleId?: string
}

interface MockCommandState {
  listResponse: unknown
  detailResponses: Map<string, unknown>
  formData: Map<string, unknown>
}

let commandState: MockCommandState | null = null

function normalizedPath(path: string): string {
  return path.replace(/^\/+/, '').split('?')[0]
}

/** Synthetic entity reads remain locally owned even when mock mode is off. */
export function isMockOwnedRead(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
): boolean {
  const route = normalizedPath(path)
  // This is an internal, synthetic-only route. It is always mock-owned so a
  // disabled Mock mode can never fall through to a real backend endpoint.
  if (route === '__mock/quotation/action-content') return true
  if (
    route === 'biz/extField/query' &&
    typeof requestData.extId === 'string' &&
    (requestData.extId === mockSyntheticDynamicFormDefinitionId
      || requestData.extId === mockSurveyFormDefinitionId)
  ) return true
  if (
    route.startsWith('biz/extForm/query/') &&
    (route.slice('biz/extForm/query/'.length) === mockSyntheticDynamicFormDefinitionId
      || route.slice('biz/extForm/query/'.length) === mockSurveyFormDefinitionId)
  ) return true
  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    try {
      return isSyntheticWorkOrderId(decodeURIComponent(route.slice(detailPrefix.length)))
    } catch {
      return false
    }
  }

  if (
    route === 'biz/action/query.do' &&
    requestData.bizType === 'serviceAppointment' &&
    typeof requestData.sid === 'string'
  ) {
    return isSyntheticWorkOrderId(requestData.sid)
  }

  return false
}

export function isMockOwnedCommand(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
): boolean {
  const route = normalizedPath(path)
  const syntheticFormMutation =
    route === `biz/extForm/upsert/${mockSyntheticDynamicFormDefinitionId}`
    || route === `biz/extForm/upsert/${mockSurveyFormDefinitionId}`
  const values = [requestData.sid, requestData.saId]
  const serialized = requestData.dataStr
  if (typeof serialized === 'string') {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>
      values.push(parsed.sid)
    } catch {
      // A malformed command is still handled by the real adapter as a failure.
    }
  }
  return syntheticFormMutation || values.some((value) => typeof value === 'string' && isSyntheticWorkOrderId(value))
}

function clonedResponse<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mockCommandState(): MockCommandState {
  if (!commandState) {
    commandState = {
      listResponse: clonedResponse(mockSanodeListResponse),
      detailResponses: new Map(
        Object.entries(mockWorkOrderDetailResponses).map(([id, response]) => [id, clonedResponse(response)]),
      ),
      formData: new Map(),
    }
  }
  return commandState
}

export function resetMockCommandState(): void {
  commandState = null
}

function mutableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

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

function commandWorkOrderId(data: Readonly<Record<string, unknown>>): string {
  if (typeof data.sid === 'string') return data.sid
  if (typeof data.saId === 'string') return data.saId
  if (typeof data.dataStr !== 'string') return ''
  try {
    const parsed = JSON.parse(data.dataStr) as Record<string, unknown>
    return typeof parsed.sid === 'string' ? parsed.sid : ''
  } catch {
    return ''
  }
}

function mockFailureResponse(kind: 'retryable' | 'terminal'): unknown {
  return {
    success: false,
    code: kind === 'retryable' ? 'RETRYABLE' : 'TERMINAL',
    message: 'synthetic command failure',
  }
}

/**
 * Positive Detail fixtures use explicit synthetic identity markers so their
 * raw workflow shapes stay deterministic. In the running app, bind those
 * markers to the already-authenticated actor before the normal Adapter path.
 * This does not create or alter a SessionRef and leaves mismatch/unknown
 * scenarios untouched.
 */
function bindMockActorMarkers(raw: unknown, actor: MockReadActor | null | undefined): unknown {
  if (!actor?.userId && !actor?.roleId) return raw
  if (Array.isArray(raw)) return raw

  const bindNode = (node: Record<string, unknown>): void => {
    if (actor.roleId) {
      const nodeDef = mutableRecord(node.nodeDef)
      if (nodeDef) {
        for (const key of ['userChoose', 'viewableRoleIds']) {
          const values = nodeDef[key]
          if (!Array.isArray(values)) continue
          nodeDef[key] = values.map((item) => item === 'synthetic-role' ? actor.roleId : item)
        }
      }
    }

    if (actor.userId && Array.isArray(node.handlerIds)) {
      node.handlerIds = node.handlerIds.map((item) => item === 'synthetic-user' ? actor.userId : item)
    }
  }

  const envelope = mutableRecord(raw)
  const payload = mutableRecord(envelope?.data)
  const workflowNodes = payload?.workflowNode
  if (Array.isArray(workflowNodes)) {
    for (const value of workflowNodes) {
      const node = mutableRecord(value)
      if (node) bindNode(node)
    }
    return envelope
  }

  const rows = envelope?.data
  if (Array.isArray(rows)) {
    for (const value of rows) {
      const row = mutableRecord(value)
      if (row) bindNode(row)
    }
  }

  return envelope
}

function emptyPageResponse(): unknown {
  return { data: [], page: 1, rows: 20, total: 0 }
}

const workOrderSearchFields = ['title', 'name', 'phone', 'address', 'describe', 'orderNum'] as const

function searchTerm(requestData: Readonly<Record<string, unknown>>): string | undefined {
  for (const field of workOrderSearchFields) {
    const value = requestData[`regex:${field}|string#or`]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return undefined
}

function rawSearchValue(item: unknown, field: string): unknown {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
  const record = item as Record<string, unknown>
  const nested = record.data
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    return (nested as Record<string, unknown>)[field]
  }
  return record[field]
}

function listResponse(
  mode: BusinessMockMode,
  response: unknown,
  requestData: Readonly<Record<string, unknown>>,
): unknown {
  if (mode === 'empty') return emptyPageResponse()
  const term = searchTerm(requestData)
  if (!term) return response
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return response
  const envelope = response as Record<string, unknown>
  if (!Array.isArray(envelope.data)) return response
  const needle = term.toLocaleLowerCase()
  const data = envelope.data.filter((item) =>
    workOrderSearchFields.some((field) => {
      const value = rawSearchValue(item, field)
      return typeof value === 'string' && value.toLocaleLowerCase().includes(needle)
    }),
  )
  return { ...envelope, data, total: data.length }
}

function matchedResponse(
  path: string,
  mode: BusinessMockMode,
  requestData: Readonly<Record<string, unknown>>,
): unknown | null {
  const route = normalizedPath(path)
  if (route === '__mock/quotation/action-content') {
    const workOrderId = typeof requestData.workOrderId === 'string' ? requestData.workOrderId : ''
    const workflowNodeId = typeof requestData.workflowNodeId === 'string' ? requestData.workflowNodeId : ''
    if (
      mode !== 'data'
      || workOrderId !== mockCommandScenarioIds.quotationFoundation
      || workflowNodeId !== mockQuotationWorkflowNodeId
    ) return null
    return {
      data: {
        workOrderId,
        workflowNodeId,
        fixtureId: 'g4f-quotation-empty-v1',
        quotation: null,
      },
    }
  }
  if (route === 'function/changeRole') return mockRoleFunctionResponse
  if (route === 'code/query' && requestData.valueOption === 'STATUS') {
    return mockStatusOptionsResponse
  }
  if (route === 'i/code/selectCode.do') {
    const rawValue = typeof requestData.jsonPara === 'string' ? requestData.jsonPara : ''
    try {
      const entries = JSON.parse(rawValue)
      const valueOption = Array.isArray(entries) && typeof entries[0]?.eleid === 'string'
        ? entries[0].eleid
        : undefined
      if (valueOption) return mockSurveyCodeOptionsResponse(valueOption)
    } catch {
      return []
    }
  }
  if (route === 'i/code/selectMultistageCode.do' && requestData.types === 'repairParts') {
    return mockRepairPartsCascadeResponse
  }
  if (route === 'i/code/selectMultistageCode.do' && requestData.types === 'parts') {
    return mockSurveyPartsCascadeResponse
  }
  if (route === 'biz/extForm/queryByColName/leakageCause') {
    return { data: mockSurveyLeakageCauseResponse, page: 1, rows: mockSurveyLeakageCauseResponse.length, total: mockSurveyLeakageCauseResponse.length }
  }
  if (
    route === 'biz/action/query.do' &&
    requestData.bizType === 'serviceAppointment' &&
    requestData.actionType === '1,2,3,4,5,6'
  ) {
    const workOrderId = typeof requestData.sid === 'string' ? requestData.sid : ''
    if (!isSyntheticWorkOrderId(workOrderId)) return null
    if (mode === 'empty') return { status: 1, data: [] }
    return mockWorkOrderActivityResponseFor(workOrderId)
  }
  if (route === 'basic/serviceAppointment/querySAWorkflowNode') {
    return listResponse(mode, mockCommandState().listResponse, requestData)
  }
  if (route === 'basic/serviceAppointment/query') {
    return listResponse(mode, mockOrdinaryListResponse, requestData)
  }

  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    const requestedId = decodeURIComponent(route.slice(detailPrefix.length))
    if (isMockOwnedRead(route)) return responseForDetail(requestedId) ?? mockWorkOrderDetailResponseFor(requestedId)
  }
  if (route === 'biz/extField/query' && requestData.extId === appointmentFormDefinitionWireId) {
    return mockAppointmentFormDefinitionResponse
  }
  if (route === 'biz/extField/query' && requestData.extId === mockSyntheticDynamicFormDefinitionId) {
    return mockSyntheticInspectionFormDefinitionResponse
  }
  if (route === 'biz/extField/query' && requestData.extId === mockSurveyFormDefinitionId) {
    return mockSurveyFormDefinitionResponse
  }
  if (route.startsWith('biz/extForm/query/') && route.slice('biz/extForm/query/'.length) === appointmentFormDefinitionWireId) {
    const exactDataId = requestData['is:_id|string#and']
    const dataId = typeof exactDataId === 'string'
      ? exactDataId
      : typeof requestData.id === 'string'
        ? requestData.id
        : undefined
    const formData = dataId ? mockCommandState().formData.get(dataId) : undefined
    return { data: formData ? [formData] : [], page: 1, rows: 20, total: formData ? 1 : 0 }
  }
  if (route.startsWith('biz/extForm/query/') && route.slice('biz/extForm/query/'.length) === mockSyntheticDynamicFormDefinitionId) {
    const exactDataId = requestData['is:_id|string#and']
    const dataId = typeof exactDataId === 'string' ? exactDataId : undefined
    const formData = dataId ? mockCommandState().formData.get(dataId) : undefined
    return { data: formData ? [formData] : [], page: 1, rows: 20, total: formData ? 1 : 0 }
  }
  if (route.startsWith('biz/extForm/query/') && route.slice('biz/extForm/query/'.length) === mockSurveyFormDefinitionId) {
    const exactDataId = requestData['is:_id|string#and']
    const dataId = typeof exactDataId === 'string' ? exactDataId : undefined
    const formData = dataId ? mockCommandState().formData.get(dataId) : undefined
    return { data: formData ? [formData] : [], page: 1, rows: 20, total: formData ? 1 : 0 }
  }

  return null
}

function matchedCommandResponse(request: ApiCommandRequest): unknown | null {
  const route = normalizedPath(request.path)
  const data = request.body ?? {}
  if (route === 'back/super/file/upToken.do') {
    return { token: 'synthetic-upload-token' }
  }
  if (route === 'basic/serviceAppointment/selfExamination') {
    const id = typeof data.saId === 'string' ? data.saId : ''
    if (!isSyntheticWorkOrderId(id)) return null
    if (
      id === mockCommandScenarioIds.acceptDirect ||
      id === mockCommandScenarioIds.acceptRetryable ||
      id === mockCommandScenarioIds.acceptTerminal
    ) {
      return { data: [] }
    }
    const current = responseForDetail(id)
    const nodes = mutableRecord(mutableRecord(current)?.data)?.workflowNode
    const hasAccept = Array.isArray(nodes) && nodes.some((value) => mutableRecord(value)?.nodeDef && mutableRecord(mutableRecord(value)?.nodeDef)?.nodeType === 'accept')
    return { data: hasAccept ? [{ reason: 'synthetic confirmation required' }] : [] }
  }
  if (route === 'biz/extForm/upsert/' + appointmentFormDefinitionWireId) {
    const id = commandWorkOrderId(data)
    if (id === mockCommandScenarioIds.appointmentRetryable) return mockFailureResponse('retryable')
    if (id === mockCommandScenarioIds.appointmentTerminal) return mockFailureResponse('terminal')
    const formDataId = saveMockAppointment(data.dataStr)
    return { data: { _id: formDataId } }
  }
  if (
    route === 'biz/extForm/upsert/' + mockSyntheticDynamicFormDefinitionId
    || route === 'biz/extForm/upsert/' + mockSurveyFormDefinitionId
  ) {
    const definitionId = route.slice('biz/extForm/upsert/'.length)
    const formDataId = saveMockDynamicForm(data.dataStr, definitionId)
    return { data: { _id: formDataId } }
  }
  if (route === 'workflow/process') {
    const id = typeof data.sid === 'string' ? data.sid : ''
    if (!isSyntheticWorkOrderId(id)) return null
    if (id === mockCommandScenarioIds.acceptRetryable) return mockFailureResponse('retryable')
    if (id === mockCommandScenarioIds.acceptTerminal) return mockFailureResponse('terminal')
    if (data.nodeFormDefId === appointmentFormDefinitionWireId) {
      const formDataId = typeof data.nodeFormDataId === 'string' ? data.nodeFormDataId : ''
      completeMockAppointment(id, formDataId)
    } else if (
      data.nodeFormDefId === mockSyntheticDynamicFormDefinitionId
      || data.nodeFormDefId === mockSurveyFormDefinitionId
    ) {
      const formDataId = typeof data.nodeFormDataId === 'string' ? data.nodeFormDataId : ''
      completeMockDynamicForm(id, formDataId, data.nodeFormDefId)
    } else {
      acceptMockWorkOrder(id)
    }
    return { success: true, data: {} }
  }
  return null
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Returns a raw backend-shaped read response only for approved read routes.
 * A null result is an explicit fall-through to the real transport.
 */
export async function tryMockRead(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
  options: MockReadOptions = {},
): Promise<unknown | null> {
  const mode = isBusinessMockMode()
  if (mode === 'off') return null
  const response = matchedResponse(path, mode, requestData)
  if (response === null) return null
  await delay(options.latencyMs ?? 300)
  return bindMockActorMarkers(clonedResponse(response), options.actor)
}

export async function tryMockCommand(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
): Promise<unknown | null> {
  const mode = isBusinessMockMode()
  if (mode === 'off') return null
  const response = matchedCommandResponse({ method: 'POST', path, body: requestData as Record<string, string | number | boolean> })
  if (response === null) return null
  return clonedResponse(response)
}
