import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { r1ReadFieldDisplayValue } from '@features/work-orders/r1-record-read-fields'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import type { SessionSnapshot } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

type Reply = { statusCode: number; data: unknown }
type Endpoint = 'configuration' | 'dictionary'
const unexpectedRequests: string[] = []
const ok = (data: unknown): Reply => ({ statusCode: 200, data })
const field = { _id: 'memo-field', name: 'memo', nameDisp: 'Configured memo', type: 'radio',
  valueOption: 'information-choice', colName: 'serviceAppointment', tenantId: 'tenant',
  state: 1, preset: 0, showList: ['4'] }
const schema = () => ok({ data: [field], total: 1, page: 1, size: 200 })
const session = (key = 'old-session'): SessionSnapshot => ({ sessionRef: asOpaqueId<'SessionRef'>(key),
  user: { id: asOpaqueId<'UserId'>('user') }, currentRole: { id: asOpaqueId<'RoleId'>('role') },
  roleVersion: 'v1', capabilityNames: [] })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  unexpectedRequests.length = 0
  setActivePinia(createPinia())
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_API_BASE_URL', 'http://127.0.0.1:5189/xlink/wm')
  vi.stubEnv('VITE_XLINK_MOCK', 'false')
})
afterEach(() => {
  vi.unstubAllEnvs()
  expect(unexpectedRequests).toEqual([])
})

function harness() {
  const actor = ref<SessionSnapshot | null>(session())
  let tenant: string | null = 'tenant'
  let configuration: () => Promise<Reply> = async () => schema()
  let dictionary: (page: number) => Promise<Reply> = async page => ok({
    data: [{ _id: 'choice', type: 'information-choice', value: 'value', name: 'Verified option' }],
    total: 1, page, rows: 50,
  })
  const calls: { path: string; body: Record<string, string> }[] = []
  // Every HTTP response is injected; even an unknown request cannot reach a network.
  const request = vi.fn((options: UniNamespace.RequestOptions) => {
    const path = new URL(options.url).pathname.replace('/xlink/wm/', '')
    const body = Object.fromEntries(new URLSearchParams(String(options.data ?? '')))
    calls.push({ path, body })
    let reply: Promise<Reply>
    if (path === 'function/changeRole') reply = Promise.resolve(ok({ data: { functionList: [
      { action: '/pages/serviceAppointment/serviceAppointments', order: 0, exts: { tabDisplay: '1' } },
    ] } }))
    else if (path === 'basic/serviceAppointment/query') reply = Promise.resolve(ok({ data: [{ _id: 'A' }, { _id: 'B' }], page: 1, rows: 20, total: 2 }))
    else if (/^basic\/serviceAppointment\/queryById\/[AB]$/.test(path)) reply = Promise.resolve(ok({ data: {
      serviceAppointment: { _id: path.slice(-1), tenantId: 'tenant', name: 'Verified customer', exts: { memo: 'value' } },
    } }))
    else if (path === 'biz/extField/query') reply = configuration()
    else if (path === 'code/query' && body['is:type|string#and'] === 'information-choice') reply = dictionary(Number(body.page))
    else if (path === 'biz/action/query.do') reply = Promise.resolve(ok({ data: [] }))
    else {
      unexpectedRequests.push(path)
      reply = Promise.reject(new Error('Unexpected synthetic HTTP request: ' + path))
    }
    void reply.then(result => options.success?.(result as UniNamespace.RequestSuccessCallbackResult),
      error => options.fail?.(error))
  })
  const transport = createUniApiReadTransport({ apiBaseUrl: 'http://127.0.0.1:5189/xlink/wm',
    getSessionRef: () => actor.value?.sessionRef ?? null, request })
  const api = createRoleScopedTechnicianApiReadAdapter(transport, () => actor.value?.currentRole?.id ?? null,
    { codeTenantId: 'tenant', getReadTenantId: () => tenant, getReadAuthorizationScope: () => {
      const current = actor.value
      return current?.currentRole ? { sessionRef: current.sessionRef, userId: current.user.id,
        roleId: current.currentRole.id, roleVersion: current.roleVersion ?? null } : null
    } })
  const store = useWorkOrderDetailStore()
  const invalidate = vi.fn(async () => { actor.value = null })
  store.configureApi(api, () => actor.value, invalidate)
  return { actor, calls, store, invalidate, setTenant: (value: string | null) => { tenant = value },
    configure: (next: () => Promise<Reply>) => { configuration = next },
    dictionary: (next: (page: number) => Promise<Reply>) => { dictionary = next },
    list: () => api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' }),
    read: (id = 'A') => store.load(asOpaqueId<'WorkOrderId'>(id)) }
}

