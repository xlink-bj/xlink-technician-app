import type { QuotationCatalogContext, WorkOrderDetail, WorkOrderSummary } from '@shared/ports'
import type { WorkOrderId } from '@shared/types'
import { asOpaqueId } from '@shared/types'
import { AdapterMappingError } from '../../common/operations'
import {
  asRecord,
  assertMatchingWireIdentity,
  nestedRecord,
  nestedValue,
  optionalNonNegativeInteger,
  optionalRecord,
  optionalString,
  type AdapterRecord,
} from '../../common/records'
import { countyList } from '../reference/area-county-dictionary'
import { optionalOpaqueId, requiredOpaqueId } from './ids'
import { workflowNode, assertUniqueRuntimeNodeIds } from './workflow'

// Work Order list/detail read projections preserve server identities and remain
// independent of transport/session logic. Contact masking is adapter-owned.

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


export function pageContainsServiceAppointmentStatus(raw: unknown): boolean {
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

export function servicePartCodesFromPage(raw: unknown): readonly string[] {
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

export function workOrderSummary(
  raw: unknown,
  statusLabels: ReadonlyMap<string, string>,
  partLabels: ReadonlyMap<string, string>,
  includeContact = true,
): WorkOrderSummary {
  const record = asRecord(raw, 'work-order summary')
  const id = requiredOpaqueId<'WorkOrderId'>(record, ['id', '_id'], 'work-order id')
  assertMatchingWireIdentity(record, ['id', '_id'], String(id), 'Work Order list item')
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

export function sanodeWorkOrderSummary(
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

export function detailPayload(raw: unknown): {
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

function quotationCatalogContext(record: AdapterRecord, workOrderId: WorkOrderId): QuotationCatalogContext | undefined {
  // Do not derive catalog scope from display labels or workflow/UI state.
  // These are the ServiceAppointment's persisted provider fields.
  const serviceType = optionalString(record, ['serviceType'])
  if (!serviceType) return undefined
  const exts = optionalRecord(record.exts)
  // R1 passes this.sourceType to every ranked catalog request. The existing
  // backend distinguishes the property being present from it being absent.
  // Retain an explicitly persisted empty string; do not synthesize a missing
  // source type. Production catalog reads still reject empty scope.
  const sourceType = exts?.sourceType === ''
    ? ''
    : optionalString(exts ?? {}, ['sourceType'])
  return {
    workOrderId,
    serviceType,
    ...(sourceType === undefined ? {} : { sourceType }),
  }
}

export function detailContainsServiceAppointmentStatus(raw: unknown): boolean {
  const { record } = detailPayload(raw)
  return firstStatusCode(record.status) !== undefined
}

export function servicePartCodesFromDetail(raw: unknown): readonly string[] {
  return servicePartCodes(detailPayload(raw).record)
}

export function workOrderDetail(
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
  if (workflowRunId) {
    assertMatchingWireIdentity(record, ['workflowRunId', 'runId'], String(workflowRunId), 'Work Order workflow run')
    if (workflow) {
      assertMatchingWireIdentity(workflow, ['workflowRunId', 'runId', '_id'], String(workflowRunId), 'Work Order nested workflow run')
    }
  }

  const displayNumber = optionalString(record, ['orderNum'])
  const taskLabel = serviceAppointmentTaskLabel(record, statusLabels)
  const servicePartLabelValue = servicePartLabel(record, partLabels)
  const serviceDistrict = serviceDistrictLabel(record)
  const customerName = optionalString(record, ['name'])
  const serviceAddress = optionalString(record, ['address'])
  const distanceText = displayDistance(record)
  const contact = includeContact ? workOrderContact(record) : undefined
  const workflowNodes = rawWorkflowNodes?.map((node) => workflowNode(node))
  if (workflowNodes) {
    assertUniqueRuntimeNodeIds(workflowNodes, 'Work Order detail')
    if (workflowRunId) {
      for (const node of workflowNodes) {
        if (node.runId && String(node.runId) !== String(workflowRunId)) {
          throw new AdapterMappingError('Work Order detail node belongs to a different workflow run')
        }
      }
    }
  }
  const catalogContext = quotationCatalogContext(record, id)

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



