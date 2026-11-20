import { isBusinessMockMode } from '@adapters/api/mock/config'
import { mockJourneyWorkflowRunId } from '@adapters/api/mock/journey'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { mockJourneyNodes, mockJourneyRoleId, mockJourneyUserId, mockJourneyWorkOrderId } from '@shared/mock-journey-identity'
import type { SessionSnapshot, WorkOrderDetail } from '@shared/ports'

export interface ServiceMockInput {
  readonly detail: WorkOrderDetail
  readonly session: SessionSnapshot | null
  readonly routeOrderId: string | undefined
  readonly view: 'home' | 'customer'
  readonly visible: boolean
  readonly taskNodeId?: string
}

const customer = { orderId: 'mock-work-order-002', runId: 'mock-workflow-run-002' }
const survey = {
  orderId: 'mock-work-order-017-survey-success', runId: 'mock-workflow-run-017',
  nodeId: 'mock-workflow-node-017-inspection', purpose: 'survey', kind: 'survey',
} as const
const privacy = {
  orderId: mockJourneyWorkOrderId, runId: mockJourneyWorkflowRunId,
  nodeId: mockJourneyNodes.appointment, purpose: 'appointment', kind: 'privacy',
} as const

type VisitTask = typeof survey | typeof privacy
type Scope = { readonly key: string; readonly readRevision: number }

type ServiceMockTarget =
  | (Scope & { readonly kind: 'customer'; readonly address: string })
  | (Scope & { readonly kind: VisitTask['kind'] })

type ReadCurrent = () => ServiceMockInput | null
type CustomerReceipt = { readonly id: string; readonly kind: 'customer'; readonly serviceAddress: string }
type SurveyReceipt = { readonly id: string; readonly kind: 'survey'; readonly capturedAt: string; readonly coordinates: string }
type PrivacyReceipt = {
  readonly id: string
  readonly kind: 'privacy'
  readonly requestedWindow: string
  readonly contactOutcome: 'not_contacted'
}
export type ServiceMockReceipt = CustomerReceipt | SurveyReceipt | PrivacyReceipt

interface Entry {
  readonly receipt: ServiceMockReceipt
  readonly submittedRead: number
  readInterrupted: boolean
}

/** These receipts are synthetic, process-local and themselves grant no authorization. */
const entries = new Map<string, Entry>()
const detailReads = new WeakMap<WorkOrderDetail, number>()
let nextRead = 0

function readRevision(detail: WorkOrderDetail): number {
  let revision = detailReads.get(detail)
  if (revision === undefined) {
    revision = ++nextRead
    detailReads.set(detail, revision)
  }
  return revision
}

export function serviceMockTarget(input: ServiceMockInput | null): ServiceMockTarget | null {
  if (!input) return null
  const { detail, session } = input
  if (import.meta.env.DEV !== true || import.meta.env.VITE_XLINK_ENVIRONMENT !== 'dev'
    || import.meta.env.VITE_XLINK_MOCK !== 'true' || import.meta.env.VITE_XLINK_H5_MOCK_E2E !== 'true'
    || import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES !== 'false'
    || import.meta.env.VITE_XLINK_AUTH_TENANT !== 'synthetic-qa-tenant'
    || import.meta.env.VITE_XLINK_SERVICE_REVIEW !== 'true' || isProductionReadOnlyRuntime()
    || isBusinessMockMode() !== 'data' || !input.visible || input.routeOrderId !== detail.id
    || session?.sessionRef !== 'local-mock-only-session' || session.user.id !== mockJourneyUserId
    || session.currentRole?.id !== mockJourneyRoleId || session.roleVersion !== 'local-dev-role-version-1'
    || !session.capabilityNames.includes('work-order.read')) return null

  const scope = (kind: ServiceMockTarget['kind'], nodeId: string | null): Scope => ({
    key: JSON.stringify([session.sessionRef, session.user.id, session.currentRole?.id, session.roleVersion,
      detail.id, detail.workflowRunId, nodeId, kind]),
    readRevision: readRevision(detail),
  })

  if (input.view === 'customer') {
    if (detail.id !== customer.orderId || detail.workflowRunId !== customer.runId
      || detail.informationFields !== undefined || !detail.serviceAddress?.trim()) return null
    return { ...scope('customer', null), kind: 'customer', address: detail.serviceAddress }
  }

  const task = [survey, privacy].find(candidate => detail.id === candidate.orderId
    && detail.workflowRunId === candidate.runId && input.taskNodeId === candidate.nodeId)
  if (!task) return null
  const matches = detail.workflowNodes?.filter(node => node.id === task.nodeId)
  if (matches?.length !== 1) return null
  const [node] = matches
  if ((node.runId && node.runId !== task.runId) || node.lifecycle !== 'active'
    || node.category !== 'forms' || node.nodeTypeEvidence !== 'runtime_node_def'
    || node.formPurpose !== task.purpose || node.isSystem || node.isSentinel
    || node.visibility?.evidenceState !== 'verified'
    || !node.visibility.selectableRoleIds?.some(roleId => roleId === session.currentRole?.id)) return null

  return { ...scope(task.kind, task.nodeId), kind: task.kind }
}

