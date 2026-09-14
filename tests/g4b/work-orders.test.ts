import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  createRoleScopedTechnicianApiReadAdapter,
  createTechnicianApiReadAdapter,
  type ApiReadRequest,
  type ApiReadTransport,
} from '@adapters/api/technician-api'
import { createUniApiReadTransport, type UniApiRequestExecutor } from '@adapters/api/uni-api-read-transport'
import { hasAuthenticatedSession, workOrdersRoute } from '@features/home/access'
import { useWorkOrderListStore } from '@features/work-orders/list'
import type { AuthSessionPort, SessionSnapshot, TechnicianApiReadPort, WorkOrderSummary } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'
import { useSessionStore } from '@shared/state'

type WorkOrderPage = {
  readonly items: readonly WorkOrderSummary[]
  readonly page: number
  readonly pageSize: number
  readonly totalCount: number
}

const authenticatedSession: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('sanitized-session-token'),
  user: { id: asOpaqueId<'UserId'>('sanitized-user-id'), displayName: 'Sanitized Technician' },
  capabilityNames: ['work-order.read'],
}

const firstWorkOrder: WorkOrderSummary = {
  id: asOpaqueId<'WorkOrderId'>('work-order-001'),
  displayNumber: 'DEMO-SA-001',
  customerName: 'Sanitized customer',
  serviceAddress: 'Sanitized service address',
}

function page(
  items: readonly WorkOrderSummary[],
  currentPage = 1,
  totalCount = items.length,
): OperationSnapshot<WorkOrderPage> {
  return {
    state: 'succeeded',
    data: { items, page: currentPage, pageSize: 20, totalCount },
  }
}

function listApi(
  listWorkOrders: TechnicianApiReadPort['listWorkOrders'],
): TechnicianApiReadPort {
  return { listWorkOrders } as unknown as TechnicianApiReadPort
}

function configureStore(
  api: TechnicianApiReadPort,
  session: SessionSnapshot | null = authenticatedSession,
  sessionInvalidation?: () => Promise<unknown>,
) {
  const store = useWorkOrderListStore()
  store.configureApi(api, () => session, sessionInvalidation)
  return store
}

