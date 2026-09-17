import type {
  CascadeCodeOptionsQuery,
  CodeOptionRead,
  CodeOptionsQuery,
  FormDataRead,
  FormFieldRead,
  FormFieldValue,
  FormFieldVisibility,
  FormDefinitionRead,
  ReadPage,
  TechnicianApiReadPort,
  WorkOrderActivity,
  WorkOrderDetail,
  WorkOrderListQuery,
  WorkOrderSummary,
  WorkflowDefinitionRead,
  WorkflowHandlerIdentity,
  WorkflowNodeCategory,
  WorkflowNodeLifecycle,
  WorkflowNodeRead,
  WorkflowNodeVisibilityEvidence,
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
import { countyList } from './reference/area-county-dictionary'
import { appointmentFormDefinitionWireId } from './appointment-contract'

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

function serviceDistrictLabel(record: AdapterRecord): string | undefined {
  const rawDistrict = record.district
  const code =
    typeof rawDistrict === 'number'
      ? rawDistrict
      : typeof rawDistrict === 'string' && /^\d+$/.test(rawDistrict.trim())
        ? Number(rawDistrict.trim())
        : undefined
  if (code === undefined || !Number.isInteger(code)) return undefined
  return countyList[String(code)]
}

function firstStatusCode(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const code = String(value).split(',')[0]?.trim()
  return code || undefined
}

type ActivityTypeCode = 1 | 2 | 3 | 4 | 5 | 6

const activityTypeMeta: Readonly<Record<ActivityTypeCode, { title: string; titleFromName?: boolean; icon: WorkOrderActivity['icon']; tone: WorkOrderActivity['tone']; badge: string }>> = {
  1: { title: '跟进笔记', icon: 'task', tone: 'blue', badge: '笔记' },
  2: { title: '系统记录', titleFromName: true, icon: 'complete', tone: 'gray', badge: '系统' },
  3: { title: '通话记录', icon: 'phone', tone: 'blue', badge: '电话' },
  4: { title: '施工日志', icon: 'location', tone: 'green', badge: '施工' },
  5: { title: '调度记录', icon: 'task', tone: 'orange', badge: '调度' },
  6: { title: '跟进记录', icon: 'task', tone: 'blue', badge: '跟进' },
}

function activityDisplayTime(value: string | undefined): string {
  const time = value?.trim() ?? ''
  if (!time) return '—'

  const dateTime = time.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+(\d{1,2}:\d{2})(?::\d{2})?/)
  if (dateTime) return `${dateTime[1]} ${dateTime[2]}`

  const iso = time.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2})?/)
  if (iso) return `${iso[1]} ${iso[2]}`

  return time.replace(/(\d{1,2}:\d{2}):\d{2}\b/, '$1')
}

