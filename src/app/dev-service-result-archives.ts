import {
  serviceResultArchiveCards,
  type ScopedServiceResultArchiveRead,
  type ServiceResultArchiveKind,
  type ServiceResultArchiveRecord,
} from '@features/work-orders/detail-archive'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'
import type { SessionSnapshot } from '@shared/ports'
import { asOpaqueId, createOperationError } from '@shared/types'
import { isBusinessMockMode } from './business-mock'
import { loadApplicationRuntimeConfig } from './runtime-config'

export const serviceArchiveMockView = 'g06-g07-service-archive' as const
const fixtureOrder = 'mock-work-order-002'
const observerRole = 'synthetic-g06-g07-observer'
const observerSession = 'local-g06-g07-observer-session'
const observerVersion = 'local-dev-g06-g07-observer-1'

const records = {
  acceptance: {
    kind: 'acceptance', workOrderId: fixtureOrder, id: 'mock-g06-acceptance-04009',
    summary: '屋面节点维修已完成现场验收，结论为通过。',
    details: [
      { label: '工单编号', value: '04009' },
      { label: '验收编号', value: 'YS-04009-01' },
      { label: '验收日期', value: '2026-11-16' },
      { label: '验收范围', value: '女儿墙根部与屋面排水口接缝' },
    ],
  },
  warranty: {
    kind: 'warranty', workOrderId: fixtureOrder, id: 'mock-g07-warranty-04009',
    summary: '本次屋面节点维修的质保卡已发放。',
    details: [
      { label: '工单编号', value: '04009' },
      { label: '质保卡编号', value: 'ZB-04009-01' },
      { label: '发放日期', value: '2026-11-17' },
      { label: '质保范围', value: '本次维修的女儿墙根部与屋面排水口接缝' },
    ],
  },
} as const satisfies Record<ServiceResultArchiveKind, ServiceResultArchiveRecord>

export function serviceArchiveMockEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined' || import.meta.env.VITE_XLINK_G06_G07_ARCHIVES !== 'true') return false
  const config = loadApplicationRuntimeConfig()
  return config.ok && config.value.devMockUxSession && isBusinessMockMode() === 'data'
}

function launchOptions(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

/** Explicit alternate role in the existing credential-free H5 session only. */
export function serviceArchiveMockObserver(): SessionSnapshot | undefined {
  if (!serviceArchiveMockEnabled() || launchOptions().get('archiveRole') !== 'observer') return undefined
  return {
    sessionRef: asOpaqueId(observerSession),
    user: { id: asOpaqueId(mockJourneyUserId), displayName: '王师傅' },
    currentRole: { id: asOpaqueId(observerRole), name: '现场协作员' },
    roleVersion: observerVersion,
    capabilityNames: ['work-order.read'],
  }
}

function fixtureActor(session: SessionSnapshot | null): 'technician' | 'observer' | null {
  if (!session || session.user.id !== mockJourneyUserId) return null
  if (session.sessionRef === 'local-mock-only-session' && session.currentRole?.id === mockJourneyRoleId
    && session.roleVersion === 'local-dev-role-version-1') return 'technician'
  if (session.sessionRef === observerSession && session.currentRole?.id === observerRole
    && session.roleVersion === observerVersion) return 'observer'
  return null
}

export interface ServiceArchiveMockRequest {
  readonly kind: ServiceResultArchiveKind
  readonly recordId: string
}

export function serviceArchiveMockRequest(options: Readonly<Record<string, unknown>> | undefined): ServiceArchiveMockRequest | null {
  if (!serviceArchiveMockEnabled() || options?.read !== serviceArchiveMockView) return null
  const { archive, record } = options
  return archive === 'acceptance' || archive === 'warranty'
    ? { kind: archive, recordId: typeof record === 'string' ? record : '' }
    : null
}

export function serviceArchiveMockRequestForHash(hash: string, workOrderId: string): ServiceArchiveMockRequest | null {
  const [route, query] = hash.split('?', 2)
  if (route !== '#/pages/work-orders/detail') return null
  const params = new URLSearchParams(query)
  if (params.getAll('id').length !== 1 || params.get('id') !== workOrderId
    || params.getAll('read').length !== 1 || params.getAll('archive').length !== 1 || params.getAll('record').length !== 1) return null
  return serviceArchiveMockRequest({ read: params.get('read'), archive: params.get('archive'), record: params.get('record') })
}

export function serviceArchiveMockTitle(kind: ServiceResultArchiveKind): string {
  return kind === 'acceptance' ? '正式验收结果' : '已发质保卡'
}

export function serviceArchiveMockRoute(workOrderId: string, kind: ServiceResultArchiveKind, recordId: string): string {
  return `/pages/work-orders/detail?id=${encodeURIComponent(workOrderId)}&read=${serviceArchiveMockView}&archive=${kind}&record=${encodeURIComponent(recordId)}`
}

/** Local fixture snapshots only. The caller supplies an already-loaded exact Work Order. */
export function readServiceArchiveMock(
  workOrderId: string,
  session: SessionSnapshot | null,
  request: ServiceArchiveMockRequest | null,
  retry: boolean,
) {
  if (workOrderId !== fixtureOrder || !serviceArchiveMockEnabled()) return []
  const actorScope = workOrderReadScopeKey(session)
  const actor = fixtureActor(session)
  if (!actorScope || !actor) return []
  const scoped = { workOrderId, actorScope }
  const scenario = launchOptions().get('archiveScenario')
  function read(kind: ServiceResultArchiveKind): ScopedServiceResultArchiveRead {
    const record = records[kind]
    if (actor !== 'technician' || (request && request.recordId !== record.id)) {
      return { ...scoped, result: { state: 'failed_terminal', error: createOperationError('authorization_denied', 'Synthetic archive scope denied') } }
    }
    if (request && scenario === 'transient' && !retry) {
      return { ...scoped, result: { state: 'failed_retryable', error: createOperationError('network_retryable', 'Synthetic archive read interrupted') } }
    }
    return { ...scoped, result: { state: 'succeeded', data: scenario === 'empty' ? null : record } }
  }
  const reads = request ? { [request.kind]: read(request.kind) } : { acceptance: read('acceptance'), warranty: read('warranty') }
  return serviceResultArchiveCards(workOrderId, actorScope, reads)
}