function currentFor(readCurrent: ReadCurrent, key: string): ServiceMockTarget | null {
  const target = serviceMockTarget(readCurrent())
  return target?.key === key ? target : null
}

function recordOnce(target: ServiceMockTarget, receipt: ServiceMockReceipt): 'lookup' {
  if (!entries.has(target.key)) {
    entries.set(target.key, { receipt, submittedRead: target.readRevision, readInterrupted: false })
  }
  return 'lookup'
}

export function submitCustomerMock(readCurrent: ReadCurrent, key: string, address: string) {
  const current = currentFor(readCurrent, key)
  if (current?.kind !== 'customer') return 'denied'
  if (entries.has(key)) return 'lookup'
  const serviceAddress = address.trim()
  if (!serviceAddress || serviceAddress.length > 80 || serviceAddress === current.address.trim()) return 'invalid'
  return recordOnce(current, { id: 'G12-002-01', kind: 'customer', serviceAddress })
}

interface SurveyCapture {
  readonly key: string
  readonly readRevision: number
  readonly capturedAt: string
  readonly coordinates: string
}

export function captureSurveyMock(readCurrent: ReadCurrent, key: string): SurveyCapture | 'denied' | 'location_unavailable' {
  const current = currentFor(readCurrent, key)
  if (current?.kind !== 'survey') return 'denied'
  if (import.meta.env.VITE_XLINK_SERVICE_REVIEW_LOCATION_DENIED === 'true') return 'location_unavailable'
  return {
    key,
    readRevision: current.readRevision,
    capturedAt: new Date().toISOString(),
    coordinates: '39.9700, 116.4300',
  }
}

export function submitSurveyMock(readCurrent: ReadCurrent, key: string, capture: SurveyCapture | null) {
  const current = currentFor(readCurrent, key)
  if (current?.kind !== 'survey') return 'denied'
  if (entries.has(key)) return 'lookup'
  if (!capture || capture.key !== key || capture.readRevision !== current.readRevision) return 'invalid'
  return recordOnce(current, {
    id: 'G13-017-01', kind: 'survey', capturedAt: capture.capturedAt, coordinates: capture.coordinates,
  })
}

export const privacyWindows = { morning: '09:00–11:00', afternoon: '14:00–16:00' } as const
export type PrivacyWindow = keyof typeof privacyWindows

export function requestPrivacyAppointmentMock(readCurrent: ReadCurrent, key: string, window: PrivacyWindow | null) {
  const current = currentFor(readCurrent, key)
  if (current?.kind !== 'privacy') return 'denied'
  if (entries.has(key)) return 'lookup'
  if (window !== 'morning' && window !== 'afternoon') return 'invalid'
  // This isolated fixture uses the next calendar day in Beijing.
  const tomorrow = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return recordOnce(current, {
    id: 'G14-019-01', kind: 'privacy',
    requestedWindow: `${tomorrow} ${privacyWindows[window]}（北京时间）`,
    contactOutcome: 'not_contacted',
  })
}

export function hasServiceMockReceipt(target: ServiceMockTarget | null): boolean {
  return Boolean(target && entries.has(target.key))
}

export function readServiceMockReceipt(readCurrent: ReadCurrent, key: string) {
  const current = currentFor(readCurrent, key)
  if (!current) return 'denied'
  const entry = entries.get(key)
  if (!entry) return 'absent'
  if (current.kind === 'customer' && entry.submittedRead === current.readRevision) return 'refresh_required'
  if (!entry.readInterrupted && import.meta.env.VITE_XLINK_SERVICE_REVIEW_MISS_RECEIPT === 'true') {
    entry.readInterrupted = true
    return 'unknown'
  }
  return entry.receipt
}