function activityRows(raw: unknown): AdapterRecord[] {
  const envelope = optionalRecord(raw)
  if (!envelope) return []
  const responseStatus = optionalString(envelope, ['status'])
  if (responseStatus && responseStatus !== '1') return []

  let data: unknown = envelope.data
  if (typeof data === 'string' && data.trim()) {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return data.map(optionalRecord).filter((row): row is AdapterRecord => Boolean(row))
}

function activityPresentation(
  type: ActivityTypeCode,
  title: string,
  content: string,
): Pick<WorkOrderActivity, 'icon' | 'tone' | 'badge'> {
  const base = activityTypeMeta[type]
  const text = `${title} ${content}`.toLocaleLowerCase()
  const failed = /失败|未成功|错误|异常|error/i.test(text)
  const success = /成功|完成/.test(text) && !failed

  if (failed) return { icon: 'unavailable', tone: 'red', badge: base.badge }
  if (/语音|电话|通话|呼叫/.test(text)) {
    return { icon: 'phone', tone: success ? 'green' : 'blue', badge: base.badge }
  }
  if (/施工|上门|现场|交底|勘察/.test(text)) {
    return { icon: 'location', tone: success ? 'green' : 'orange', badge: base.badge }
  }
  if (/分派|调度|派单|工队/.test(text)) {
    return { icon: 'task', tone: success ? 'green' : 'orange', badge: base.badge }
  }
  if (/接单|处理|流转|节点|工程师/.test(text)) {
    return { icon: 'task', tone: success ? 'green' : 'blue', badge: base.badge }
  }
  if (success) return { icon: 'complete', tone: 'green', badge: base.badge }
  return { icon: base.icon, tone: base.tone, badge: base.badge }
}

function activitySortKey(row: AdapterRecord): string {
  return optionalString(row, ['sortTime', 'createTime', 'time'])?.trim() ?? ''
}

function mapActivityRow(row: AdapterRecord): WorkOrderActivity | null {
  const typeValue = optionalString(row, ['type'])
  const typeNumber = typeValue ? Number.parseInt(typeValue, 10) : Number.NaN
  if (!Number.isInteger(typeNumber) || typeNumber < 1 || typeNumber > 6) return null

  const type = typeNumber as ActivityTypeCode
  const meta = activityTypeMeta[type]
  const name = optionalString(row, ['name'])?.trim() ?? ''
  const title = meta.titleFromName && name ? name : meta.title
  const content = optionalString(row, ['content', 'data'])?.trim() ?? ''
  const time = activityDisplayTime(optionalString(row, ['createTime', 'time']))
  const id = optionalString(row, ['typeId', 'id', '_id'])?.trim() ?? `${type}-${time}`
  const present = activityPresentation(type, title, content)

  return {
    id,
    title,
    content,
    owner: optionalString(row, ['createUserName', 'owner'])?.trim() ?? '—',
    time,
    icon: present.icon,
    tone: present.tone,
    badge: present.badge,
  }
}

function workOrderActivities(raw: unknown): readonly WorkOrderActivity[] {
  const rows = activityRows(raw)
    .sort((left, right) => activitySortKey(right).localeCompare(activitySortKey(left)))
  const activities: WorkOrderActivity[] = []
  for (const row of rows) {
    const activity = mapActivityRow(row)
    if (activity) activities.push(activity)
  }
  return activities
}

function pageContainsServiceAppointmentStatus(raw: unknown): boolean {
  const envelope = asRecord(raw, 'work-order page')
  const rawItems = nestedValue(envelope, ['data', 'items', 'records'])
  if (!Array.isArray(rawItems)) throw new AdapterMappingError('work-order page items are missing')

  return rawItems.some((item) => {
    const record = asRecord(item, 'work-order row')
    const data = nestedRecord(record, ['data']) ?? record
    return firstStatusCode(data.status) !== undefined
  })
}

function serviceAppointmentTaskLabel(
  record: AdapterRecord,
  statusLabels: ReadonlyMap<string, string>,
): string | undefined {
  const statusCode = firstStatusCode(record.status)
  return statusCode ? statusLabels.get(statusCode) : undefined
}

function displayDistance(record: AdapterRecord): string | undefined {
  const extensions = optionalRecord(record.exts)
  const value = extensions?.distance
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return `${value} km`
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return /^\d+(?:\.\d+)?$/.test(normalized) ? `${normalized} km` : undefined
}

function servicePartCodes(record: AdapterRecord): readonly string[] {
  const rawPaths = optionalRecord(record.exts)?.leakagesite_copy
  if (!Array.isArray(rawPaths)) return []

  const codes: string[] = []
  for (const rawPath of rawPaths) {
    if (!Array.isArray(rawPath)) continue
    const first = rawPath[0]
    const code =
      typeof first === 'string' && first.trim().length > 0
        ? first.trim()
        : typeof first === 'number' && Number.isFinite(first)
          ? String(first)
          : undefined
    if (code && !codes.includes(code)) codes.push(code)
  }
  return codes
}

function servicePartCodesFromPage(raw: unknown): readonly string[] {
  const envelope = asRecord(raw, 'work-order page')
  const rawItems = nestedValue(envelope, ['data', 'items', 'records'])
  if (!Array.isArray(rawItems)) throw new AdapterMappingError('work-order page items are missing')

  const codes: string[] = []
  for (const item of rawItems) {
    const record = asRecord(item, 'work-order row')
    const data = nestedRecord(record, ['data']) ?? record
    for (const code of servicePartCodes(data)) {
      if (!codes.includes(code)) codes.push(code)
    }
  }
  return codes
}

function servicePartLabel(
  record: AdapterRecord,
  partLabels: ReadonlyMap<string, string>,
): string | undefined {
  const label = servicePartCodes(record)
    .map((code) => partLabels.get(code))
    .filter((value): value is string => Boolean(value))
    .join(' ')
  if (!label) return undefined
  return label.length > 7 ? `${label.substring(0, 7)}...` : label
}

function communityOrderCount(record: AdapterRecord): number | undefined {
  const extensions = optionalRecord(record.exts)
  return extensions ? optionalNonNegativeInteger(extensions, ['communityOrdersTotal']) : undefined
}

function workOrderSummary(
  raw: unknown,
  statusLabels: ReadonlyMap<string, string>,
  partLabels: ReadonlyMap<string, string>,
): WorkOrderSummary {
  const record = asRecord(raw, 'work-order summary')
  const id = requiredOpaqueId<'WorkOrderId'>(record, ['id', '_id'], 'work-order id')
  const displayNumber = optionalString(record, ['orderNum'])
  const taskLabel = serviceAppointmentTaskLabel(record, statusLabels)
  const servicePartLabelValue = servicePartLabel(record, partLabels)
  const customerName = optionalString(record, ['name'])
  const serviceDistrict = serviceDistrictLabel(record)
  const serviceAddress = optionalString(record, ['address'])
  const distanceText = displayDistance(record)
  const sameCommunityCount = communityOrderCount(record)
  const contact = workOrderListContact(record)

  return {
    id,
    ...(displayNumber ? { displayNumber } : {}),
    ...(taskLabel ? { taskLabel } : {}),
    ...(servicePartLabelValue ? { servicePartLabel: servicePartLabelValue } : {}),
    ...(customerName ? { customerName } : {}),
    ...(serviceDistrict ? { serviceDistrict } : {}),
    ...(serviceAddress ? { serviceAddress } : {}),
    ...(distanceText ? { distanceText } : {}),
    ...(sameCommunityCount !== undefined ? { communityOrderCount: sameCommunityCount } : {}),
    ...(contact ? { contact } : {}),
  }
}

function sanodeWorkOrderSummary(
  raw: unknown,
  statusLabels: ReadonlyMap<string, string>,
  partLabels: ReadonlyMap<string, string>,
): WorkOrderSummary {
  const node = asRecord(raw, 'workflow-node work-order summary')
  const data = nestedRecord(node, ['data'])
  if (!data) throw new AdapterMappingError('workflow-node work-order data is missing')
  return {
    ...workOrderSummary(data, statusLabels, partLabels),
    workflowNodes: [workflowNode(node)],
  }
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

/**
 * R1 exposes the direct list phone action only when the service-appointment
 * status gate has passed. Contact-only rows belong to the deferred relay path
 * and must not create a list dial action.
 */
function workOrderListContact(record: AdapterRecord) {
  const phone = optionalString(record, ['phone'])?.trim()
  const statusCode = firstStatusCode(record.status)
  const statusNumber = statusCode ? Number(statusCode) : Number.NaN
  const syntheticVisualStatus = statusCode?.startsWith('mock-status-') === true
  if (!phone || (!syntheticVisualStatus && (!Number.isFinite(statusNumber) || statusNumber <= 103))) return undefined

  const contactId = firstArrayString(record.contactIds)
  const displayMask = phoneDisplayMask(phone)
  return {
    ...(contactId ? { contactRef: asOpaqueId<'CustomerContactId'>(contactId) } : {}),
    normalizedPhone: phone,
    ...(displayMask ? { displayMask } : {}),
  }
}

function detailPayload(raw: unknown): {
  readonly envelope: AdapterRecord
  readonly payload: AdapterRecord
  readonly record: AdapterRecord
  readonly workflow?: AdapterRecord
  readonly workflowNodes?: readonly unknown[]
} {
  const envelope = asRecord(raw, 'work-order detail response')
  const payload = nestedRecord(envelope, ['data']) ?? envelope
  const record = nestedRecord(payload, ['serviceAppointment', 'workOrder', 'entity']) ?? payload
  const workflow = nestedRecord(payload, ['workflow']) ?? nestedRecord(envelope, ['workflow'])
  const rawWorkflowNodes = nestedValue(payload, ['workflowNode'])
  const workflowNodes = Array.isArray(rawWorkflowNodes) ? rawWorkflowNodes : undefined
  return {
    envelope,
    payload,
    record,
    ...(workflow ? { workflow } : {}),
    ...(workflowNodes ? { workflowNodes } : {}),
  }
}

function detailContainsServiceAppointmentStatus(raw: unknown): boolean {
  const { record } = detailPayload(raw)
  return firstStatusCode(record.status) !== undefined
}

function servicePartCodesFromDetail(raw: unknown): readonly string[] {
  return servicePartCodes(detailPayload(raw).record)
}

function workOrderDetail(
  raw: unknown,
  requestedId: WorkOrderId,
  statusLabels: ReadonlyMap<string, string>,
  partLabels: ReadonlyMap<string, string>,
): WorkOrderDetail {
  const { record, workflow, workflowNodes: rawWorkflowNodes } = detailPayload(raw)
  const id = optionalOpaqueId<'WorkOrderId'>(record, ['id', '_id']) ?? requestedId
  const workflowRunId =
    optionalOpaqueId<'WorkflowRunId'>(record, ['workflowRunId', 'runId']) ??
    (workflow ? optionalOpaqueId<'WorkflowRunId'>(workflow, ['workflowRunId', 'runId', '_id']) : undefined)

  const displayNumber = optionalString(record, ['orderNum'])
  const taskLabel = serviceAppointmentTaskLabel(record, statusLabels)
  const servicePartLabelValue = servicePartLabel(record, partLabels)
  const serviceDistrict = serviceDistrictLabel(record)
  const customerName = optionalString(record, ['name'])
  const serviceAddress = optionalString(record, ['address'])
  const distanceText = displayDistance(record)
  const contact = workOrderContact(record)
  const workflowNodes = rawWorkflowNodes?.map(workflowNode)

  return {
    id,
    ...(workflowRunId ? { workflowRunId } : {}),
    ...(displayNumber ? { displayNumber } : {}),
    ...(taskLabel ? { taskLabel } : {}),
    ...(servicePartLabelValue ? { servicePartLabel: servicePartLabelValue } : {}),
    ...(serviceDistrict ? { serviceDistrict } : {}),
    ...(customerName ? { customerName } : {}),
    ...(serviceAddress ? { serviceAddress } : {}),
    ...(distanceText ? { distanceText } : {}),
    ...(contact ? { contact } : {}),
    ...(workflowNodes ? { workflowNodes } : {}),
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

function workflowNodeCategory(nodeDef: AdapterRecord | undefined): WorkflowNodeCategory {
  const nodeType = optionalString(nodeDef ?? {}, ['nodeType', 'nodeTypeOld'])
  switch (nodeType) {
    case 'forms':
      return 'forms'
    case 'repeat':
      return 'repeat'
    case 'subflows':
    case 'subflow':
    case 'subworkflow':
      return 'subworkflow'
    case 'placeOrder':
      return 'placeOrder'
    case 'user':
      return 'user'
    case 'accept':
      return 'accept'
    case 'allot':
      return 'allot'
    case 'dispatch':
      return 'dispatch'
    case 'system':
      return 'system'
    case 'sentinel':
      return 'sentinel'
    default:
      return 'unsupported'
  }
}

function workflowNodeLifecycle(record: AdapterRecord): WorkflowNodeLifecycle {
  if (record.state === 0) return 'active'
  if (record.state === 10) return 'closed'
  if (record.state === -1) return 'inactive'
  return 'unknown'
}

function workflowNodeHandlers(record: AdapterRecord): readonly WorkflowHandlerIdentity[] | undefined {
  if (!Array.isArray(record.handlerIds)) return undefined

  const handlers: WorkflowHandlerIdentity[] = []
  for (const rawValue of record.handlerIds) {
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') continue
    const value = String(rawValue).trim()
    if (!value) continue

    const separator = value.indexOf('+')
    if (separator > 0 && separator < value.length - 1 && value.indexOf('+', separator + 1) === -1) {
      handlers.push({
        kind: 'organizationRole',
        organizationId: asOpaqueId<'OrganizationId'>(value.slice(0, separator)),
        roleId: asOpaqueId<'RoleId'>(value.slice(separator + 1)),
      })
      continue
    }

    // R1 proves bare handlerIds membership checks against user, role, and
    // org-role identities, but does not provide a wire discriminator.
    handlers.push({ kind: 'unclassified', value })
  }

  return handlers.length > 0 ? handlers : undefined
}

function workflowNodeRoleIds(
  nodeDef: AdapterRecord | undefined,
  key: 'userChoose' | 'viewableRoleIds',
): { readonly present: boolean; readonly valid: boolean; readonly ids: readonly RoleId[] } {
  const rawValue = nodeDef?.[key]
  if (rawValue === undefined) return { present: false, valid: true, ids: [] }
  if (!Array.isArray(rawValue)) return { present: true, valid: false, ids: [] }

  const ids: RoleId[] = []
  let valid = true
  for (const rawId of rawValue) {
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      valid = false
      continue
    }
    const value = String(rawId).trim()
    if (!value) {
      valid = false
      continue
    }
    ids.push(asOpaqueId<'RoleId'>(value))
  }
  return { present: true, valid, ids }
}

function workflowNodeHandlersAreValid(record: AdapterRecord): boolean {
  const rawValue = record.handlerIds
  if (rawValue === undefined) return true
  if (!Array.isArray(rawValue)) return false
  return rawValue.every((value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return false
    return String(value).trim().length > 0
  })
}

function workflowNodeVisibilityEvidence(
  record: AdapterRecord,
  nodeDef: AdapterRecord | undefined,
): WorkflowNodeVisibilityEvidence {
  const selectableRoleIds = workflowNodeRoleIds(nodeDef, 'userChoose')
  const viewableRoleIds = workflowNodeRoleIds(nodeDef, 'viewableRoleIds')
  const handlerIdsPresent = record.handlerIds !== undefined
  const hasEvidence = selectableRoleIds.present || viewableRoleIds.present || handlerIdsPresent
  const structurallyValid =
    selectableRoleIds.valid && viewableRoleIds.valid && workflowNodeHandlersAreValid(record)

  return {
    evidenceState: !structurallyValid ? 'unknown' : hasEvidence ? 'verified' : 'missing',
    ...(selectableRoleIds.present ? { selectableRoleIds: selectableRoleIds.ids } : {}),
    ...(viewableRoleIds.present ? { viewableRoleIds: viewableRoleIds.ids } : {}),
  }
}

function workflowNode(raw: unknown): WorkflowNodeRead {
  const record = asRecord(raw, 'workflow node')
  const nodeDef = nestedRecord(record, ['nodeDef'])
  const definitionId = optionalOpaqueId<'WorkflowDefinitionId'>(record, ['definitionId', 'defId'])
  const runId = optionalOpaqueId<'WorkflowRunId'>(record, ['runId', 'workflowRunId'])
  const parentNodeId = optionalOpaqueId<'WorkflowNodeRuntimeId'>(record, [
    'parentNodeId',
    'parentWorkflowNodeId',
  ])
  const displayName = optionalString(nodeDef ?? {}, ['name'])
  const formDefinitionId = optionalOpaqueId<'FormDefinitionId'>(nodeDef ?? {}, [
    'formDefId',
    'formDefinitionId',
  ])
  const formDataId = optionalOpaqueId<'FormDataId'>(record, ['formDataId', 'dataId'])
  const formPurpose =
    optionalString(nodeDef ?? {}, ['formDefId', 'formDefinitionId']) === appointmentFormDefinitionWireId
      ? ('appointment' as const)
      : undefined
  const handlers = workflowNodeHandlers(record)
  const visibility = workflowNodeVisibilityEvidence(record, nodeDef)
  const isSystem = record.isSystem === true
  const isSentinel = record.isSentinel === true

  return {
    id: requiredOpaqueId<'WorkflowNodeRuntimeId'>(record, ['id', '_id', 'workflowNodeId'], 'workflow node id'),
    category: workflowNodeCategory(nodeDef),
    lifecycle: workflowNodeLifecycle(record),
    visibility,
    ...(displayName ? { displayName } : {}),
    ...(formDefinitionId ? { formDefinitionId } : {}),
    ...(formPurpose ? { formPurpose } : {}),
    ...(formDataId ? { formDataId } : {}),
    ...(definitionId ? { definitionId } : {}),
    ...(runId ? { runId } : {}),
    ...(parentNodeId ? { parentNodeId } : {}),
    ...(handlers ? { handlers } : {}),
    ...(isSystem ? { isSystem } : {}),
    ...(isSentinel ? { isSentinel } : {}),
  }
}

function parsedRecord(value: unknown): AdapterRecord | undefined {
  const direct = optionalRecord(value)
  if (direct) return direct
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    return optionalRecord(JSON.parse(value))
  } catch {
    return undefined
  }
}

function conditionValue(value: unknown): FormFieldValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value) && value.every((item) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
  )) {
    return value as readonly (string | number | boolean)[]
  }
  return undefined
}