describe('G4-B Home access and Work Order List feature', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('requires an authenticated session before loading work orders', async () => {
    const listWorkOrders = vi.fn()
    const store = configureStore(listApi(listWorkOrders), null)

    const result = await store.load()

    expect(result.error?.category).toBe('session_invalid')
    expect(store.loadState).toBe('failed_terminal')
    expect(listWorkOrders).not.toHaveBeenCalled()
  })

  it('allows authenticated Home access and activates the Work Order route', () => {
    expect(hasAuthenticatedSession('authenticated', authenticatedSession)).toBe(true)
    expect(hasAuthenticatedSession('authenticated', null)).toBe(false)
    expect(hasAuthenticatedSession('unauthenticated', authenticatedSession)).toBe(false)
    expect(workOrdersRoute).toBe('/pages/work-orders/work-orders')
  })

  it('exposes loading state and rejects a duplicate list request', async () => {
    let resolvePending!: (result: OperationSnapshot<WorkOrderPage>) => void
    const pending = new Promise<OperationSnapshot<WorkOrderPage>>((resolve) => {
      resolvePending = resolve
    })
    const listWorkOrders = vi.fn(async () => pending)
    const store = configureStore(listApi(listWorkOrders))

    const first = store.load()
    expect(store.loadState).toBe('loading')
    const duplicate = await store.load()
    expect(duplicate.error?.category).toBe('validation')
    expect(listWorkOrders).toHaveBeenCalledTimes(1)

    resolvePending(page([firstWorkOrder]))
    expect((await first).state).toBe('succeeded')
    expect(store.loadState).toBe('succeeded')
  })

  it('maps normalized success and empty list states without raw backend fields', async () => {
    const successfulApi = listApi(vi.fn(async () => page([firstWorkOrder])))
    const store = configureStore(successfulApi)

    expect((await store.load()).data?.items).toEqual([firstWorkOrder])
    expect(store.items[0]).not.toHaveProperty('stateCode')
    expect(store.loadState).toBe('succeeded')

    const emptyStore = configureStore(listApi(vi.fn(async () => page([], 1, 0))))
    await emptyStore.load()
    expect(emptyStore.loadState).toBe('succeeded')
    expect(emptyStore.items).toEqual([])
  })

  it('keeps retryable and terminal failures explicit and supports manual retry', async () => {
    const retryableApi = listApi(
      vi.fn()
        .mockResolvedValueOnce({
          state: 'failed_retryable' as const,
          error: createOperationError('network_retryable', 'Temporary list failure'),
        })
        .mockResolvedValueOnce(page([firstWorkOrder])),
    )
    const retryableStore = configureStore(retryableApi)
    await retryableStore.load()
    expect(retryableStore.loadState).toBe('failed_retryable')
    expect(await retryableStore.retry()).toMatchObject({ state: 'succeeded' })
    expect(retryableStore.items).toEqual([firstWorkOrder])

    const terminalStore = configureStore(
      listApi(
        vi.fn(async () => ({
          state: 'failed_terminal' as const,
          error: createOperationError('server_terminal', 'Invalid list response'),
        })),
      ),
    )
    await terminalStore.load()
    expect(terminalStore.loadState).toBe('failed_terminal')
    expect(terminalStore.error?.category).toBe('server_terminal')
  })

  it('clears the application session when a protected read reports session_invalid', async () => {
    let persistedSession: SessionSnapshot | null = authenticatedSession
    const endSession = vi.fn(async (): Promise<OperationSnapshot<void>> => {
      persistedSession = null
      return { state: 'succeeded' }
    })
    const authSession: AuthSessionPort = {
      startSession: async () => ({
        state: 'failed_terminal',
        error: createOperationError('validation', 'unused test operation'),
      }),
      restoreSession: async () => ({ state: 'succeeded', data: persistedSession }),
      getCurrentSession: () => persistedSession,
      endSession,
    }
    const sessionStore = useSessionStore()
    sessionStore.configureAuth(authSession)
    sessionStore.status = 'authenticated'
    sessionStore.session = authenticatedSession

    const listWorkOrders = vi
      .fn()
      .mockResolvedValueOnce(page([firstWorkOrder]))
      .mockResolvedValueOnce({
        state: 'failed_terminal' as const,
        error: createOperationError('session_invalid', 'Session is no longer valid'),
      })
    const store = useWorkOrderListStore()
    store.configureApi(
      listApi(listWorkOrders),
      () => sessionStore.session,
      () => sessionStore.endSession().then(() => undefined),
    )

    await store.load()
    expect(store.items).toEqual([firstWorkOrder])

    const result = await store.refresh()

    expect(result.error?.category).toBe('session_invalid')
    expect(store.items).toEqual([])
    expect(persistedSession).toBeNull()
    expect(sessionStore.session).toBeNull()
    expect(sessionStore.status).toBe('unauthenticated')
    expect(hasAuthenticatedSession(sessionStore.status, sessionStore.session)).toBe(false)
    expect(endSession).toHaveBeenCalledTimes(1)
    expect(listWorkOrders).toHaveBeenCalledTimes(2)
  })

  it('uses only the semantic page/pageSize query and supports bounded load-more pagination', async () => {
    const listWorkOrders = vi
      .fn()
      .mockResolvedValueOnce(page([firstWorkOrder], 1, 2))
      .mockResolvedValueOnce(page([{ id: asOpaqueId<'WorkOrderId'>('work-order-002') }], 2, 2))
    const store = configureStore(listApi(listWorkOrders))

    await store.load()
    expect(listWorkOrders).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 20 })
    expect(store.hasMore).toBe(true)

    await store.loadMore()
    expect(listWorkOrders).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 20 })
    expect(store.items).toHaveLength(2)
    expect(store.hasMore).toBe(false)
  })

  it('refreshes from page one and replaces the current list', async () => {
    const listWorkOrders = vi
      .fn()
      .mockResolvedValueOnce(page([firstWorkOrder], 1, 1))
      .mockResolvedValueOnce(page([{ id: asOpaqueId<'WorkOrderId'>('work-order-003') }], 1, 1))
    const store = configureStore(listApi(listWorkOrders))

    await store.load()
    await store.refresh()

    expect(listWorkOrders).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(store.items).toEqual([{ id: 'work-order-003' }])
  })

  it('trims search text, resets to page one, and omits blank search input', async () => {
    const listWorkOrders = vi
      .fn()
      .mockResolvedValueOnce(page([firstWorkOrder], 2, 3))
      .mockResolvedValueOnce(page([], 1, 0))
      .mockResolvedValueOnce(page([firstWorkOrder], 1, 1))
    const store = configureStore(listApi(listWorkOrders))

    await store.load()
    await store.search('  customer  ')
    expect(store.searchText).toBe('customer')
    expect(listWorkOrders).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 20,
      searchText: 'customer',
    })

    await store.search('   ')
    expect(store.searchText).toBe('')
    expect(listWorkOrders).toHaveBeenNthCalledWith(3, { page: 1, pageSize: 20 })
  })
})

