import type {
  CascadeCodeOptionsQuery,
  CodeOptionRead,
  CodeOptionsQuery,
  FormDataRead,
  FormValueCodec,
  FormDefinitionRead,
  QuotationActionContentRead,
  ReadPage,
  R1NodeFormReference,
  R1FormsAddOptionRead,
  TechnicianApiReadPort,
  WorkOrderActivity,
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
import {
  AdapterMappingError,
  adapterFailure,
  succeeded,
  unknownErrorMessage,
} from '../common/operations'
import {
  asRecord,
  assertMatchingWireIdentity,
  consistentWireIdentity,
  nestedRecord,
  nestedValue,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalRecord,
  optionalString,
  requiredString,
  type AdapterRecord,
} from '../common/records'
import { buildR1RepeatFormListQuery, readR1NodeFormList } from './r1-node-form-list'
import { isProductionReadOnlyTarget } from '@shared/config'
import { requiredOpaqueId } from './read-models/ids'
import { formData, formDefinition } from './read-models/form'
import { codeOption, dynamicCodeOptions, cascadeCodeOptions, flattenCodeOptions } from './read-models/code-options'
import { workOrderActivities } from './read-models/work-order-activity'
import { workflowDefinition, workflowNode, workflowResponseRows, assertUniqueRuntimeNodeIds } from './read-models/workflow'
import {
  pageContainsServiceAppointmentStatus,
  servicePartCodesFromPage,
  workOrderSummary,
  sanodeWorkOrderSummary,
  detailContainsServiceAppointmentStatus,
  servicePartCodesFromDetail,
  detailPayload,
  workOrderDetail,
} from './read-models/work-order'

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
      'session_invalid' | 'authorization_denied' | 'unsupported_capability' | 'network_retryable' | 'server_terminal'
    >,
  ) {
    super(message)
    this.name = 'ApiReadTransportError'
  }
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
  addSearchCriteria(body, query.searchText)

  return {
    method: 'POST',
    path:
      scope.mode === 'workflow-node'
        ? 'basic/serviceAppointment/querySAWorkflowNode'
        : 'basic/serviceAppointment/query',
    body,
  }
}

const workOrderSearchFields = ['title', 'name', 'phone', 'address', 'describe', 'orderNum'] as const

