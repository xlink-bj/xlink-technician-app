import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  createTechnicianApiReadAdapter,
  type ApiReadRequest,
  type ApiReadTransport,
} from '@adapters/api/technician-api'
import { createUniPhoneDriver } from '@adapters/platform/uni-phone-driver'
import { createPlatformAdapters } from '@adapters/platform/platform-adapters'
import {
  parseWorkOrderId,
  useWorkOrderDetailStore,
  workOrderDetailRouteFor,
} from '@features/work-orders/detail'
import { hasAuthenticatedSession } from '@features/home/access'
import type {
  AuthSessionPort,
  PhonePort,
  SessionSnapshot,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import { useSessionStore } from '@shared/state'
import {
  asOpaqueId,
  createCapabilityResult,
  createOperationError,
  type OperationSnapshot,
} from '@shared/types'

const authenticatedSession: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('sanitized-session-token'),
  user: {
    id: asOpaqueId<'UserId'>('sanitized-user-id'),
    displayName: 'Sanitized Technician',
  },
  currentRole: {
    id: asOpaqueId<'RoleId'>('sanitized-role-id'),
    name: 'Technician',
  },
  capabilityNames: ['work-order.read'],
}

const workOrderId = asOpaqueId<'WorkOrderId'>('work-order-001')
const detail: WorkOrderDetail = {
  id: workOrderId,
  workflowRunId: asOpaqueId<'WorkflowRunId'>('workflow-run-001'),
  displayNumber: 'WO-SANITIZED-001',
  taskLabel: '待联系',
  currentTask: {
    title: '需要联系客户',
    description: '请尽快与客户沟通需求，确认上门意向',
    actionLabel: '联系客户',
    tone: 'red',
  },
  customerName: 'Sanitized Customer',
  serviceAddress: 'Sanitized service address',
  contact: {
    contactRef: asOpaqueId<'CustomerContactId'>('contact-001'),
    normalizedPhone: '13800000000',
    displayMask: '138****0000',
  },
  workflowNodes: [
    {
      id: asOpaqueId<'WorkflowNodeRuntimeId'>('workflow-node-001'),
      category: 'unsupported',
      lifecycle: 'unknown',
    },
  ],
}

function success<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function detailApi(
  getWorkOrderDetail: TechnicianApiReadPort['getWorkOrderDetail'],
): TechnicianApiReadPort {
  return { getWorkOrderDetail } as unknown as TechnicianApiReadPort
}

function createAuthSession(endSession: AuthSessionPort['endSession']): AuthSessionPort {
  return {
    startSession: async () => ({
      state: 'failed_terminal',
      error: createOperationError('validation', 'unused test operation'),
    }),
    restoreSession: async () => success(authenticatedSession),
    getCurrentSession: () => authenticatedSession,
    endSession,
  }
}

describe('G4-C API detail mapping and route identity', () => {
  it('maps the detail envelope to semantic fields without leaking backend DTOs', async () => {
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request) => {
        requests.push(request)
        if (request.path === 'code/query') {
          return {
            data: [{ value: '104', codelabel: '待联系' }],
            page: 1,
            rows: 20,
            total: 1,
          }
        }
        return {
          data: {
            serviceAppointment: {
              _id: 'work-order-001',
              orderNum: 'WO-SANITIZED-001',
              name: 'Sanitized Customer',
              address: 'Sanitized service address',
              phone: '13800000000',
              contactIds: ['contact-001'],
              workflowRunId: 'workflow-run-001',
              status: '104',
              exts: { sourceType: 'sanitized-source' },
            },
            workflow: { _id: 'workflow-run-001' },
            workflowNode: [{ _id: 'workflow-node-001', nodeDef: { nodeType: 'sanitized' } }],
          },
        }
      }),
    }
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.getWorkOrderDetail(workOrderId)

    expect(result).toEqual(success(detail))
    expect(result.data).not.toHaveProperty('_id')
    expect(result.data).not.toHaveProperty('status')
    expect(result.data).not.toHaveProperty('exts')
    expect(result.data).not.toHaveProperty('workflowNode')
    expect(requests[0]).toEqual({
      method: 'POST',
      path: 'basic/serviceAppointment/queryById/work-order-001',
      body: { type: 'query' },
    })
    expect(requests[1].path).toBe('code/query')
  })

  it('passes only a validated semantic WorkOrderId from list navigation to detail', () => {
    expect(workOrderDetailRouteFor(workOrderId)).toBe('/pages/work-orders/detail?id=work-order-001')
    expect(parseWorkOrderId('work-order-001')).toBe(workOrderId)
    expect(parseWorkOrderId(' ')).toBeNull()
    expect(parseWorkOrderId(undefined)).toBeNull()
    expect(parseWorkOrderId(['work-order-001'])).toBeNull()
  })
})