describe('G4-B uni read composition boundary', () => {
  it('projects the first role-visible Work Order function inside the API adapter', async () => {
    const roleId = asOpaqueId<'RoleId'>('sanitized-role-001')
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request: ApiReadRequest) => {
        requests.push(request)
        if (request.path === 'function/changeRole') {
          return {
            data: {
              functionList: [
                {
                  functionList: [
                    {
                      order: 20,
                      exts: { tabDisplay: '1' },
                      action:
                        '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=later&status=other',
                    },
                    {
                      order: 10,
                      exts: { tabDisplay: '1' },
                      action:
                        '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=ready&status=target',
                    },
                    {
                      order: 1,
                      exts: { tabDisplay: '0' },
                      action:
                        '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=hidden&status=hidden',
                    },
                  ],
                },
              ],
            },
          }
        }
        return {
          data: [
            {
              _id: 'workflow-node-001',
              state: 1,
              nodeDef: { nodeType: 'sanitized-node' },
              data: {
                _id: 'work-order-001',
                orderNum: 'DEMO-SA-001',
                name: 'Sanitized customer',
                address: 'Sanitized service address',
              },
            },
          ],
          page: 1,
          rows: 20,
          total: 1,
        }
      }),
    }
    const api = createRoleScopedTechnicianApiReadAdapter(transport, () => roleId)

    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.data?.items).toEqual([firstWorkOrder])
    expect(requests[0]).toEqual({
      method: 'POST',
      path: 'function/changeRole',
      body: { roleIds: roleId },
    })
    expect(requests[1]).toEqual({
      method: 'POST',
      path: 'basic/serviceAppointment/querySAWorkflowNode',
      body: {
        page: 1,
        rows: 20,
        sortField: 'updateTime',
        sortOrder: 'desc',
        'is:state|integer#and': 1,
        orderState: 'ready',
        'in:status|array#and': 'target',
      },
    })
    expect(result.data?.items[0]).not.toHaveProperty('type')
    expect(result.data?.items[0]).not.toHaveProperty('status')
    expect(result.data?.items[0]).not.toHaveProperty('orderState')
    expect(result.data?.items[0]).not.toHaveProperty('nodeDef')
    expect(result.data?.items[0]).not.toHaveProperty('_id')
  })

  it('re-resolves role scope for a new session with the same role', async () => {
    const roleId = asOpaqueId<'RoleId'>('sanitized-role-001')
    let currentSession = 'session-a'
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request: ApiReadRequest) => {
        requests.push(request)
        if (request.path === 'function/changeRole') {
          return {
            data: {
              functionList: [
                {
                  functionList: [
                    {
                      order: 1,
                      exts: { tabDisplay: '1' },
                      action: `/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=${currentSession}-scope&status=${currentSession}`,
                    },
                  ],
                },
              ],
            },
          }
        }
        return {
          data: [
            {
              _id: `workflow-node-${currentSession}`,
              data: { _id: `work-order-${currentSession}`, name: 'Sanitized work order' },
            },
          ],
          page: 1,
          rows: 20,
          total: 1,
        }
      }),
    }
    const api = createRoleScopedTechnicianApiReadAdapter(transport, () => roleId)

    await api.listWorkOrders({ page: 1, pageSize: 20 })
    currentSession = 'session-b'
    const second = await api.listWorkOrders({ page: 1, pageSize: 20 })

    const roleRequests = requests.filter((request) => request.path === 'function/changeRole')
    const listRequests = requests.filter((request) => request.path !== 'function/changeRole')
    expect(roleRequests).toHaveLength(2)
    expect(roleRequests[0].body).toEqual({ roleIds: roleId })
    expect(roleRequests[1].body).toEqual({ roleIds: roleId })
    expect(listRequests[0].body).toMatchObject({ orderState: 'session-a-scope' })
    expect(listRequests[1].body).toMatchObject({ orderState: 'session-b-scope' })
    expect(second.data?.items[0].id).toBe('work-order-session-b')
  })

  it('injects the semantic session reference below the API adapter and normalizes the response', async () => {
    const requests: UniNamespace.RequestOptions[] = []
    const request: UniApiRequestExecutor = (options) => {
      requests.push(options)
      options.success?.({
        data: {
          data: [
            {
              id: 'work-order-001',
              orderNum: 'DEMO-SA-001',
              name: 'Sanitized customer',
              address: 'Sanitized service address',
              stateCode: 'legacy-state',
            },
          ],
          page: 1,
          rows: 20,
          total: 1,
        },
        statusCode: 200,
        header: {},
        cookies: [],
      })
    }
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://beta.example.invalid/fsgo/wm/',
      getSessionRef: () => authenticatedSession.sessionRef,
      request,
    })
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.data?.items).toEqual([firstWorkOrder])
    expect(result.data?.items[0]).not.toHaveProperty('stateCode')
    expect(requests[0]).toMatchObject({
      url: 'https://beta.example.invalid/fsgo/wm/basic/serviceAppointment/query',
      method: 'POST',
      data: 'page=1&rows=20',
      dataType: 'json',
      header: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: 'JSESSIONID=sanitized-session-token',
      },
    })
    expect(requests[0]).not.toHaveProperty('responseType')
  })

  it('does not execute an API request without a session reference', async () => {
    const request = vi.fn<UniApiRequestExecutor>()
    const api = createTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://beta.example.invalid/fsgo/wm/',
        getSessionRef: () => null,
        request,
      }),
    )

    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.error?.category).toBe('session_invalid')
    expect(request).not.toHaveBeenCalled()
  })
})