function formFieldVisibility(record: AdapterRecord): {
  readonly visibility?: FormFieldVisibility
  readonly unsupportedReason?: string
} {
  const rawConfig = record.frontEndConfig
  const config = parsedRecord(rawConfig)
  const malformedConfig = typeof rawConfig === 'string'
    && rawConfig.trim().length > 0
    && !config
    && /showField|showValue|showType/.test(rawConfig)
  if (malformedConfig) return { unsupportedReason: 'Conditional field visibility metadata is malformed' }

  const directShowField = optionalString(record, ['showField'])
  const configShowField = optionalString(config ?? {}, ['showField'])
  const showField = directShowField ?? configShowField
  const rawShowType = record.showType ?? config?.showType
  const showType = rawShowType === undefined || rawShowType === null ? undefined : String(rawShowType)
  const configExts = optionalRecord(config?.exts)
  const showValueSources = [record, config, configExts].filter(
    (value): value is AdapterRecord => Boolean(value && Object.prototype.hasOwnProperty.call(value, 'showValue')),
  )
  const hasShowValue = showValueSources.length > 0
  const showValue = showValueSources[0]?.showValue
  const hasConditionalMetadata = Boolean(showField) || (showType !== undefined && showType !== '1') || hasShowValue
  if (!hasConditionalMetadata) return {}
  if (!showField) return { unsupportedReason: 'Conditional field visibility is missing its source field' }
  if (showType === '4' || showType === '5') {
    return { unsupportedReason: 'Role-based field visibility is unavailable in this Action Content' }
  }
  if (showType !== undefined && showType !== '2' && showType !== '3' && showValue !== '$exist') {
    return { unsupportedReason: `Unsupported field visibility mode: ${showType}` }
  }
  if (showValue === '$exist' || showType === '2') {
    return { visibility: { kind: 'exists', path: showField, expected: true } }
  }
  if (!hasShowValue) return { unsupportedReason: 'Conditional field visibility is missing its match value' }
  const normalizedValue = conditionValue(showValue)
  if (normalizedValue === undefined) {
    return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
  }
  return { visibility: { kind: 'equals', path: showField, value: normalizedValue } }
}

