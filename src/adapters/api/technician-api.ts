import type {
  CodeOptionRead,
  CodeOptionsQuery,
  FormDataRead,
  FormDefinitionRead,
  ReadPage,
  TechnicianApiReadPort,
  WorkOrderDetail,
  WorkOrderListQuery,
  WorkOrderSummary,
  WorkflowDefinitionRead,
  WorkflowNodeRead,
} from '@shared/ports'
import type {
  ErrorCategory,
  FormDataId,
  FormDefinitionId,
  OperationSnapshot,
  RoleId,
  WorkOrderId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'
import { asOpaqueId } from '@shared/types'

import {
  AdapterMappingError,
  adapterFailure,
  succeeded,
  unknownErrorMessage,
} from '../common/operations'
import {
  asRecord,
  firstString,
  nestedRecord,
  nestedValue,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalRecord,
  optionalString,
  requiredString,
  type AdapterRecord,
} from '../common/records'

export type ApiRequestMethod = 'GET' | 'POST'
export type ApiRequestValue = string | number | boolean

/** Low-level request execution stays inside adapter infrastructure. */
export interface ApiReadRequest {
  readonly method: ApiRequestMethod
  readonly path: string
  readonly body?: Readonly<Record<string, ApiRequestValue>>
  readonly query?: Readonly<Record<string, string>>
}

export interface ApiReadTransport {
  execute(request: ApiReadRequest): Promise<unknown>
}

interface AdapterWorkOrderListScope {
  readonly mode: 'service-appointment' | 'workflow-node'
  readonly statusFilter?: string
  readonly workflowStateFilter?: string
}

interface WorkOrderListScopeResolver {
  resolve(): Promise<AdapterWorkOrderListScope>
}

export class ApiReadTransportError extends Error {
  constructor(
    message: string,
    readonly category: Extract<
      ErrorCategory,
      'session_invalid' | 'authorization_denied' | 'network_retryable' | 'server_terminal'
    >,
  ) {
    super(message)
    this.name = 'ApiReadTransportError'
  }
}

function requiredOpaqueId<Name extends string>(
  record: AdapterRecord,
  keys: readonly string[],
  label: string,
): ReturnType<typeof asOpaqueId<Name>> {
  return asOpaqueId<Name>(requiredString(record, keys, label))
}

function optionalOpaqueId<Name extends string>(
  record: AdapterRecord,
  keys: readonly string[],
): ReturnType<typeof asOpaqueId<Name>> | undefined {
  const value = optionalString(record, keys)
  return value ? asOpaqueId<Name>(value) : undefined
}

function pageEnvelope<T>(raw: unknown, mapItem: (value: unknown) => T): ReadPage<T> {
  const envelope = asRecord(raw, 'read response')
  const rawItems = nestedValue(envelope, ['data', 'items', 'records'])
  if (!Array.isArray(rawItems)) throw new AdapterMappingError('read response items are missing')

  return {
    items: rawItems.map(mapItem),
    page: optionalPositiveInteger(envelope, ['page']),
    pageSize: optionalPositiveInteger(envelope, ['rows', 'pageSize']),
    totalCount: optionalNonNegativeInteger(envelope, ['total', 'dataCount', 'totalCount']),
  }
}

function workOrderSummary(raw: unknown): WorkOrderSummary {
  const record = asRecord(raw, 'work-order summary')
  const id = requiredOpaqueId<'WorkOrderId'>(record, ['id', '_id'], 'work-order id')
  const displayNumber = optionalString(record, ['orderNum'])
  const customerName = optionalString(record, ['name'])
  const serviceAddress = optionalString(record, ['address'])

  return {
    id,
    ...(displayNumber ? { displayNumber } : {}),
    ...(customerName ? { customerName } : {}),
    ...(serviceAddress ? { serviceAddress } : {}),
  }
}

function sanodeWorkOrderSummary(raw: unknown): WorkOrderSummary {
  const node = asRecord(raw, 'workflow-node work-order summary')
  const data = nestedRecord(node, ['data'])
  if (!data) throw new AdapterMappingError('workflow-node work-order data is missing')
  return workOrderSummary(data)
}

function firstArrayString(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  for (const item of value) {
    if (typeof item === 'string' && item.trim().length > 0) return item
    if (typeof item === 'number' && Number.isFinite(item)) return String(item)
  }
  return undefined
}

function phoneDisplayMask(phone: string): string | undefined {
  const match = /^(\d{3})\d{4}(\d{4})$/.exec(phone)
  return match ? `${match[1]}****${match[2]}` : undefined
}

function workOrderContact(record: AdapterRecord) {
  const contactId = firstArrayString(record.contactIds)
  const phone = optionalString(record, ['phone'])?.trim()
  if (!contactId && !phone) return undefined
  const displayMask = phone ? phoneDisplayMask(phone) : undefined

  return {
    ...(contactId ? { contactRef: asOpaqueId<'CustomerContactId'>(contactId) } : {}),
    ...(phone ? { normalizedPhone: phone } : {}),
    ...(displayMask ? { displayMask } : {}),
  }
}

function workOrderDetail(raw: unknown, requestedId: WorkOrderId): WorkOrderDetail {
  const envelope = asRecord(raw, 'work-order detail response')
  const record = nestedRecord(envelope, ['serviceAppointment', 'workOrder', 'entity']) ?? envelope
  const id = optionalOpaqueId<'WorkOrderId'>(record, ['id', '_id']) ?? requestedId
  const workflow = nestedRecord(envelope, ['workflow'])
  const workflowRunId =
    optionalOpaqueId<'WorkflowRunId'>(record, ['workflowRunId', 'runId']) ??
    (workflow ? optionalOpaqueId<'WorkflowRunId'>(workflow, ['workflowRunId', 'runId', '_id']) : undefined)

  const displayNumber = optionalString(record, ['orderNum'])
  const customerName = optionalString(record, ['name'])
  const serviceAddress = optionalString(record, ['address'])
  const contact = workOrderContact(record)

  return {
    id,
    ...(workflowRunId ? { workflowRunId } : {}),
    ...(displayNumber ? { displayNumber } : {}),
    ...(customerName ? { customerName } : {}),
    ...(serviceAddress ? { serviceAddress } : {}),
    ...(contact ? { contact } : {}),
  }
}

function workflowDefinition(raw: unknown, requestedId: WorkflowDefinitionId): WorkflowDefinitionRead {
  const envelope = asRecord(raw, 'workflow definition response')
  const entity = nestedRecord(envelope, ['entity', 'data'])
  const id = entity
    ? optionalOpaqueId<'WorkflowDefinitionId'>(entity, ['id', '_id', 'defId'])
    : optionalOpaqueId<'WorkflowDefinitionId'>(envelope, ['id', '_id', 'defId'])
  return { id: id ?? requestedId }
}

function workflowNode(raw: unknown): WorkflowNodeRead {
  const record = asRecord(raw, 'workflow node')
  const definitionId = optionalOpaqueId<'WorkflowDefinitionId'>(record, ['definitionId', 'defId'])
  const runId = optionalOpaqueId<'WorkflowRunId'>(record, ['runId', 'workflowRunId'])
  const parentNodeId = optionalOpaqueId<'WorkflowNodeRuntimeId'>(record, [
    'parentNodeId',
    'parentWorkflowNodeId',
  ])
  return {
    id: requiredOpaqueId<'WorkflowNodeRuntimeId'>(record, ['id', '_id', 'workflowNodeId'], 'workflow node id'),
    ...(definitionId ? { definitionId } : {}),
    ...(runId ? { runId } : {}),
    ...(parentNodeId ? { parentNodeId } : {}),
  }
}

function formDefinition(raw: unknown, requestedId: FormDefinitionId): FormDefinitionRead {
  const envelope = asRecord(raw, 'form definition response')
  const first = Array.isArray(envelope.data) ? optionalRecord(envelope.data[0]) : undefined
  const record = nestedRecord(envelope, ['entity', 'definition']) ?? first
  const id = record
    ? optionalOpaqueId<'FormDefinitionId'>(record, ['id', '_id', 'extId', 'definitionId'])
    : optionalOpaqueId<'FormDefinitionId'>(envelope, ['id', '_id', 'extId', 'definitionId'])
  return { id: id ?? requestedId }
}

function formData(raw: unknown): FormDataRead {
  const record = asRecord(raw, 'form data')
  const workflow = nestedRecord(record, ['workflow'])
  return {
    id: requiredOpaqueId<'FormDataId'>(record, ['id', '_id', 'dataId'], 'form data id'),
    definitionId: requiredOpaqueId<'FormDefinitionId'>(
      record,
      ['definitionId', 'extId', 'formDefId'],
      'form definition id',
    ),
    ...(optionalOpaqueId<'WorkflowRunId'>(record, ['workflowRunId', 'runId'])
      ? { workflowRunId: optionalOpaqueId<'WorkflowRunId'>(record, ['workflowRunId', 'runId']) }
      : workflow && optionalOpaqueId<'WorkflowRunId'>(workflow, ['runId', 'workflowRunId'])
        ? { workflowRunId: optionalOpaqueId<'WorkflowRunId'>(workflow, ['runId', 'workflowRunId']) }
        : {}),
  }
}

function codeOption(raw: unknown): CodeOptionRead {
  const record = asRecord(raw, 'code option')
  return {
    value: requiredString(record, ['value', 'code', 'valueOption'], 'code option value'),
    label: requiredString(record, ['label', 'name', 'text', 'codelabel'], 'code option label'),
  }
}

function decodeQueryPart(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '))
}

function actionQueryValue(action: string, key: string): string | undefined {
  const query = action.split('?')[1]?.split('#')[0]
  if (!query) return undefined

  for (const pair of query.split('&')) {
    if (pair.length === 0) continue
    const [rawKey, ...rawValue] = pair.split('=')
    if (decodeQueryPart(rawKey) !== key) continue
    const value = decodeQueryPart(rawValue.join('='))
    return value.length > 0 ? value : undefined
  }

  return undefined
}

function collectLeafFunctions(items: readonly unknown[], output: AdapterRecord[]): void {
  for (const item of items) {
    const record = asRecord(item, 'role function')
    const children = record.functionList
    if (Array.isArray(children) && children.length > 0) {
      collectLeafFunctions(children, output)
    } else {
      output.push(record)
    }
  }
}

function roleFunctionList(raw: unknown): readonly AdapterRecord[] {
  const envelope = asRecord(raw, 'role function response')
  const payload = nestedRecord(envelope, ['data', 'entity']) ?? envelope
  const roots = nestedValue(payload, ['functionList'])
  if (!Array.isArray(roots)) {
    throw new AdapterMappingError('role function response function list is missing')
  }

  const leaves: AdapterRecord[] = []
  collectLeafFunctions(roots, leaves)
  return leaves
}

function roleVisibleWorkOrderScope(raw: unknown): AdapterWorkOrderListScope {
  const candidates = roleFunctionList(raw)
    .map((record) => {
      const action = optionalString(record, ['action'])
      const extensions = optionalRecord(record.exts)
      if (
        extensions?.tabDisplay !== '1' ||
        !action ||
        !action.includes('/serviceAppointment/serviceAppointments')
      ) {
        return undefined
      }

      const orderValue = optionalNonNegativeInteger(record, ['order']) ?? Number.MAX_SAFE_INTEGER
      return {
        orderValue,
        action,
      }
    })
    .filter((candidate): candidate is { readonly orderValue: number; readonly action: string } => Boolean(candidate))
    .sort((left, right) => left.orderValue - right.orderValue)

  const selected = candidates[0]
  if (!selected) {
    throw new ApiReadTransportError(
      'The current role has no visible Work Order list scope',
      'authorization_denied',
    )
  }

  const type = actionQueryValue(selected.action, 'type')
  const status = actionQueryValue(selected.action, 'status')
  const orderState = actionQueryValue(selected.action, 'orderState')

  return {
    mode: type === 'SANode' ? 'workflow-node' : 'service-appointment',
    ...(status ? { statusFilter: status } : {}),
    ...(orderState ? { workflowStateFilter: orderState } : {}),
  }
}

function buildWorkOrderListRequest(
  query: WorkOrderListQuery,
  scope: AdapterWorkOrderListScope,
): ApiReadRequest {
  const body: Record<string, ApiRequestValue> = {
    page: query.page,
    rows: query.pageSize,
    sortField: scope.mode === 'workflow-node' ? 'updateTime' : 'createTime',
    sortOrder: 'desc',
    'is:state|integer#and': 1,
  }

  if (scope.mode === 'workflow-node' && scope.workflowStateFilter) {
    body.orderState = scope.workflowStateFilter
  }
  if (scope.statusFilter) body['in:status|array#and'] = scope.statusFilter

  return {
    method: 'POST',
    path:
      scope.mode === 'workflow-node'
        ? 'basic/serviceAppointment/querySAWorkflowNode'
        : 'basic/serviceAppointment/query',
    body,
  }
}

function createRoleScopedWorkOrderListScopeResolver(
  transport: ApiReadTransport,
  getCurrentRoleId: () => RoleId | null,
): WorkOrderListScopeResolver {
  return {
    async resolve(): Promise<AdapterWorkOrderListScope> {
      const roleId = getCurrentRoleId()
      if (!roleId) {
        throw new ApiReadTransportError(
          'Current role context is required for Work Order reads',
          'authorization_denied',
        )
      }

      const raw = await transport.execute({
        method: 'POST',
        path: 'function/changeRole',
        body: { roleIds: roleId },
      })
      return roleVisibleWorkOrderScope(raw)
    },
  }
}

function readFailure<T>(error: unknown): OperationSnapshot<T> {
  if (error instanceof AdapterMappingError) {
    return adapterFailure('server_terminal', error.message)
  }
  if (error instanceof ApiReadTransportError) {
    return adapterFailure(error.category, error.message)
  }
  return adapterFailure('network_retryable', unknownErrorMessage(error, 'API read transport failed'))
}

export class TechnicianApiReadAdapter implements TechnicianApiReadPort {
  constructor(
    private readonly transport: ApiReadTransport,
    private readonly workOrderScopeResolver?: WorkOrderListScopeResolver,
  ) {}

  private async read<T>(
    request: ApiReadRequest | (() => Promise<ApiReadRequest>),
    map: (raw: unknown) => T,
  ): Promise<OperationSnapshot<T>> {
    try {
      const resolvedRequest = typeof request === 'function' ? await request() : request
      const raw = await this.transport.execute(resolvedRequest)
      return succeeded(map(raw))
    } catch (error) {
      return readFailure(error)
    }
  }

  async listWorkOrders(query: WorkOrderListQuery) {
    if (!this.workOrderScopeResolver) {
      return this.read<ReadPage<WorkOrderSummary>>(
        {
          method: 'POST',
          path: 'basic/serviceAppointment/query',
          body: { page: query.page, rows: query.pageSize },
        },
        (raw) => pageEnvelope(raw, workOrderSummary),
      )
    }

    try {
      const scope = await this.workOrderScopeResolver.resolve()
      return await this.read<ReadPage<WorkOrderSummary>>(
        buildWorkOrderListRequest(query, scope),
        (raw) =>
          pageEnvelope(
            raw,
            scope.mode === 'workflow-node' ? sanodeWorkOrderSummary : workOrderSummary,
          ),
      )
    } catch (error) {
      return readFailure<ReadPage<WorkOrderSummary>>(error)
    }
  }

  getWorkOrderDetail(id: WorkOrderId) {
    return this.read<WorkOrderDetail>(
      {
        method: 'POST',
        path: `basic/serviceAppointment/queryById/${encodeURIComponent(id)}`,
        body: { type: 'query' },
      },
      (raw) => workOrderDetail(raw, id),
    )
  }

  getWorkflowDefinition(id: WorkflowDefinitionId) {
    return this.read<WorkflowDefinitionRead>(
      {
        method: 'POST',
        path: `workflowDef/queryById/${encodeURIComponent(id)}`,
      },
      (raw) => workflowDefinition(raw, id),
    )
  }

  getWorkflowNodes(runId: WorkflowRunId) {
    return this.read<readonly WorkflowNodeRead[]>(
      { method: 'POST', path: `workflow/queryNode/${encodeURIComponent(runId)}` },
      (raw) => {
        const envelope = asRecord(raw, 'workflow node response')
        const items = nestedValue(envelope, ['data', 'items'])
        if (!Array.isArray(items)) throw new AdapterMappingError('workflow node response items are missing')
        return items.map(workflowNode)
      },
    )
  }

  getChildWorkflowNodes(parentNodeId: WorkflowNodeRuntimeId) {
    return this.read<readonly WorkflowNodeRead[]>(
      {
        method: 'POST',
        path: `workflow/queryByParentWorkflowNodeId/${encodeURIComponent(parentNodeId)}`,
      },
      (raw) => {
        const envelope = asRecord(raw, 'child workflow node response')
        const items = nestedValue(envelope, ['data', 'items'])
        if (!Array.isArray(items)) throw new AdapterMappingError('child workflow node items are missing')
        return items.map(workflowNode)
      },
    )
  }

  getFormDefinition(id: FormDefinitionId) {
    return this.read<FormDefinitionRead>(
      {
        method: 'POST',
        path: 'biz/extField/query',
        body: { extId: id },
      },
      (raw) => formDefinition(raw, id),
    )
  }

  getFormData(input: { readonly definitionId: FormDefinitionId; readonly dataId?: FormDataId }) {
    return this.read<ReadPage<FormDataRead>>(
      {
        method: 'POST',
        path: `biz/extForm/query/${encodeURIComponent(input.definitionId)}`,
        ...(input.dataId ? { body: { id: input.dataId } } : {}),
      },
      (raw) => pageEnvelope(raw, formData),
    )
  }

  getFormDetail(input: { readonly definitionId: FormDefinitionId; readonly dataId: FormDataId }) {
    return this.read<FormDataRead>(
      {
        method: 'GET',
        path: 'biz/extForm/findByIdWithWorkflow',
        query: { extId: input.definitionId, id: input.dataId },
      },
      (raw) => {
        const envelope = asRecord(raw, 'form detail response')
        const data = nestedValue(envelope, ['data', 'entity'])
        return formData(data ?? envelope)
      },
    )
  }

  getCodeOptions(query: CodeOptionsQuery) {
    const body: Record<string, ApiRequestValue> = {}
    if (query.valueOption) body.valueOption = query.valueOption
    if (query.parentValue) body.parentId = query.parentValue
    return this.read<ReadPage<CodeOptionRead>>(
      { method: 'POST', path: 'code/query', ...(Object.keys(body).length > 0 ? { body } : {}) },
      (raw) => pageEnvelope(raw, codeOption),
    )
  }
}

export function createTechnicianApiReadAdapter(transport: ApiReadTransport): TechnicianApiReadPort {
  return new TechnicianApiReadAdapter(transport)
}

export function createRoleScopedTechnicianApiReadAdapter(
  transport: ApiReadTransport,
  getCurrentRoleId: () => RoleId | null,
): TechnicianApiReadPort {
  return new TechnicianApiReadAdapter(
    transport,
    createRoleScopedWorkOrderListScopeResolver(transport, getCurrentRoleId),
  )
}
