import type {
  CascadeCodeOptionsQuery,
  CodeOptionRead,
  CodeOptionsQuery,
  FormDataRead,
  FormFieldOptionRead,
  FormValueCodec,
  FormFieldRead,
  FormFieldPresentation,
  FormFieldValue,
  FormFieldVisibility,
  FormDefinitionRead,
  QuotationActionContentRead,
  QuotationCatalogContext,
  FormPurpose,
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
import { isProductionReadOnlyTarget } from '@shared/config'

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
  includeContact = true,
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
  const contact = includeContact ? workOrderListContact(record) : undefined

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
  includeContact = true,
): WorkOrderSummary {
  const node = asRecord(raw, 'workflow-node work-order summary')
  const data = nestedRecord(node, ['data'])
  if (!data) throw new AdapterMappingError('workflow-node work-order data is missing')
  return {
    ...workOrderSummary(data, statusLabels, partLabels, includeContact),
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

function quotationCatalogContext(record: AdapterRecord): QuotationCatalogContext | undefined {
  // Do not derive catalog scope from display labels or workflow/UI state.
  // These are the ServiceAppointment's persisted provider fields.
  const serviceType = optionalString(record, ['serviceType'])
  if (!serviceType) return undefined
  const sourceType = optionalString(optionalRecord(record.exts) ?? {}, ['sourceType'])
  return {
    serviceType,
    ...(sourceType ? { sourceType } : {}),
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
  includeContact = true,
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
  const contact = includeContact ? workOrderContact(record) : undefined
  const workflowNodes = rawWorkflowNodes?.map(workflowNode)
  const catalogContext = quotationCatalogContext(record)

  return {
    id,
    ...(workflowRunId ? { workflowRunId } : {}),
    ...(displayNumber ? { displayNumber } : {}),
    ...(taskLabel ? { taskLabel } : {}),
    ...(servicePartLabelValue ? { servicePartLabel: servicePartLabelValue } : {}),
    ...(catalogContext ? { quotationCatalogContext: catalogContext } : {}),
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

function verifiedFormPurpose(record: AdapterRecord | undefined): FormPurpose | undefined {
  if (!record) return undefined
  const candidates = ['colName', 'collectionName', 'formPurpose', 'purpose']
    .map((key) => optionalString(record, [key])?.toLocaleLowerCase())
    .filter((value): value is string => Boolean(value))
  const purposes = new Set(candidates.filter((value): value is FormPurpose => value === 'survey' || value === 'appointment'))
  if (purposes.size === 1) return [...purposes][0]
  return undefined
}

function fieldRowsFormPurpose(fieldRows: readonly unknown[]): FormPurpose | undefined {
  if (fieldRows.length === 0) return undefined

  // Every raw ExtField row must independently prove the same known semantic
  // collection. Dropping missing/unknown values before building the set would
  // allow a partially unclassified response to masquerade as a Survey or
  // Appointment form.
  const purposes = fieldRows.map((field) => {
    const row = optionalRecord(field)
    const colName = optionalString(row ?? {}, ['colName'])?.toLocaleLowerCase()
    return colName === 'survey' || colName === 'appointment' ? colName : undefined
  })
  if (purposes.some((purpose): purpose is undefined => purpose === undefined)) return undefined
  const distinctPurposes = new Set(purposes)
  return distinctPurposes.size === 1 ? [...distinctPurposes][0] : undefined
}

function workflowNodeReadOnlyFieldIds(record: AdapterRecord, nodeDef: AdapterRecord | undefined): readonly string[] | undefined {
  const rawValue = record.formFieldIdsReadOnly ?? nodeDef?.formFieldIdsReadOnly
  if (!Array.isArray(rawValue)) return undefined
  const ids = rawValue
    .map((value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '')
    .filter(Boolean)
  return ids.length > 0 ? ids : []
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
  const childWorkflowDefinitionId = optionalOpaqueId<'WorkflowDefinitionId'>(nodeDef ?? {}, ['nodeTypeDef'])
  const displayName = optionalString(nodeDef ?? {}, ['name'])
  const formDefinitionId = optionalOpaqueId<'FormDefinitionId'>(nodeDef ?? {}, [
    'formDefId',
    'formDefinitionId',
  ])
  const formDataId = optionalOpaqueId<'FormDataId'>(record, ['formDataId', 'dataId'])
  const formPurpose =
    verifiedFormPurpose(nodeDef)
    ?? (optionalString(nodeDef ?? {}, ['formDefId', 'formDefinitionId']) === appointmentFormDefinitionWireId
      ? ('appointment' as const)
      : undefined)
  const handlers = workflowNodeHandlers(record)
  const visibility = workflowNodeVisibilityEvidence(record, nodeDef)
  const formFieldIdsReadOnly = workflowNodeReadOnlyFieldIds(record, nodeDef)
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
    ...(formFieldIdsReadOnly ? { formFieldIdsReadOnly } : {}),
    ...(formDataId ? { formDataId } : {}),
    ...(definitionId ? { definitionId } : {}),
    ...(runId ? { runId } : {}),
    ...(parentNodeId ? { parentNodeId } : {}),
    ...(childWorkflowDefinitionId ? { childWorkflowDefinitionId } : {}),
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

function structuralNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function structuralString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function fieldPresentation(record: AdapterRecord, config: AdapterRecord | undefined): FormFieldPresentation | undefined {
  const read = (keys: readonly string[]) => record[keys[0]] ?? config?.[keys[0]]
  const placeholder = structuralString(read(['placeholder']))
  const width = structuralString(read(['width'])) ?? structuralNumber(read(['width']))
  const minlength = structuralNumber(record.minlength ?? record.minLength ?? config?.minlength ?? config?.minLength)
  const maxlength = structuralNumber(record.maxlength ?? record.maxLength ?? config?.maxlength ?? config?.maxLength)
  const group = structuralString(read(['group']))
  const max = structuralNumber(read(['max']))
  const min = structuralNumber(read(['min']))
  const componentType = structuralString(read(['componentType']))
  const surveyTool = record.surveyTool ?? config?.surveyTool
  const url = config?.url
  const params = config?.params
  const customizeFlag = record.customizeFlag
  const result: FormFieldPresentation = {
    ...(componentType ? { componentType } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(minlength !== undefined ? { minlength } : {}),
    ...(maxlength !== undefined ? { maxlength } : {}),
    ...(group ? { group } : {}),
    ...(typeof customizeFlag === 'boolean' || typeof customizeFlag === 'number' || typeof customizeFlag === 'string'
      ? { customizeFlag: customizeFlag === true || customizeFlag === 1 || customizeFlag === '1' || customizeFlag === 'true' }
      : {}),
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(typeof surveyTool === 'boolean' ? { surveyTool } : {}),
    ...(url !== undefined ? { urlShape: Array.isArray(url) ? 'array' : typeof url } : {}),
    ...(params !== undefined ? { paramsShape: Array.isArray(params) ? 'array' : typeof params } : {}),
  }
  return Object.keys(result).length > 0 ? result : undefined
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
  // R1 Survey rows can carry the generic root showType=1 together with a
  // more specific frontEndConfig.showField/showValue condition. The
  // field-level expression is the effective contract in that shape.
  const showType = configShowField
    && config?.showType === undefined
    && String(rawShowType ?? '') === '1'
    ? undefined
    : rawShowType === undefined || rawShowType === null ? undefined : String(rawShowType)
  const configExts = optionalRecord(config?.exts)
  const recordExts = optionalRecord(record.exts)
  // R1's modern branch uses `field.showValue || field.exts.showValue`.
  // Preserve that fallback: development responses commonly carry an empty
  // root showValue together with the effective list under record.exts.
  const showValueCandidates = configShowField
    ? [config?.showValue]
    : [record.showValue, recordExts?.showValue, config?.showValue, configExts?.showValue]
  const selectedShowValue = showValueCandidates.find((value) =>
    value !== undefined
    && value !== null
    && !(typeof value === 'string' && value.trim().length === 0),
  )
  const hasShowValue = selectedShowValue !== undefined
  const showValue = selectedShowValue
  const hasConditionalMetadata = Boolean(showField) || (showType !== undefined && showType !== '1') || hasShowValue
  if (!hasConditionalMetadata) return {}
  // R1 treats showType=1 as unconditionally visible when no legacy
  // frontEndConfig.showField expression is present. Do not reinterpret an
  // unrelated showValue as a condition in that mode.
  if (showType === '1' && !configShowField && !directShowField) return {}
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
  if (Array.isArray(showValue) && showValue.some((value) => Array.isArray(value))) {
    const alternatives = showValue.map(conditionValue)
    if (alternatives.some((value) => value === undefined)) {
      return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
    }
    return {
      visibility: {
        kind: 'oneOf',
        path: showField,
        values: alternatives as FormFieldValue[],
      },
    }
  }
  if (Array.isArray(showValue)) {
    const values = showValue.map(conditionValue)
    if (values.some((value) => value === undefined)) {
      return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
    }
    return {
      visibility: {
        kind: 'oneOf',
        path: showField,
        values: values as FormFieldValue[],
      },
    }
  }
  const normalizedValue = conditionValue(showValue)
  if (normalizedValue === undefined) {
    return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
  }
  return { visibility: { kind: 'equals', path: showField, value: normalizedValue } }
}

function formField(raw: unknown, rowIndex: number): FormFieldRead | null {
  const record = optionalRecord(raw)
  if (!record) return null
  const valueKey = optionalString(record, ['name', 'key', 'fieldName'])?.trim()
  if (!valueKey) return null
  const rawFieldId = optionalString(record, ['_id', 'id', 'fieldId'])?.trim()
  const fieldId = rawFieldId ?? `unidentified-field-row-${rowIndex + 1}`
  const label = optionalString(record, ['nameDisp', 'label', 'displayName', 'name'])?.trim() ?? valueKey
  const type = optionalString(record, ['type', 'fieldType'])?.trim() ?? 'unknown'
  const requiredValue = record.required
  const readOnlyValue = record.readOnly ?? record.readonly
  const multipleValue = record.multiple
  const required = requiredValue === true || requiredValue === 1 || requiredValue === '1'
  const readOnly = readOnlyValue === true || readOnlyValue === 1 || readOnlyValue === '1'
  const multiple = multipleValue === true || multipleValue === 1 || multipleValue === '1' || multipleValue === 'true'
  const rawOptions = Array.isArray(record.options) ? record.options : Array.isArray(record.items) ? record.items : undefined
  function option(value: unknown): FormFieldOptionRead | null {
    const record = optionalRecord(value)
    const optionValue = record ? optionalString(record, ['value', 'code', 'id']) : undefined
    const optionLabel = record ? optionalString(record, ['label', 'name', 'text', 'codelabel']) : undefined
    if (!record || !optionValue || !optionLabel) return null
    const rawChildren = Array.isArray(record.children) ? record.children : undefined
    const children = rawChildren?.map(option)
    if (children?.some((child): child is null => child === null)) return null
    return {
      value: optionValue,
      label: optionLabel,
      ...(children && children.length > 0 ? { children: children as FormFieldOptionRead[] } : {}),
    }
  }
  const options = rawOptions?.map(option).filter((value): value is FormFieldOptionRead => Boolean(value))
  const malformedOptions = Boolean(rawOptions && options && options.length !== rawOptions.length)
  const conditional = formFieldVisibility(record)
  const valueOption = optionalString(record, ['valueOption'])
  const config = parsedRecord(record.frontEndConfig)
  const order = structuralNumber(record.order ?? record.sort)
  const state = typeof record.state === 'number' || typeof record.state === 'string' ? record.state : undefined
  const fixed = typeof record.fixed === 'string' || typeof record.fixed === 'number' || typeof record.fixed === 'boolean'
    ? record.fixed
    : undefined
  const operationType = typeof record.operationType === 'string' || typeof record.operationType === 'number'
    ? record.operationType
    : undefined
  const showList = Array.isArray(record.showList)
    ? record.showList.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    : undefined
  const presentation = fieldPresentation(record, config)

  return {
    fieldId,
    valueKey,
    label,
    type,
    required,
    readOnly,
    ...(order !== undefined ? { order } : {}),
    ...(state !== undefined ? { state } : {}),
    ...(fixed !== undefined ? { fixed } : {}),
    ...(operationType !== undefined ? { operationType } : {}),
    ...(showList ? { showList } : {}),
    ...(multiple ? { multiple } : {}),
    ...(options && options.length > 0 ? { options } : {}),
    ...(conditional.visibility ? { visibility: conditional.visibility } : {}),
    ...(valueOption ? { valueOption } : {}),
    ...(presentation ? { presentation } : {}),
    ...(!rawFieldId
      ? { unsupportedReason: 'Field row identity is unavailable' }
      : conditional.unsupportedReason
        ? { unsupportedReason: conditional.unsupportedReason }
        : malformedOptions
          ? { unsupportedReason: 'Field option metadata is malformed' }
          : {}),
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
    .map((field, index) => formField(field, index))
    .filter((value): value is FormFieldRead => Boolean(value))
  const purpose = fieldRows
    // `colName` is the Ext identity on field rows. Do not interpret an
    // arbitrary field-level `purpose` value as the form's semantic identity;
    // contradictory Ext identities fail closed as unclassified.
    ? fieldRowsFormPurpose(fieldRows)
    : verifiedFormPurpose(record)
      ?? (String(requestedId) === appointmentFormDefinitionWireId ? ('appointment' as const) : undefined)
  return {
    id: id ?? requestedId,
    ...(purpose ? { purpose } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  }
}

function formFieldValue(value: unknown, codec: FormValueCodec | undefined, valueKey: string): FormFieldValue | undefined {
  if (codec) {
    const decoded = codec.decode(value, { valueKey })
    if (decoded !== undefined) return decoded
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    if (value.every((item) =>
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    )) return value as readonly (string | number | boolean)[]
  }
  return undefined
}

function formValues(record: AdapterRecord, codec?: FormValueCodec): Readonly<Record<string, FormFieldValue>> | undefined {
  const values: Record<string, FormFieldValue> = {}
  const extensions = optionalRecord(record.exts)
  if (extensions) {
    for (const [key, value] of Object.entries(extensions)) {
      const normalized = formFieldValue(value, codec, key)
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
    const normalized = formFieldValue(value, codec, key)
    if (normalized !== undefined) values[key] = normalized
  }
  return Object.keys(values).length > 0 ? values : undefined
}

function formData(raw: unknown, codec?: FormValueCodec): FormDataRead {
  const record = asRecord(raw, 'form data')
  const workflow = nestedRecord(record, ['workflow'])
  const values = formValues(record, codec)
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

function dynamicCodeOptions(raw: unknown, valueOption: string): ReadPage<CodeOptionRead> {
  if (!Array.isArray(raw)) throw new AdapterMappingError('dynamic code response is malformed')
  const entry = raw
    .map((value) => optionalRecord(value))
    .find((value) => value?.eleid === valueOption)
  const options = optionalRecord(entry?.options)
  if (!options) return { items: [] }

  return {
    items: Object.entries(options)
      .map(([value, label]) => {
        if (typeof label !== 'string' || label.trim().length === 0) return null
        return { value, label: label.trim() }
      })
      .filter((value): value is CodeOptionRead => Boolean(value)),
  }
}

function cascadeOption(raw: unknown): CodeOptionRead | null {
  const record = optionalRecord(raw)
  const value = optionalString(record ?? {}, ['value'])
  const label = optionalString(record ?? {}, ['name', 'label'])
  if (!value || !label) return null
  const children = record && Array.isArray(record.children)
    ? record.children
      .map(cascadeOption)
      .filter((item): item is CodeOptionRead => Boolean(item))
    : []
  return {
    value,
    label,
    ...(children.length > 0 ? { children } : {}),
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

  const items = Array.isArray(group.children)
    ? group.children
      .map(cascadeOption)
      .filter((item): item is CodeOptionRead => Boolean(item))
    : []
  return { items }
}

function flattenCodeOptions(options: readonly CodeOptionRead[]): readonly CodeOptionRead[] {
  const output: CodeOptionRead[] = []
  const seen = new Set<string>()
  const visit = (option: CodeOptionRead): void => {
    if (!seen.has(option.value)) {
      seen.add(option.value)
      output.push(option)
    }
    option.children?.forEach(visit)
  }
  options.forEach(visit)
  return output
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

function ephemeralScopeFingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export class TechnicianApiReadAdapter implements TechnicianApiReadPort {
  private currentReadScope: string | null = null
  private readonly listedWorkOrderIds = new Set<string>()

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

  private synchronizeProductionReadScope(): string | null {
    const sessionRef = this.options.getSessionScope?.() ?? null
    const nextScope = sessionRef ? ephemeralScopeFingerprint(sessionRef) : null
    if (nextScope !== this.currentReadScope) {
      this.currentReadScope = nextScope
      this.listedWorkOrderIds.clear()
    }
    return nextScope
  }

  private rememberListedWorkOrders(
    result: OperationSnapshot<ReadPage<WorkOrderSummary>>,
    scopeAtStart: string | null,
  ): void {
    if (!this.isProductionReadOnly() || !scopeAtStart || this.synchronizeProductionReadScope() !== scopeAtStart
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
    const scopeAtStart = this.isProductionReadOnly() ? this.synchronizeProductionReadScope() : null
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
      this.rememberListedWorkOrders(result, scopeAtStart)
      return result
    } catch (error) {
      return readFailure<ReadPage<WorkOrderSummary>>(error)
    }
  }

  getWorkOrderDetail(id: WorkOrderId) {
    const productionReadOnly = this.isProductionReadOnly()
    if (productionReadOnly) {
      const scope = this.synchronizeProductionReadScope()
      if (!this.options.getSessionScope || !scope || !this.listedWorkOrderIds.has(String(id))) {
        return Promise.resolve(adapterFailure<WorkOrderDetail>(
          'authorization_denied',
          'Production Work Order detail requires an ID returned by the current session\'s role-scoped list',
        ))
      }
    }
    return this.read<WorkOrderDetail>(
      {
        method: 'POST',
        path: `basic/serviceAppointment/queryById/${encodeURIComponent(id)}`,
        // The legacy type=query flag bypasses the backend's normal workflow
        // visibility check; Production reads deliberately omit that bypass.
        body: productionReadOnly ? {} : { type: 'query' },
      },
      async (raw) => {
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
      (raw) => pageEnvelope(raw, (item) => formData(item, input.valueCodec)),
    )
  }

  getFormDetail(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId: FormDataId
    readonly valueCodec?: FormValueCodec
  }) {
    return this.read<FormDataRead>(
      {
        method: 'GET',
        path: 'biz/extForm/findByIdWithWorkflow',
        query: { extId: input.definitionId, id: input.dataId },
      },
      (raw) => {
        const envelope = asRecord(raw, 'form detail response')
        const data = nestedValue(envelope, ['data', 'entity'])
        return formData(data ?? envelope, input.valueCodec)
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
  /** Opaque authenticated session reference, used only to scope ephemeral read IDs in memory. */
  readonly getSessionScope?: () => string | null
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