function formField(raw: unknown): FormFieldRead | null {
  const record = optionalRecord(raw)
  if (!record) return null
  const key = optionalString(record, ['name', 'key', 'fieldName'])?.trim()
  if (!key) return null
  const label = optionalString(record, ['nameDisp', 'label', 'displayName', 'name'])?.trim() ?? key
  const type = optionalString(record, ['type', 'fieldType'])?.trim() ?? 'unknown'
  const requiredValue = record.required
  const readOnlyValue = record.readOnly ?? record.readonly
  const required = requiredValue === true || requiredValue === 1 || requiredValue === '1'
  const readOnly = readOnlyValue === true || readOnlyValue === 1 || readOnlyValue === '1'
  const rawOptions = Array.isArray(record.options) ? record.options : Array.isArray(record.items) ? record.items : undefined
  const options = rawOptions
    ?.map((value) => {
      const option = optionalRecord(value)
      const optionValue = option ? optionalString(option, ['value', 'code', 'id']) : undefined
      const optionLabel = option ? optionalString(option, ['label', 'name', 'text', 'codelabel']) : undefined
      return optionValue && optionLabel ? { value: optionValue, label: optionLabel } : null
    })
    .filter((value): value is { value: string; label: string } => Boolean(value))
  const conditional = formFieldVisibility(record)
  const valueOption = optionalString(record, ['valueOption'])

  return {
    key,
    label,
    type,
    required,
    readOnly,
    ...(options && options.length > 0 ? { options } : {}),
    ...(conditional.visibility ? { visibility: conditional.visibility } : {}),
    ...(valueOption ? { valueOption } : {}),
    ...(conditional.unsupportedReason ? { unsupportedReason: conditional.unsupportedReason } : {}),
  }
}

