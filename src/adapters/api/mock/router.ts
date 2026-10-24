import { isBusinessMockMode, type BusinessMockMode } from './config'
import { isDevMockJourneyEnabled, mockJourneyNodes, mockJourneyStage, mockJourneyWorkOrderId, type MockJourneyStage } from './journey'
import { appointmentFormDefinitionWireId } from '../appointment-contract'
import {
  isSyntheticWorkOrderId,
  mockAppointmentFormDefinitionResponse,
  mockOrdinaryListResponse,
  mockRepairPartsCascadeResponse,
  mockSurveyPartsCascadeResponse,
  mockRoleFunctionResponse,
  mockStatusOptionsResponse,
  mockSurveyCodeOptionsResponse,
  mockCommandScenarioIds,
  mockQuotationWorkflowNodeId,
  mockSyntheticDynamicFormDefinitionId,
  mockSyntheticInspectionFormDefinitionResponse,
  mockSurveyFormDefinitionId,
  mockSurveyFormDefinitionResponse,
  mockSurveyLeakageCauseResponse,
  mockR1AddFormCodeId,
  mockR1AddFormOptionsResponse,
  mockR1NoteFormDefinitionId,
  mockR1NoteFormDefinitionResponse,
  mockR1ExistingFormData,
  mockR1FormData,
  mockR1MpUxListRows,
  mockWorkOrderActivityResponseFor,
  mockWorkOrderIds,
  mockWorkOrderDetailResponseFor,
} from './fixtures'
import {
  mockQuotationCatalogServiceType,
  mockQuotationCatalogSourceType,
  mockQuotationPackageListResponse,
  mockQuotationProcedureListResponse,
  mockQuotationMaterialListResponse,
  mockQuotationMeasureListResponse,
  mockQuotationPackageDetailResponse,
  mockMaterialSkuSpuId,
  mockMaterialSalesExtFieldsResponse,
  mockMaterialSaleCodeOptions,
  mockMaterialSkuVariantsResponse,
} from './quotation-catalog'
import type { ApiCommandRequest } from '../technician-api-commands'
import { isMockOwnedRead, isMockOwnedCommand, normalizedPath, quotationCatalogListRoutes } from './ownership'
import { mockCommandState } from './command-state'
import { mockFaultWireResponse, validatedMockLatency, type MockFaultKind } from './fault-scenarios'
export { resetMockCommandState } from './command-state'
export { isMockOwnedRead, isMockOwnedCommand } from './ownership'

export interface MockReadOptions {
  readonly latencyMs?: number
  /** Test-only fault is applied ONLY after a real synthetic fixture matched. */
  readonly fault?: MockFaultKind
  /** Authenticated actor values used only to bind bounded fixture markers. */
  readonly actor?: MockReadActor | null
}

export interface MockReadActor {
  readonly userId?: string
  readonly roleId?: string
}

function clonedResponse<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mutableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Project the same 019 WorkOrder through the three review stages. Completed
 * nodes remain historical/read-only. This is a local read projection, not a
 * Workflow Complete response or an official Order.
 */
function journeyNodeFor(stage: MockJourneyStage): Record<string, unknown> {
  if (stage === 'appointment') {
    return {
      _id: mockJourneyNodes.appointment,
      state: 0,
      nodeDef: { nodeType: 'forms', name: '预约上门时间', formDefId: appointmentFormDefinitionWireId, userChoose: ['synthetic-role'] },
    }
  }
  if (stage === 'survey') {
    return {
      _id: mockJourneyNodes.survey,
      state: 0,
      nodeDef: { nodeType: 'forms', name: '现场勘察', formDefId: mockSurveyFormDefinitionId, colName: 'survey', userChoose: ['synthetic-role'] },
    }
  }
  return {
    _id: mockJourneyNodes.quotation,
    state: 0,
    nodeDef: { nodeType: 'placeOrder', name: '报价', viewableRoleIds: ['synthetic-role'] },
  }
}

function mockJourneyNodesFor(stage: MockJourneyStage): Record<string, unknown>[] {
  const completed: Record<string, unknown>[] = []
  if (stage !== 'appointment') completed.push({ ...journeyNodeFor('appointment'), state: 10 })
  if (stage === 'quotation') completed.push({ ...journeyNodeFor('survey'), state: 10 })
  return [...completed, journeyNodeFor(stage)]
}