function addSearchCriteria(body: Record<string, ApiRequestValue>, searchText: string | undefined): void {
  const term = searchText?.trim()
  if (!term) return
  for (const field of workOrderSearchFields) {
    body[`regex:${field}|string#or`] = term
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

      const productionReadOnly = isProductionReadOnlyTarget(
        import.meta.env.VITE_XLINK_ENVIRONMENT,
        import.meta.env.VITE_XLINK_API_BASE_URL,
      )
      const raw = await transport.execute(productionReadOnly
        ? {
            method: 'POST',
            path: 'function/queryTreeByRoleId',
            query: { roleId },
          }
        : {
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
  private currentReadScope: string | null = null
  private readonly listedWorkOrderIds = new Set<string>()
  private readonly authorizedChildWorkflowParentIds = new Set<string>()
  private readonly authorizedRepeatFormContexts = new Set<string>()

  constructor(
    private readonly transport: ApiReadTransport,
    private readonly workOrderScopeResolver?: WorkOrderListScopeResolver,
    private readonly options: TechnicianApiReadAdapterOptions = {},
  ) {}

  private isProductionReadOnly(): boolean {
    return isProductionReadOnlyTarget(
      import.meta.env.VITE_XLINK_ENVIRONMENT,
      import.meta.env.VITE_XLINK_API_BASE_URL,
    )
  }

  private synchronizeReadScope(): string | null {
    let identityScope: ReturnType<NonNullable<TechnicianApiReadAdapterOptions['getReadAuthorizationScope']>> = null
    try {
      identityScope = this.options.getReadAuthorizationScope?.() ?? null
    } catch {
      identityScope = null
    }
    const nextScope = identityScope?.sessionRef && identityScope.userId && identityScope.roleId
      ? JSON.stringify([
          identityScope.sessionRef,
          identityScope.userId,
          identityScope.roleId,
          identityScope.roleVersion,
        ])
      : null
    if (nextScope !== this.currentReadScope) {
      this.currentReadScope = nextScope
      this.listedWorkOrderIds.clear()
      this.authorizedChildWorkflowParentIds.clear()
      this.authorizedRepeatFormContexts.clear()
    }
    return nextScope
  }

  private rememberListedWorkOrders(
    result: OperationSnapshot<ReadPage<WorkOrderSummary>>,
    scopeAtStart: string | null,
  ): void {
    if (!scopeAtStart || this.synchronizeReadScope() !== scopeAtStart
      || result.state !== 'succeeded' || !result.data) return
    for (const item of result.data.items) {
      if (this.listedWorkOrderIds.size >= 100) break
      this.listedWorkOrderIds.add(String(item.id))
    }
  }

  private async read<T>(
    request: ApiReadRequest | (() => Promise<ApiReadRequest>),
    map: (raw: unknown) => T | Promise<T>,
  ): Promise<OperationSnapshot<T>> {
    try {
      const resolvedRequest = typeof request === 'function' ? await request() : request
      const raw = await this.transport.execute(resolvedRequest)
      return succeeded(await map(raw))
    } catch (error) {
      return readFailure(error)
    }
  }

  private async statusLabelsFor(raw: unknown): Promise<ReadonlyMap<string, string>> {
    if (!pageContainsServiceAppointmentStatus(raw)) return new Map()

    const options = await this.getCodeOptions({ valueOption: 'STATUS' })
    if (options.state !== 'succeeded' || !options.data) return new Map()
    return new Map(flattenCodeOptions(options.data.items).map((option) => [option.value, option.label]))
  }

  private async detailStatusLabelsFor(raw: unknown): Promise<ReadonlyMap<string, string>> {
    if (!detailContainsServiceAppointmentStatus(raw)) return new Map()

    const options = await this.getCodeOptions({ valueOption: 'STATUS' })
    if (options.state !== 'succeeded' || !options.data) return new Map()
    return new Map(options.data.items.map((option) => [option.value, option.label]))
  }

  private async partLabelsFor(codes: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (codes.length === 0 || !this.options.cascadeTenantId) return new Map()

    const options = await this.getCascadeCodeOptions({ codeType: 'repairParts' })
    if (options.state !== 'succeeded' || !options.data) return new Map()
    return new Map(options.data.items.map((option) => [option.value, option.label]))
  }

  async listWorkOrders(query: WorkOrderListQuery) {
    const scopeAtStart = this.synchronizeReadScope()
    const productionReadOnly = this.isProductionReadOnly()
    if (productionReadOnly && (!scopeAtStart || !this.workOrderScopeResolver)) {
      return adapterFailure<ReadPage<WorkOrderSummary>>(
        'authorization_denied', 'Production Work Order list requires an authenticated role-scoped resolver',
      )
    }
    if (!this.workOrderScopeResolver) {
      const result = await this.read<ReadPage<WorkOrderSummary>>(
        {
          method: 'POST',
          path: 'basic/serviceAppointment/query',
          body: (() => {
            const body: Record<string, ApiRequestValue> = { page: query.page, rows: query.pageSize }
            addSearchCriteria(body, query.searchText)
            return body
          })(),
        },
        async (raw) => {
          const statusLabels = await this.statusLabelsFor(raw)
          const partLabels = await this.partLabelsFor(servicePartCodesFromPage(raw))
          return pageEnvelope(raw, (item) => workOrderSummary(item, statusLabels, partLabels, !this.isProductionReadOnly()))
        },
      )
      this.rememberListedWorkOrders(result, scopeAtStart)
      return result
    }

    try {
      const scope = await this.workOrderScopeResolver.resolve()
      if (productionReadOnly && this.synchronizeReadScope() !== scopeAtStart) {
        return adapterFailure<ReadPage<WorkOrderSummary>>(
          'authorization_denied', 'Production Work Order list authorization changed before query',
        )
      }
      const result = await this.read<ReadPage<WorkOrderSummary>>(
        buildWorkOrderListRequest(query, scope),
        async (raw) => {
          const statusLabels = await this.statusLabelsFor(raw)
          const partLabels = await this.partLabelsFor(servicePartCodesFromPage(raw))
          return pageEnvelope(raw, (item) =>
            scope.mode === 'workflow-node'
              ? sanodeWorkOrderSummary(item, statusLabels, partLabels, !this.isProductionReadOnly())
              : workOrderSummary(item, statusLabels, partLabels, !this.isProductionReadOnly()),
          )
        },
      )
      if (productionReadOnly && (this.synchronizeReadScope() !== scopeAtStart || !scopeAtStart)) {
        return adapterFailure<ReadPage<WorkOrderSummary>>(
          'authorization_denied', 'Production Work Order list authorization changed during read',
        )
      }
      this.rememberListedWorkOrders(result, scopeAtStart)
      return result
    } catch (error) {
      return readFailure<ReadPage<WorkOrderSummary>>(error)
    }
  }

  async getWorkOrderDetail(id: WorkOrderId) {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = this.synchronizeReadScope()
    if (productionReadOnly) {
      if (!this.options.getReadAuthorizationScope || !scopeAtStart || !this.listedWorkOrderIds.has(String(id))) {
        return adapterFailure<WorkOrderDetail>(
          'authorization_denied',
          'Production Work Order detail requires an ID returned by the current session\'s role-scoped list',
        )
      }
    }
    const result = await this.read<WorkOrderDetail>(
      {
        method: 'POST',
        path: `basic/serviceAppointment/queryById/${encodeURIComponent(id)}`,
        // The legacy type=query flag bypasses the backend's normal workflow
        // visibility check; Production reads deliberately omit that bypass.
        body: productionReadOnly ? {} : { type: 'query' },
      },
      async (raw) => {
        // Detail is authoritative only when the returned ServiceAppointment
        // identity agrees with the requested, previously role-listed ID.
        // In Production, a missing identity cannot authorize child reads.
        const record = detailPayload(raw).record
        if (productionReadOnly && !optionalString(record, ['id', '_id'])) {
          throw new AdapterMappingError('Production Work Order detail identity is missing')
        }
        assertMatchingWireIdentity(record, ['id', '_id'], String(id), 'Work Order detail')
        const statusLabels = await this.detailStatusLabelsFor(raw)
        const partLabels = await this.partLabelsFor(servicePartCodesFromDetail(raw))
        const detail = workOrderDetail(raw, id, statusLabels, partLabels, !productionReadOnly)
        if (productionReadOnly) return detail
        const activities = await this.readWorkOrderActivities(id)
        return activities.state === 'succeeded' && activities.data && activities.data.length > 0
          ? { ...detail, activities: activities.data }
          : detail
      },
    )
    if (productionReadOnly && (this.synchronizeReadScope() !== scopeAtStart
      || !this.listedWorkOrderIds.has(String(id)))) {
      return adapterFailure<WorkOrderDetail>(
        'authorization_denied', 'Production Work Order detail authorization changed during read',
      )
    }
    // A role-listed Work Order followed by its successful, identity-matched
    // detail is the only source of Production child-workflow parent authority.
    // In particular, a caller-supplied node ID is never a capability token.
    if (productionReadOnly && scopeAtStart && result.state === 'succeeded'
      && result.data && String(result.data.id) === String(id)
      && this.synchronizeReadScope() === scopeAtStart
      && this.listedWorkOrderIds.has(String(id))) {
      for (const node of result.data.workflowNodes ?? []) {
        if (this.authorizedChildWorkflowParentIds.size >= 100) break
        if (node.category === 'subworkflow'
          && ['subflows', 'subflow', 'subworkflow'].includes(node.sourceNodeType ?? '')
          && node.runId && result.data.workflowRunId
          && String(node.runId) === String(result.data.workflowRunId)) {
          this.authorizedChildWorkflowParentIds.add(String(node.id))
        }
      }
      for (const node of result.data.workflowNodes ?? []) {
        if (node.runId && result.data.workflowRunId
          && String(node.runId) === String(result.data.workflowRunId)) {
          this.rememberRepeatFormContext(node)
        }
      }
    }
    return result
  }

  isWorkOrderListedForCurrentSession(id: string): boolean {
    const scope = this.synchronizeReadScope()
    return Boolean(this.workOrderScopeResolver && scope && id.trim() && this.listedWorkOrderIds.has(id))
  }

  isChildWorkflowParentListedForCurrentSession(id: string): boolean {
    const scope = this.synchronizeReadScope()
    return Boolean(this.workOrderScopeResolver && scope && id.trim()
      && this.authorizedChildWorkflowParentIds.has(id))
  }

  private repeatFormContextKey(definitionId: string, runId: string): string {
    return JSON.stringify([definitionId, runId])
  }

  private rememberRepeatFormContext(node: WorkflowNodeRead): void {
    if (node.sourceNodeType !== 'repeat' || !node.formDefinitionId || !node.runId
      || this.authorizedRepeatFormContexts.size >= 100) return
    this.authorizedRepeatFormContexts.add(
      this.repeatFormContextKey(String(node.formDefinitionId), String(node.runId)),
    )
  }

  isRepeatFormContextAuthorizedForCurrentSession(definitionId: string, runId: string): boolean {
    const scope = this.synchronizeReadScope()
    return Boolean(this.workOrderScopeResolver && scope && definitionId && runId
      && this.authorizedRepeatFormContexts.has(this.repeatFormContextKey(definitionId, runId)))
  }

  private readWorkOrderActivities(id: WorkOrderId) {
    return this.read<readonly WorkOrderActivity[]>(
      {
        method: 'POST',
        path: 'biz/action/query.do',
        body: {
          bizType: 'serviceAppointment',
          sid: id,
          actionType: '1,2,3,4,5,6',
        },
      },
      (raw) => workOrderActivities(raw),
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
        const items = workflowResponseRows(raw, 'workflow node response')
        const nodes = items.map((rawNode) => {
          const node = asRecord(rawNode, 'workflow node')
          assertMatchingWireIdentity(node, ['runId', 'workflowRunId', 'workflowId'], String(runId), 'Workflow node run')
          return workflowNode({ ...node, workflowId: runId })
        })
        assertUniqueRuntimeNodeIds(nodes, 'Workflow node response')
        return nodes
      },
    )
  }

  async getChildWorkflowNodes(parentNodeId: WorkflowNodeRuntimeId) {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = this.synchronizeReadScope()
    if (productionReadOnly && (!scopeAtStart
      || !this.isChildWorkflowParentListedForCurrentSession(String(parentNodeId)))) {
      return adapterFailure<readonly WorkflowNodeRead[]>(
        'authorization_denied',
        'Production child Workflow read requires an authorized Work Order detail parent',
      )
    }
    const result = await this.read<readonly WorkflowNodeRead[]>(
      {
        method: 'POST',
        path: `workflow/queryByParentWorkflowNodeId/${encodeURIComponent(parentNodeId)}`,
      },
      (raw) => {
        const items = workflowResponseRows(raw, 'child workflow response')
        const nodes = items.flatMap((rawWorkflow) => {
          // R1 WorkflowService.queryByParentWorkflowNodeId returns Workflow[];
          // each workflow carries its own runtime _id and workflowNodeList.
          // Flatten *nodes*, not Workflow objects masquerading as nodes.
          const workflow = asRecord(rawWorkflow, 'child workflow')
          const workflowRunId = requiredOpaqueId<'WorkflowRunId'>(
            workflow, ['_id', 'id', 'workflowId'], 'child workflow run id',
          )
          assertMatchingWireIdentity(workflow, ['_id', 'id', 'workflowId'], String(workflowRunId), 'Child workflow run')
          // R1 Workflow.parentFlowNodeId points to the *outer* subflows node.
          // WorkflowNode.parentWorkflowNodeId instead points to a predecessor
          // *inside* this child run. They are different relationships.
          assertMatchingWireIdentity(
            workflow, ['parentFlowNodeId', 'parentWorkflowNodeId', 'parentNodeId'],
            String(parentNodeId), 'Child workflow outer parent',
          )
          if (!Array.isArray(workflow.workflowNodeList)) {
            throw new AdapterMappingError('Child workflow node list is missing')
          }
          return workflow.workflowNodeList.map((rawNode) => {
            const node = asRecord(rawNode, 'child workflow node')
            assertMatchingWireIdentity(node, ['runId', 'workflowRunId', 'workflowId'], String(workflowRunId), 'Child workflow node run')
            const internalParents = ['parentNodeId', 'parentWorkflowNodeId']
              .map((key) => optionalString(node, [key]))
              .filter((id): id is string => Boolean(id))
            if (new Set(internalParents).size > 1) {
              throw new AdapterMappingError('Child workflow node internal predecessor identities conflict')
            }
            // Never overwrite an internal predecessor with the outer parent.
            return workflowNode({ ...node, workflowId: workflowRunId }, 'child')
          })
        })
        assertUniqueRuntimeNodeIds(nodes, 'Child workflow response')
        return nodes
      },
    )
    if (productionReadOnly && (this.synchronizeReadScope() !== scopeAtStart
      || !this.isChildWorkflowParentListedForCurrentSession(String(parentNodeId)))) {
      return adapterFailure<readonly WorkflowNodeRead[]>(
        'authorization_denied', 'Production child Workflow authorization changed during read',
      )
    }
    if (productionReadOnly && result.state === 'succeeded' && result.data) {
      for (const node of result.data) this.rememberRepeatFormContext(node)
    }
    return result
  }

  getFormDefinition(id: FormDefinitionId) {
    return this.read<FormDefinitionRead>(
      {
        method: 'POST',
        path: 'biz/extField/query',
        body: {
          extId: id,
          sortField: 'order',
          sortOrder: 'asc',
          'is:state|integer#and': 1,
          _all: '1',
        },
      },
      (raw) => formDefinition(raw, id),
    )
  }

  getQuotationActionContent(input: {
    readonly workOrderId: WorkOrderId
    readonly workflowNodeId: WorkflowNodeRuntimeId
  }) {
    return this.read<QuotationActionContentRead>(
      {
        method: 'POST',
        path: '__mock/quotation/action-content',
        body: {
          workOrderId: input.workOrderId,
          workflowNodeId: input.workflowNodeId,
        },
      },
      (raw) => {
        const envelope = asRecord(raw, 'quotation foundation response')
        const data = optionalRecord(envelope.data)
        if (!data) throw new AdapterMappingError('quotation foundation fixture data is missing')
        if (
          optionalString(data, ['workOrderId']) !== String(input.workOrderId)
          || optionalString(data, ['workflowNodeId']) !== String(input.workflowNodeId)
          || optionalString(data, ['fixtureId']) !== 'g4f-quotation-empty-v1'
          || data.quotation !== null
        ) {
          throw new AdapterMappingError('quotation foundation fixture identity or shape is invalid')
        }
        return {
          source: 'mock_fixture',
          fixtureId: 'g4f-quotation-empty-v1',
          state: 'no_persisted_quote',
        }
      },
    )
  }

  /** Inert until a caller with approved scope invokes it. No automatic
   * network, no cross-tenant enumeration, and no FormData values returned. */
  async listRepeatFormReferences(input: {
    readonly definitionId: FormDefinitionId
    readonly workflowRunId: WorkflowRunId
    readonly page: number
    readonly pageSize: number
  }): Promise<OperationSnapshot<ReadPage<R1NodeFormReference>>> {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = this.synchronizeReadScope()
    if (productionReadOnly && (!scopeAtStart || input.page !== 1 || input.pageSize > 20
      || !this.isRepeatFormContextAuthorizedForCurrentSession(String(input.definitionId), String(input.workflowRunId)))) {
      return adapterFailure('authorization_denied', 'Production repeat list requires a proven workflow node and current role')
    }
    let request: ApiReadRequest
    try { request = buildR1RepeatFormListQuery(input) }
    catch {
      return adapterFailure('validation', 'Repeat list must be scoped to a known runtime node with bounded paging')
    }
    const result = await this.read<ReadPage<R1NodeFormReference>>(request, (raw) => {
      const rawPage = pageEnvelope(raw, item => item)
      if (rawPage.items.length > input.pageSize) {
        throw new AdapterMappingError('Repeat response exceeds the requested bounded page')
      }
      for (const item of rawPage.items) {
        const record = asRecord(item, 'repeat form reference')
        consistentWireIdentity(record, ['_id', 'id', 'dataId'], 'Repeat FormData record')
        // The backend may omit formDefId, but explicit contradictory identity
        // is never permitted to cross the role-scoped read boundary.
        assertMatchingWireIdentity(record, ['workflowId', 'workflowRunId', 'runId'],
          String(input.workflowRunId), 'Repeat FormData workflow run')
        assertMatchingWireIdentity(record, ['formDefId', 'formDefinitionId', 'extId'],
          String(input.definitionId), 'Repeat FormData definition')
      }
      const list = readR1NodeFormList({ formDataList: rawPage.items }, 'repeat')
      if (!list || list.evidence !== 'available' || list.truncated) {
        throw new AdapterMappingError('repeat list response identities are malformed or unbounded')
      }
      return { ...rawPage, items: list.entries }
    })
    if (productionReadOnly && (this.synchronizeReadScope() !== scopeAtStart
      || !this.isRepeatFormContextAuthorizedForCurrentSession(String(input.definitionId), String(input.workflowRunId)))) {
      return adapterFailure('authorization_denied', 'Production repeat list authorization changed during read')
    }
    return result
  }

  getFormData(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId?: FormDataId
    readonly valueCodec?: FormValueCodec
  }) {
    const body = {
      sortField: 'createTime',
      sortOrder: 'desc',
      ...(input.dataId ? { 'is:_id|string#and': input.dataId } : {}),
    }
    return this.read<ReadPage<FormDataRead>>(
      {
        method: 'POST',
        path: `biz/extForm/query/${encodeURIComponent(input.definitionId)}`,
        body,
      },
      (raw) => {
        const page = pageEnvelope(raw, (item) => formData(item, input.valueCodec, input.definitionId))
        if (input.dataId && (page.items.length !== 1 || String(page.items[0]?.id) !== String(input.dataId)
          || (page.totalCount !== undefined && page.totalCount !== 1))) {
          throw new AdapterMappingError('R1 exact-ID FormData query returned an unrelated or ambiguous row')
        }
        return page
      },
    )
  }

  getFormDetail(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId: FormDataId
    readonly valueCodec?: FormValueCodec
  }) {
    // R1 serviceAppointment.vue:6987-7013: ordinary forms/repeat edit uses
    // biz/extForm/query/{formDefId} filtered by the exact saved _id.
    // findByIdWithWorkflow is a special-case contract for one construction
    // acceptance FormDef only. Never use its different read semantics for an
    // arbitrary R1 multi-form node.
    if (String(input.definitionId) !== '3285058246984486156') {
      return this.read<FormDataRead>(
        {
          method: 'POST',
          path: `biz/extForm/query/${encodeURIComponent(input.definitionId)}`,
          body: {
            sortField: 'createTime', sortOrder: 'desc',
            'is:_id|string#and': input.dataId,
            page: 1, rows: 2,
          },
        },
        (raw) => {
          const page = pageEnvelope(raw, (item) => formData(item, input.valueCodec, input.definitionId))
          if (page.items.length !== 1
            || String(page.items[0]?.id) !== String(input.dataId)
            || String(page.items[0]?.definitionId) !== String(input.definitionId)
            || (page.totalCount !== undefined && page.totalCount !== 1)) {
            throw new AdapterMappingError('R1 form detail identity is absent or ambiguous')
          }
          return page.items[0]!
        },
      )
    }
    return this.read<FormDataRead>(
      {
        method: 'GET',
        path: 'biz/extForm/findByIdWithWorkflow',
        query: { extId: input.definitionId, id: input.dataId },
      },
      (raw) => {
        const envelope = asRecord(raw, 'form detail response')
        const data = nestedValue(envelope, ['data', 'entity'])
        // R1 serviceAppointment.vue:getFormData uses res.data.data for this
        // exceptional endpoint; other accepted transports unwrap one layer.
        // Preserve only these evidenced wrappers and still check exact ID.
        const wrapper = optionalRecord(data)
        const nestedSaved = optionalRecord(wrapper?.data)
        if (nestedSaved && wrapper) {
          assertMatchingWireIdentity(wrapper, ['_id', 'id', 'dataId'], String(input.dataId), 'R1 acceptance wrapper')
        }
        const saved = formData(nestedSaved ?? data ?? envelope, input.valueCodec, input.definitionId)
        // The special construction-acceptance read uses a different endpoint,
        // but it must prove the same exact saved-record identity as ordinary
        // forms/repeat queries before any consumer can render its values.
        if (String(saved.id) !== String(input.dataId)) {
          throw new AdapterMappingError('R1 construction-acceptance FormData identity does not match the requested record')
        }
        return saved
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

  listR1FormsAddOptions(addFormCodeId:string) {
    if (!addFormCodeId.trim())
      return Promise.resolve(adapterFailure<ReadPage<R1FormsAddOptionRead>>('validation','R1 addFormCodeId is missing'))
    return this.read<ReadPage<R1FormsAddOptionRead>>({
      method:'POST',path:'code/query',body:{parentId:addFormCodeId,'is:state|integer#and':1,
        page:1,rows:50},
    },(raw)=>pageEnvelope(raw,(item)=>{
      const option=asRecord(item,'R1 forms add option')
      const exts=optionalRecord(option.exts)
      return {
        label:requiredString(option,['name','label','text','codelabel'],'R1 form choice label'),
        formDefinitionId:requiredString(exts??{},['formDefId'],'R1 add option FormDefinition ID') as FormDefinitionId,
      }
    }))
  }

  getDynamicCodeOptions(query: { readonly valueOption: string }) {
    const tenantId = this.options.codeTenantId ?? this.options.cascadeTenantId
    if (!tenantId) {
      return Promise.resolve(
        adapterFailure<ReadPage<CodeOptionRead>>(
          'server_terminal',
          'Dynamic code tenant is not configured',
        ),
      )
    }

    return this.read<ReadPage<CodeOptionRead>>(
      {
        method: 'POST',
        path: 'i/code/selectCode.do',
        body: {
          jsonPara: JSON.stringify([{ codeId: query.valueOption, eleid: query.valueOption }]),
          tenantId,
        },
      },
      (raw) => dynamicCodeOptions(raw, query.valueOption),
    )
  }

  getCascadeCodeOptions(query: CascadeCodeOptionsQuery) {
    if (!this.options.cascadeTenantId) {
      return Promise.resolve(
        adapterFailure<ReadPage<CodeOptionRead>>(
          'server_terminal',
          'Cascade code tenant is not configured',
        ),
      )
    }

    return this.read<ReadPage<CodeOptionRead>>(
      {
        method: 'POST',
        path: 'i/code/selectMultistageCode.do',
        body: { types: query.codeType, tenantId: this.options.cascadeTenantId },
      },
      (raw) => cascadeCodeOptions(raw, query.codeType),
    )
  }
}

export interface TechnicianApiReadAdapterOptions {
  /** Current authenticated tenant used by R1's multistage code endpoint. */
  readonly cascadeTenantId?: string
  /** Current authenticated tenant used by R1's batch dynamic code endpoint. */
  readonly codeTenantId?: string
  /** Current principal/role identity, used only to scope ephemeral authorized Work Order IDs in memory. */
  readonly getReadAuthorizationScope?: () => {
    readonly sessionRef: string | null
    readonly userId: string | null
    readonly roleId: string | null
    readonly roleVersion: string | null
  } | null
}

export function createTechnicianApiReadAdapter(
  transport: ApiReadTransport,
  options: TechnicianApiReadAdapterOptions = {},
): TechnicianApiReadPort {
  return new TechnicianApiReadAdapter(transport, undefined, options)
}

export function createRoleScopedTechnicianApiReadAdapter(
  transport: ApiReadTransport,
  getCurrentRoleId: () => RoleId | null,
  options: TechnicianApiReadAdapterOptions = {},
): TechnicianApiReadPort {
  return new TechnicianApiReadAdapter(
    transport,
    createRoleScopedWorkOrderListScopeResolver(transport, getCurrentRoleId),
    options,
  )
}