function formDefinition(raw: unknown, requestedId: FormDefinitionId): FormDefinitionRead {
  const envelope = asRecord(raw, 'form definition response')
  const fieldRows = Array.isArray(envelope.data) ? envelope.data : undefined
  const first = fieldRows ? optionalRecord(fieldRows[0]) : undefined
  const record = nestedRecord(envelope, ['entity', 'definition']) ?? first
  const id = fieldRows
    ? requestedId
    : record
      ? optionalOpaqueId<'FormDefinitionId'>(record, ['id', '_id', 'extId', 'definitionId'])
      : optionalOpaqueId<'FormDefinitionId'>(envelope, ['id', '_id', 'extId', 'definitionId'])
  const rawFields = fieldRows
    ? fieldRows
    : record && Array.isArray(record.fields)
      ? record.fields
      : []
  const fields = rawFields
    .map(formField)
    .filter((value): value is FormFieldRead => Boolean(value))
  const purpose = String(requestedId) === appointmentFormDefinitionWireId
    ? ('appointment' as const)
    : undefined
  return {
    id: id ?? requestedId,
    ...(purpose ? { purpose } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  }
}

function formFieldValue(value: unknown): string | number | boolean | null | readonly (string | number | boolean)[] | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value) && value.every((item) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
  )) {
    return value as readonly (string | number | boolean)[]
  }
  return undefined
}