describe('G4-C Work Order Detail feature', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function configure(
    api: TechnicianApiReadPort,
    session: SessionSnapshot | null = authenticatedSession,
    phone?: PhonePort,
    invalidateSession?: () => Promise<unknown>,
  ) {
    const store = useWorkOrderDetailStore()
    store.configureApi(api, () => session, invalidateSession)
    if (phone) store.configurePhone(phone)
    return store
  }

  it('loads normalized detail data and rejects malformed route identity before reading', async () => {
    const getWorkOrderDetail = vi.fn(async () => success(detail))
    const store = configure(detailApi(getWorkOrderDetail))

    const malformed = await store.loadFromRoute(undefined)
    expect(malformed.error?.category).toBe('validation')
    expect(getWorkOrderDetail).not.toHaveBeenCalled()

    const loaded = await store.loadFromRoute('work-order-001')
    expect(loaded.state).toBe('succeeded')
    expect(getWorkOrderDetail).toHaveBeenCalledWith(workOrderId)
    expect(store.currentWorkOrderId).toBe(workOrderId)
    expect(store.detail).toEqual(detail)
    expect(store.loadState).toBe('succeeded')
  })

  it('does not read detail without an authenticated session', async () => {
    const getWorkOrderDetail = vi.fn(async () => success(detail))
    const store = configure(detailApi(getWorkOrderDetail), null)

    const result = await store.load(workOrderId)

    expect(result.error?.category).toBe('session_invalid')
    expect(getWorkOrderDetail).not.toHaveBeenCalled()
    expect(store.detail).toBeNull()
  })

  it('keeps loading, retryable, terminal, and retry states explicit', async () => {
    const getWorkOrderDetail = vi
      .fn()
      .mockResolvedValueOnce({
        state: 'failed_retryable' as const,
        error: createOperationError('network_retryable', 'Temporary detail failure'),
      })
      .mockResolvedValueOnce(success(detail))
    const store = configure(detailApi(getWorkOrderDetail))

    const first = await store.load(workOrderId)
    expect(first.state).toBe('failed_retryable')
    expect(store.loadState).toBe('failed_retryable')

    const retried = await store.retry()
    expect(retried.state).toBe('succeeded')
    expect(store.detail).toEqual(detail)

    const terminal = configure(
      detailApi(
        vi.fn(async () => ({
          state: 'failed_terminal' as const,
          error: createOperationError('server_terminal', 'Detail is unavailable'),
        })),
      ),
    )
    await terminal.load(workOrderId)
    expect(terminal.loadState).toBe('failed_terminal')
    expect(terminal.error?.category).toBe('server_terminal')
  })

  it('clears current and persisted auth when detail read reports session_invalid', async () => {
    let persistedSession: SessionSnapshot | null = authenticatedSession
    const endSession = vi.fn(async (): Promise<OperationSnapshot<void>> => {
      persistedSession = null
      return { state: 'succeeded' }
    })
    const authSession = createAuthSession(endSession)
    const session = useSessionStore()
    session.configureAuth(authSession)
    session.status = 'authenticated'
    session.session = authenticatedSession

    const getWorkOrderDetail = vi.fn(async () => ({
      state: 'failed_terminal' as const,
      error: createOperationError('session_invalid', 'Session is no longer valid'),
    }))
    const store = useWorkOrderDetailStore()
    store.configureApi(
      detailApi(getWorkOrderDetail),
      () => session.session,
      () => session.endSession().then(() => undefined),
    )

    const result = await store.load(workOrderId)

    expect(result.error?.category).toBe('session_invalid')
    expect(store.detail).toBeNull()
    expect(store.currentWorkOrderId).toBeNull()
    expect(persistedSession).toBeNull()
    expect(session.session).toBeNull()
    expect(session.status).toBe('unauthenticated')
    expect(hasAuthenticatedSession(session.status, session.session)).toBe(false)
    expect(endSession).toHaveBeenCalledTimes(1)
  })

  it('issues only the semantic PhonePort command and preserves capability outcomes', async () => {
    const dial = vi.fn(async () => createCapabilityResult<void>('phone', 'cancelled'))
    const phone: PhonePort = { dial }
    const store = configure(detailApi(vi.fn(async () => success(detail))), authenticatedSession, phone)

    await store.load(workOrderId)
    const result = await store.dialContact()

    expect(result.state).toBe('cancelled')
    expect(store.contactState).toBe('cancelled')
    expect(dial).toHaveBeenCalledWith({
      contactRef: asOpaqueId<'CustomerContactId'>('contact-001'),
      normalizedPhone: '13800000000',
    })
  })

  it('allows direct dialing when only the normalized phone is available', async () => {
    const dial = vi.fn(async () => createCapabilityResult<void>('phone', 'granted'))
    const phone: PhonePort = { dial }
    const phoneOnly: WorkOrderDetail = {
      id: workOrderId,
      contact: { normalizedPhone: '13800000000', displayMask: '138****0000' },
    }
    const store = configure(detailApi(vi.fn(async () => success(phoneOnly))), authenticatedSession, phone)

    await store.load(workOrderId)
    const result = await store.dialContact()

    expect(result.state).toBe('granted')
    expect(dial).toHaveBeenCalledWith({ normalizedPhone: '13800000000' })
  })

  it('does not issue a phone command when direct contact data is unavailable', async () => {
    const dial = vi.fn()
    const phone: PhonePort = { dial }
    const withoutPhone: WorkOrderDetail = {
      id: workOrderId,
      customerName: 'Sanitized Customer',
      contact: { contactRef: asOpaqueId<'CustomerContactId'>('contact-001') },
    }
    const store = configure(detailApi(vi.fn(async () => success(withoutPhone))), authenticatedSession, phone)

    await store.load(workOrderId)
    const result = await store.dialContact()

    expect(result.state).toBe('unavailable')
    expect(dial).not.toHaveBeenCalled()
  })

  it('reports unavailable without contact values and does not invent the relay path', async () => {
    const dial = vi.fn()
    const phone: PhonePort = { dial }
    const withoutContact: WorkOrderDetail = { id: workOrderId }
    const store = configure(detailApi(vi.fn(async () => success(withoutContact))), authenticatedSession, phone)

    await store.load(workOrderId)
    const result = await store.dialContact()

    expect(result.state).toBe('unavailable')
    expect(dial).not.toHaveBeenCalled()
  })
})

describe('G4-C uni phone adapter boundary', () => {
  it('maps injected uni phone outcomes without making a real call in tests', async () => {
    const makePhoneCall = vi.fn((options: UniNamespace.MakePhoneCallOptions) => {
      options.success?.({})
    })
    const adapters = createPlatformAdapters({
      phone: createUniPhoneDriver({ makePhoneCall }),
    })

    const result = await adapters.phone.dial({
      contactRef: asOpaqueId<'CustomerContactId'>('contact-001'),
      normalizedPhone: '13800000000',
    })

    expect(result.state).toBe('granted')
    expect(makePhoneCall).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: '13800000000' }))
  })

  it('maps platform cancellation explicitly', async () => {
    const makePhoneCall = vi.fn((options: UniNamespace.MakePhoneCallOptions) => {
      options.fail?.({ errMsg: 'makePhoneCall:fail cancel' })
    })
    const adapters = createPlatformAdapters({
      phone: createUniPhoneDriver({ makePhoneCall }),
    })

    const result = await adapters.phone.dial({
      contactRef: asOpaqueId<'CustomerContactId'>('contact-001'),
      normalizedPhone: '13800000000',
    })

    expect(result.state).toBe('cancelled')
  })
})