function journeyDetailResponse(): unknown {
  const raw = mockCommandState().detailResponses.get(mockJourneyWorkOrderId)
  const envelope = clonedResponse(raw) as Record<string, unknown>
  const data = mutableRecord(envelope.data)
  if (!data) return envelope
  const stage = mockJourneyStage()
  data.workflowNode = mockJourneyNodesFor(stage)
  const workOrder = mutableRecord(data.serviceAppointment)
  if (workOrder) {
    workOrder.status = stage === 'appointment' ? 'mock-status-appointment-pending'
      : stage === 'survey' ? 'mock-status-onsite' : 'mock-status-order'
  }
  return envelope
}

function journeyListResponse(raw: unknown): unknown {
  if (!isDevMockJourneyEnabled()) return raw
  const clone = clonedResponse(raw)
  const envelope = mutableRecord(clone)
  if (!envelope || !Array.isArray(envelope.data)) return clone
  const stage = mockJourneyStage()
  for (const item of envelope.data) {
    const node = mutableRecord(item)
    if (mutableRecord(node?.data)?._id !== mockJourneyWorkOrderId || !node) continue
    const projected = journeyNodeFor(stage)
    node._id = projected._id
    node.nodeDef = projected.nodeDef
    node.state = 0
    const order = mutableRecord(node.data)
    if (order) order.status = stage === 'appointment' ? 'mock-status-appointment-pending'
      : stage === 'survey' ? 'mock-status-onsite' : 'mock-status-order'
  }
  return clone
}