function formValues(record: AdapterRecord): Readonly<Record<string, string | number | boolean | null | readonly (string | number | boolean)[]>> | undefined {
  const values: Record<string, string | number | boolean | null | readonly (string | number | boolean)[]> = {}
  const extensions = optionalRecord(record.exts)
  if (extensions) {
    for (const [key, value] of Object.entries(extensions)) {
      const normalized = formFieldValue(value)
      if (normalized !== undefined) values[key] = normalized
    }
  }
  const metadata = new Set([
    '_id',
    'id',
    'dataId',
    'extId',
    'formDefId',
    'definitionId',
    'workflowRunId',
    'runId',
    'workflowId',
    'exts',
  ])
  for (const [key, value] of Object.entries(record)) {
    if (metadata.has(key) || key in values) continue
    const normalized = formFieldValue(value)
    if (normalized !== undefined) values[key] = normalized
  }
  return Object.keys(values).length > 0 ? values : undefined
}

function formData(raw: unknown): FormDataRead {
  const record = asRecord(raw, 'form data')
  const workflow = nestedRecord(record, ['workflow'])
  const values = formValues(record)
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
    ...(values ? { values } : {}),
  }
}

function codeOption(raw: unknown): CodeOptionRead {
  const record = asRecord(raw, 'code option')
  return {
    value: requiredString(record, ['value', 'code', 'valueOption'], 'code option value'),
    label: requiredString(record, ['label', 'name', 'text', 'codelabel'], 'code option label'),
  }
}