describe('information HTTP failures through transport, adapter and detail Store', () => {
  it.each([['configuration', 401], ['configuration', 403], ['dictionary', 401], ['dictionary', 403]] as const)(
    '%s HTTP %s clears previous detail without publishing a fallback', async (endpoint, statusCode) => {
      const h = harness(); await h.list(); expect((await h.read()).state).toBe('succeeded')
      const denial = async () => ({ statusCode, data: { data: [], total: 0, page: 1 } })
      if (endpoint === 'configuration') h.configure(denial); else h.dictionary(denial)
      const activitiesBefore = h.calls.filter(c => c.path === 'biz/action/query.do').length
      const result = await h.read()
      expect(result.error?.category).toBe(statusCode === 401 ? 'session_invalid' : 'authorization_denied')
      expect(result.data).toBeUndefined(); expect(h.store.detail).toBeNull()
      expect(h.invalidate).toHaveBeenCalledTimes(statusCode === 401 ? 1 : 0)
      expect(h.calls.filter(c => c.path === 'biz/action/query.do')).toHaveLength(activitiesBefore)
    })

  it.each(['configuration', 'dictionary'] as const)('%s HTTP 503 preserves only its permitted fallback', async endpoint => {
    const h = harness(); await h.list()
    const offline = async () => ({ statusCode: 503, data: {} })
    if (endpoint === 'configuration') h.configure(offline); else h.dictionary(offline)
    const result = await h.read(); expect(result.state).toBe('succeeded')
    if (endpoint === 'configuration') {
      expect(result.data?.informationFields).toBeUndefined()
      expect(result.data?.customerName).toBe('Verified customer')
    } else {
      const info = result.data!.informationFields![0]!
      expect(r1ReadFieldDisplayValue(info.field, info.value)).toBe('value（选项未核实）')
    }
    expect(h.invalidate).not.toHaveBeenCalled()
  })

  it.each([['configuration', 401], ['configuration', 403], ['dictionary', 401], ['dictionary', 403]] as const)(
    'late old %s HTTP %s cannot clear or invalidate a newly logged-in detail', async (endpoint: Endpoint, statusCode) => {
      const h = harness(); await h.list()
      const held = deferred<Reply>(), arrived = deferred<void>()
      const pendingReply = () => { arrived.resolve(); return held.promise }
      if (endpoint === 'configuration') h.configure(pendingReply); else h.dictionary(pendingReply)
      const old = h.read(); await arrived.promise
      h.actor.value = session('new-session')
      h.configure(async () => schema())
      h.dictionary(async page => ok({ data: [], total: 0, page, rows: 50 }))
      await h.list(); expect((await h.read('B')).state).toBe('succeeded')
      const current = h.store.detail
      held.resolve({ statusCode, data: {} })
      expect((await old).error?.category).toBe('authorization_denied')
      expect(h.store.detail).toBe(current); expect(String(h.store.detail?.id)).toBe('B')
      expect(h.actor.value?.sessionRef).toBe('new-session'); expect(h.invalidate).not.toHaveBeenCalled()
    })

  it.each(['role', 'tenant'] as const)('withdraws %s while dictionary page two is pending, even if that page fails', async change => {
    const h = harness(); await h.list()
    const held = deferred<Reply>(), arrived = deferred<void>()
    h.dictionary(async page => {
      if (page === 2) { arrived.resolve(); return held.promise }
      return ok({ data: Array.from({ length: 50 }, (_, index) => ({ _id: 'choice-' + index,
        type: 'information-choice', value: String(index), name: 'Option ' + index })), total: 51, page, rows: 50 })
    })
    const old = h.read(); await arrived.promise
    if (change === 'role') h.actor.value = { ...session(), currentRole: { id: asOpaqueId<'RoleId'>('other') } }
    else h.setTenant('other-tenant')
    held.resolve({ statusCode: 503, data: {} })
    expect((await old).error?.category).toBe('authorization_denied')
    expect(h.store.detail).toBeNull(); expect(h.invalidate).not.toHaveBeenCalled()
    expect(h.calls.filter(c => c.path === 'code/query').map(c => c.body.page)).toEqual(['1', '2'])
    expect(h.calls.some(c => c.path === 'biz/action/query.do')).toBe(false)
  })
})