function r1MpUxListResponse(raw: unknown): unknown {
  if (import.meta.env.DEV !== true
    || import.meta.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true') return raw
  const envelope = mutableRecord(clonedResponse(raw))
  if (!envelope || !Array.isArray(envelope.data)) return raw
  envelope.data.push(...Array.from(clonedResponse(mockR1MpUxListRows)))
  envelope.total = envelope.data.length
  return envelope
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

function hasActiveMockFormNode(id: string, nodeId: string, definitionId: string): boolean {
  // Journey 019 is a local draft/review projection, NOT a command-backed R1 flow.
  if (id === mockJourneyWorkOrderId) return false
  return detailNodesForWorkOrder(id)?.some((value) => {
    const node = mutableRecord(value)
    const nodeDef = mutableRecord(node?.nodeDef)
    return node?._id === nodeId && node.state === 0
      && nodeDef?.nodeType === 'forms' && nodeDef.formDefId === definitionId
  }) === true
}

function matchesMockFormWireScope(
  values: Record<string, unknown>, workOrderId: string, nodeId: string, definitionId: string,
): boolean {
  if (values.smodule !== 'serviceAppointment' || values.state !== 1
    || !hasActiveMockFormNode(workOrderId, nodeId, definitionId)) return false
  const payload = mutableRecord(mutableRecord(responseForDetail(workOrderId))?.data)
  const runId = mutableRecord(payload?.workflow)?._id
  return values.workflowId === undefined || (typeof runId === 'string' && values.workflowId === runId)
}

function canSaveMockFormData(dataId: string, id: string, nodeId: string, definitionId: string): boolean {
  if (!dataId.startsWith('mock-') || Object.prototype.hasOwnProperty.call(mockR1ExistingFormData, dataId)) return false
  const previous = mockCommandState().formData.get(dataId)
  if (previous === undefined) return true
  const record = mutableRecord(previous)
  return record?.sid === id && record.nodeId === nodeId && record.extId === definitionId
    && record.state === 1
}

function nextMockFormDataId(id: string, definitionId: string): string {
  const prefix = `mock-form-data-${id}-${definitionId}`
  let sequence = 1
  while (mockCommandState().formData.has(`${prefix}-${sequence}`)) sequence += 1
  return `${prefix}-${sequence}`
}

function hasSavedMockFormData(id: string, nodeId: string, definitionId: string, dataId: string): boolean {
  if (!hasActiveMockFormNode(id, nodeId, definitionId)) return false
  const record = mutableRecord(mockCommandState().formData.get(dataId))
  return record?._id === dataId && record.sid === id && record.nodeId === nodeId
    && record.extId === definitionId && record.state === 1
}

function hasActiveMockAcceptNode(id: string, nodeId: string): boolean {
  // The R1 pending-accept task is a list node; Detail can still contain the
  // older dispatch/subflows projection until the accept command succeeds.
  const node = listItemForWorkOrder(id)
  if (node?._id === nodeId && node.state === 0
    && mutableRecord(node.nodeDef)?.nodeType === 'accept') return true
  return detailNodesForWorkOrder(id)?.some((value) => {
    const current = mutableRecord(value)
    return current?._id === nodeId && current.state === 0
      && mutableRecord(current.nodeDef)?.nodeType === 'accept'
  }) === true
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
  const workOrderId = values.sid
  const nodeId = values.nodeId
  if (typeof workOrderId !== 'string' || typeof nodeId !== 'string'
    || !isSyntheticWorkOrderId(workOrderId)
    || !matchesMockFormWireScope(values, workOrderId, nodeId, appointmentFormDefinitionWireId)) {
    throw new Error('Appointment Mock source scope is not active')
  }
  const formDataId = typeof values._id === 'string' && values._id.length > 0
    ? values._id
    : nextMockFormDataId(workOrderId, appointmentFormDefinitionWireId)
  if ((values._id !== undefined && mockCommandState().formData.get(formDataId) === undefined)
    || !canSaveMockFormData(formDataId, workOrderId, nodeId, appointmentFormDefinitionWireId)) {
    throw new Error('Appointment Mock record identity conflicts')
  }
  mockCommandState().formData.set(formDataId, {
    _id: formDataId,
    extId: appointmentFormDefinitionWireId,
    sid: workOrderId,
    nodeId,
    exts: {
      need: values.need ?? null,
      datetime: values.datetime ?? null,
      note: values.note ?? null,
    },
    state: 1,
  })
  return formDataId
}

function completeMockAppointment(id: string, nodeId: string, formDataId: string): void {
  const nodes = detailNodesForWorkOrder(id)
  if (!nodes) return
  for (const value of nodes) {
    const node = mutableRecord(value)
    if (!node) continue
    const nodeDef = mutableRecord(node.nodeDef)
    if (node._id === nodeId && nodeDef?.formDefId === appointmentFormDefinitionWireId) {
      node.state = 10
      node.formDataId = formDataId
    }
  }
}

function saveMockDynamicForm(dataStr: unknown, definitionId: string): string {
  if (typeof dataStr !== 'string') throw new Error('Dynamic form data is missing')
  const values = JSON.parse(dataStr) as Record<string, unknown>
  const workOrderId = values.sid
  const nodeId = values.nodeId
  if (typeof workOrderId !== 'string' || typeof nodeId !== 'string'
    || !isSyntheticWorkOrderId(workOrderId)
    || !matchesMockFormWireScope(values, workOrderId, nodeId, definitionId)) {
    throw new Error('Dynamic Mock source scope is not active')
  }
  const formDataId = typeof values._id === 'string' && values._id.length > 0
    ? values._id
    : nextMockFormDataId(workOrderId, definitionId)
  if ((values._id !== undefined && mockCommandState().formData.get(formDataId) === undefined)
    || !canSaveMockFormData(formDataId, workOrderId, nodeId, definitionId)) {
    throw new Error('Dynamic Mock record identity conflicts')
  }
  const metadata = new Set(['_id', 'sid', 'smodule', 'nodeId', 'workflowId', 'state'])
  const formValues = Object.fromEntries(Object.entries(values).filter(([key]) => !metadata.has(key)))
  mockCommandState().formData.set(formDataId, {
    _id: formDataId,
    extId: definitionId,
    sid: workOrderId,
    nodeId,
    exts: formValues,
    ...(typeof values.workflowId === 'string'
      ? { workflowId: values.workflowId, workflowRunId: values.workflowId }
      : {}),
    state: 1,
  })
  return formDataId
}

function completeMockDynamicForm(id: string, nodeId: string, formDataId: string, definitionId: string): void {
  const nodes = detailNodesForWorkOrder(id)
  if (!nodes) return
  for (const value of nodes) {
    const node = mutableRecord(value)
    const nodeDef = mutableRecord(node?.nodeDef)
    if (node?._id === nodeId && nodeDef?.formDefId === definitionId && node) {
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
    const ordinary = workOrderId === mockCommandScenarioIds.quotationFoundation
      && workflowNodeId === mockQuotationWorkflowNodeId
    const journey = isDevMockJourneyEnabled()
      && workOrderId === mockJourneyWorkOrderId
      && workflowNodeId === mockJourneyNodes.quotation
      && mockJourneyStage() === 'quotation'
    if (mode !== 'data' || (!ordinary && !journey)) return null
    return {
      data: {
        workOrderId,
        workflowNodeId,
        fixtureId: 'g4f-quotation-empty-v1',
        quotation: null,
      },
    }
  }

  // I6: an explicit, isolated synthetic type=1 Order + Contract, never a
  // submitted order, never an authorization source, never a real tenant.
  // All other Contract/Order routes remain unsupported in DEV Mock mode.
  if (mode === 'data' && import.meta.env.DEV === true
    && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true'
    && route === 'basic/order/query'
    && requestData['is:serviceAppointmentId|string#and'] === mockWorkOrderIds[1]
    && requestData['is:type|integer#and'] === 1
    && requestData._all === undefined
    && requestData.page === 1 && requestData.rows === 3) {
    return { data: [{
      _id: 'mock-official-order-001', type: 1,
      serviceAppointmentId: mockWorkOrderIds[1],
      orderNumber: 'DEV-SYNTHETIC-NOT-SUBMITTED',
      state: 1, processState: 4, totalPrice: 0, exts: { isAgain: 0 },
      bjProducts: { orderList: [{
        repairParts: ['DEV-SYNTHETIC'], partDescription: '合成数据，仅供界面验证',
        projPackages: { data: [] }, procedures: { data: [] },
        materials: { data: [] }, measures: { data: [] },
      }] },
    }], page: 1, rows: 3, total: 1 }
  }
  if (mode === 'data' && import.meta.env.DEV === true
    && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true'
    && route === 'basic/contract/query.do'
    && requestData['is:serviceAppointmentId|string#and'] === mockWorkOrderIds[1]
    && requestData['is:state|integer#or'] === '1'
    && requestData['is:exts.contractStatus|string#or'] === '-2'
    && requestData['is:workOrderId|string#and'] === undefined
    && requestData._all === undefined
    && requestData.sortField === 'createTime' && requestData.sortOrder === 'desc'
    && requestData.page === 1 && requestData.rows === 3) {
    return { data: [{
      _id: 'mock-contract-001',
      orderId: 'mock-official-order-001',
      serviceAppointmentId: mockWorkOrderIds[1],
      contractdocNum: 'DEV-SYNTHETIC-CONTRACT',
      state: 1, exts: { contractStatus: '2' },
    }], page: 1, rows: 3, total: 1 }
  }
  // This route shape follows pinned R1 source, but the values are exclusively
  // DEV Mock fixtures; no price, inventory or real customer data is included.
  if (mode === 'data' && route === 'biz/extField/query'
    && requestData.colName === 'material' && requestData.sortField === 'order'
    && requestData._all === '1' && requestData['is:state|integer#and'] === 1) {
    return mockMaterialSalesExtFieldsResponse
  }
  if (mode === 'data' && route === 'basic/material/query'
    && requestData.spuid === mockMaterialSkuSpuId
    && requestData._all === '1' && requestData['is:state|integer#and'] === 1) {
    return mockMaterialSkuVariantsResponse
  }
  if (quotationCatalogListRoutes.has(route)) {
    // Identical paging envelope to R1 FlipPageInfo: page, rows and total.
    // A bad or unbounded Mock request is rejected, not silently reinterpreted.
    const page = requestData.page
    const rows = requestData.rows
    if (requestData._all !== undefined || !Number.isInteger(page) || typeof page !== 'number'
      || page < 1 || page > 50 || rows !== 20) return null
    const matchesMockScope = requestData['in:serviceType|array#and'] === mockQuotationCatalogServiceType
      && (requestData.sourceType === undefined || requestData.sourceType === mockQuotationCatalogSourceType)
    if (mode === 'empty' || !matchesMockScope) {
      return { data: [], page, rows, total: 0 }
    }
    const fixture = route === 'biz/projPackage/queryWithRank' ? mockQuotationPackageListResponse
      : route === 'biz/procedure/queryWithRank' ? mockQuotationProcedureListResponse
      : route === 'basic/material/queryWithRank' ? mockQuotationMaterialListResponse
      : mockQuotationMeasureListResponse
    return { data: fixture.data.slice((page - 1) * rows, page * rows), page, rows, total: fixture.total }
  }
  const packageDetailPrefix = 'biz/projPackage/findById/'
  if (route.startsWith(packageDetailPrefix)) {
    let packageId = ''
    try {
      packageId = decodeURIComponent(route.slice(packageDetailPrefix.length))
    } catch {
      return null
    }
    if (mode === 'data' && packageId === 'mock-catalog-package-basic') {
      return mockQuotationPackageDetailResponse
    }
    if (mode === 'data' && packageId.startsWith('mock-catalog-package-')) {
      return { success: true, entity: null }
    }
    return null
  }
  if (route === 'function/changeRole') return mockRoleFunctionResponse
  if (route === 'code/query' && requestData.valueOption === 'STATUS') {
    return mockStatusOptionsResponse
  }
  if (mode === 'data' && route === 'code/query' && requestData.parentId === mockR1AddFormCodeId) {
    return mockR1AddFormOptionsResponse
  }
  if (mode === 'data' && route === 'i/code/selectCode.do'
    && requestData.tenantId === '1340835581184723420'
    && typeof requestData.jsonPara === 'string') {
    try {
      const entries: unknown = JSON.parse(requestData.jsonPara)
      if (Array.isArray(entries) && entries.length === 2
        && entries.every(row => row && typeof row === 'object'
          && typeof (row as { eleid?: unknown }).eleid === 'string'
          && (row as { eleid: string }).eleid === (row as { codeId?: unknown }).codeId)) {
        const names = entries.map(row => (row as { eleid: string }).eleid)
        const available = Object.keys(mockMaterialSaleCodeOptions)
        if (names.length === available.length && names.every(name => available.includes(name))) {
          return names.map(name => ({
            eleid: name,
            options: mockMaterialSaleCodeOptions[name as keyof typeof mockMaterialSaleCodeOptions],
          }))
        }
      }
    } catch {
      // Let the preexisting Code Mock handler handle other requests.
    }
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
    return listResponse(mode, r1MpUxListResponse(journeyListResponse(mockCommandState().listResponse)), requestData)
  }
  if (route === 'basic/serviceAppointment/query') {
    return listResponse(mode, mockOrdinaryListResponse, requestData)
  }

  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    const requestedId = decodeURIComponent(route.slice(detailPrefix.length))
    if (isMockOwnedRead(route)) {
      if (isDevMockJourneyEnabled() && requestedId === mockJourneyWorkOrderId) return journeyDetailResponse()
      return responseForDetail(requestedId) ?? mockWorkOrderDetailResponseFor(requestedId)
    }
  }
  if (route === 'biz/extField/query' && requestData.extId === appointmentFormDefinitionWireId) {
    return mockAppointmentFormDefinitionResponse
  }
  if (route === 'biz/extField/query' && requestData.extId === mockSyntheticDynamicFormDefinitionId) {
    return mockSyntheticInspectionFormDefinitionResponse
  }
  if (route === 'biz/extField/query' && requestData.extId === mockR1NoteFormDefinitionId) {
    return mockR1NoteFormDefinitionResponse
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
    const candidate = dataId ? mockCommandState().formData.get(dataId) : undefined
    const formData = mutableRecord(candidate)?.extId === appointmentFormDefinitionWireId ? candidate : undefined
    return { data: formData ? [formData] : [], page: 1, rows: 20, total: formData ? 1 : 0 }
  }
  if (route.startsWith('biz/extForm/query/') && route.slice('biz/extForm/query/'.length) === mockSyntheticDynamicFormDefinitionId) {
    const exactDataId = requestData['is:_id|string#and']
    const dataId = typeof exactDataId === 'string' ? exactDataId : undefined
    const workflowId = requestData['is:workflowId|string#and']
    const repeatRows = workflowId === 'mock-workflow-run-021'
      ? [mockR1ExistingFormData[mockR1FormData.repeatFirst],
        mockR1ExistingFormData[mockR1FormData.repeatSecond]] : []
    const candidate = dataId ? mockR1ExistingFormData[dataId as keyof typeof mockR1ExistingFormData]
      ?? mockCommandState().formData.get(dataId) : undefined
    const formData = mutableRecord(candidate)?.extId === mockSyntheticDynamicFormDefinitionId ? candidate : undefined
    const rows = dataId ? (formData ? [formData] : []) : repeatRows
    return { data: rows, page: 1, rows: 20, total: rows.length }
  }
  if (route.startsWith('biz/extForm/query/') && route.slice('biz/extForm/query/'.length) === mockR1NoteFormDefinitionId) {
    const dataId = requestData['is:_id|string#and']
    const formData = dataId === mockR1FormData.formsSecond
      ? mockR1ExistingFormData[mockR1FormData.formsSecond] : undefined
    return { data: formData ? [formData] : [], page: 1, rows: 20, total: formData ? 1 : 0 }
  }
  if (route.startsWith('biz/extForm/query/') && route.slice('biz/extForm/query/'.length) === mockSurveyFormDefinitionId) {
    const exactDataId = requestData['is:_id|string#and']
    const dataId = typeof exactDataId === 'string' ? exactDataId : undefined
    const candidate = dataId ? mockCommandState().formData.get(dataId) : undefined
    const formData = mutableRecord(candidate)?.extId === mockSurveyFormDefinitionId ? candidate : undefined
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
    try {
      const formDataId = saveMockAppointment(data.dataStr)
      return { data: { _id: formDataId } }
    } catch {
      return mockFailureResponse('terminal')
    }
  }
  if (
    route === 'biz/extForm/upsert/' + mockSyntheticDynamicFormDefinitionId
    || route === 'biz/extForm/upsert/' + mockSurveyFormDefinitionId
  ) {
    const definitionId = route.slice('biz/extForm/upsert/'.length)
    try {
      const formDataId = saveMockDynamicForm(data.dataStr, definitionId)
      return { data: { _id: formDataId } }
    } catch {
      return mockFailureResponse('terminal')
    }
  }
  if (route === 'workflow/process') {
    const id = typeof data.sid === 'string' ? data.sid : ''
    if (!isSyntheticWorkOrderId(id)) return null
    if (id === mockJourneyWorkOrderId) return mockFailureResponse('terminal')
    if (id === mockCommandScenarioIds.acceptRetryable) return mockFailureResponse('retryable')
    if (id === mockCommandScenarioIds.acceptTerminal) return mockFailureResponse('terminal')
    const nodeId = typeof data.workflowNodeId === 'string' ? data.workflowNodeId : ''
    if (data.smodule !== 'serviceAppointment' || !nodeId) return mockFailureResponse('terminal')
    if (data.nodeFormDefId === appointmentFormDefinitionWireId) {
      const formDataId = typeof data.nodeFormDataId === 'string' ? data.nodeFormDataId : ''
      if (!hasSavedMockFormData(id, nodeId, appointmentFormDefinitionWireId, formDataId)) {
        return mockFailureResponse('terminal')
      }
      completeMockAppointment(id, nodeId, formDataId)
    } else if (
      data.nodeFormDefId === mockSyntheticDynamicFormDefinitionId
      || data.nodeFormDefId === mockSurveyFormDefinitionId
    ) {
      const formDataId = typeof data.nodeFormDataId === 'string' ? data.nodeFormDataId : ''
      if (!hasSavedMockFormData(id, nodeId, data.nodeFormDefId, formDataId)) {
        return mockFailureResponse('terminal')
      }
      completeMockDynamicForm(id, nodeId, formDataId, data.nodeFormDefId)
    } else {
      if (data.nodeFormDefId !== undefined || data.nodeFormDataId !== undefined
        || !hasActiveMockAcceptNode(id, nodeId)) return mockFailureResponse('terminal')
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
  // Owner-only route policy remains the authority; a request-scoped fault may
  // replace a MATCHED fixture, never create a new mock route or hit network.
  await delay(validatedMockLatency(options.latencyMs))
  if (options.fault) return mockFaultWireResponse(options.fault)
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