function cascadeCodeOptions(raw: unknown, codeType: string): ReadPage<CodeOptionRead> {
  const groups = Array.isArray(raw)
    ? raw
    : (() => {
        const envelope = asRecord(raw, 'cascade code response')
        const value = nestedValue(envelope, ['data', 'items', 'records'])
        return Array.isArray(value) ? value : []
      })()
  const group = groups
    .map((value) => asRecord(value, 'cascade code group'))
    .find((value) => optionalString(value, ['type']) === codeType)

  if (!group) return { items: [] }

  const items: CodeOptionRead[] = []
  const seen = new Set<string>()
  const flatten = (value: unknown): void => {
    if (!Array.isArray(value)) return
    for (const child of value) {
      const record = asRecord(child, 'cascade code option')
      const optionValue = optionalString(record, ['value'])
      const label = optionalString(record, ['name'])
      if (optionValue && label && !seen.has(optionValue)) {
        seen.add(optionValue)
        items.push({ value: optionValue, label })
      }
      flatten(record.children)
    }
  }
  flatten(group.children)
  return { items }
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
    private readonly options: TechnicianApiReadAdapterOptions = {},
  ) {}

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
    return new Map(options.data.items.map((option) => [option.value, option.label]))
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
    if (!this.workOrderScopeResolver) {
      return this.read<ReadPage<WorkOrderSummary>>(
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
          return pageEnvelope(raw, (item) => workOrderSummary(item, statusLabels, partLabels))
        },
      )
    }

    try {
      const scope = await this.workOrderScopeResolver.resolve()
      return await this.read<ReadPage<WorkOrderSummary>>(
        buildWorkOrderListRequest(query, scope),
        async (raw) => {
          const statusLabels = await this.statusLabelsFor(raw)
          const partLabels = await this.partLabelsFor(servicePartCodesFromPage(raw))
          return pageEnvelope(raw, (item) =>
            scope.mode === 'workflow-node'
              ? sanodeWorkOrderSummary(item, statusLabels, partLabels)
              : workOrderSummary(item, statusLabels, partLabels),
          )
        },
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
      async (raw) => {
        const statusLabels = await this.detailStatusLabelsFor(raw)
        const partLabels = await this.partLabelsFor(servicePartCodesFromDetail(raw))
        const detail = workOrderDetail(raw, id, statusLabels, partLabels)
        const activities = await this.readWorkOrderActivities(id)
        return activities.state === 'succeeded' && activities.data && activities.data.length > 0
          ? { ...detail, activities: activities.data }
          : detail
      },
    )
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

  getFormData(input: { readonly definitionId: FormDefinitionId; readonly dataId?: FormDataId }) {
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
