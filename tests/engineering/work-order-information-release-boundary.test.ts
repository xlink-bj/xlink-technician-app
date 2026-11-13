import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createRoleScopedTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'

// Injected executors only: a failed assertion can never contact a live host.
afterEach(() => vi.unstubAllEnvs())

const contactReads: readonly ApiReadRequest[] = [
  { method: 'POST', path: 'basic/contacts/query', body: { page: 1, rows: 1, 'is:_id|string#and': 'synthetic-contact', 'is:state|integer#and': 1 } },
  { method: 'POST', path: 'basic/contacts/query', body: { page: 1, rows: 1, _all: '1' } },
  { method: 'POST', path: 'basic/contacts/query', body: { page: 1, rows: 1, notFilterOrgId: '1', notFilterBelongTo: '1' } },
  { method: 'POST', path: 'basic/contacts/queryById', body: { id: 'synthetic-contact' } },
  { method: 'POST', path: 'basic/contacts/queryById', body: { id: 'synthetic-contact', tenantId: 'synthetic-tenant' } },
  { method: 'POST', path: 'basic/contacts/query2', body: { page: 1, rows: 1, roleId: 'synthetic-role' } },
]

describe.each([
  ['prod', 'https://synthetic-production.invalid/wm'],
  ['dev', 'https://xlink.fsgo365.cn/fsgo/wm'],
] as const)('Contacts remains outside the production read contract (%s)', (environment, apiBaseUrl) => {
  it.each(contactReads)('rejects $path with $body before the injected HTTP executor', async input => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', environment)
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
    })
    const transport = createUniApiReadTransport({ apiBaseUrl,
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'), request })
    await expect(transport.execute(input)).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })
})

function workOrderReader(environment: string) {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', environment)
  vi.stubEnv('VITE_XLINK_API_BASE_URL', 'http://127.0.0.1:5189/xlink/wm')
  vi.stubEnv('VITE_XLINK_MOCK', 'false')
  const record = { _id: 'synthetic-work', tenantId: 'synthetic-tenant', name: 'Synthetic customer',
    phone: '13800000000', contactIds: ['synthetic-contact'], state: 1, status: 104, exts: {} }
  const execute = vi.fn(async (input: ApiReadRequest): Promise<unknown> => {
    if (input.path.startsWith('function/')) return { data: { functionList: [{ order: 0,
      exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments' }] } }
    if (input.path === 'basic/serviceAppointment/query') return { data: [record], page: 1, rows: 20, total: 1 }
    if (input.path === 'basic/serviceAppointment/queryById/synthetic-work') return { data: { serviceAppointment: record, workflowNode: [] } }
    if (input.path === 'biz/extField/query') return { data: [], page: 1, size: 200, total: 0 }
    if (input.path === 'code/query') return { data: [], page: Number(input.body?.page), rows: Number(input.body?.rows), total: 0 }
    if (input.path === 'biz/action/query.do') return { data: [] }
    throw new Error('Unexpected synthetic read: ' + input.path)
  })
  const api = createRoleScopedTechnicianApiReadAdapter({ execute }, () => asOpaqueId<'RoleId'>('synthetic-role'), {
    codeTenantId: 'synthetic-tenant', getReadTenantId: () => 'synthetic-tenant',
    getReadAuthorizationScope: () => ({ sessionRef: 'synthetic-session', userId: 'synthetic-user', roleId: 'synthetic-role', roleVersion: null }),
  })
  return { api, execute }
}

it('does not turn an explicit contact reference or Work Order customer values into a Contacts read', async () => {
  const { api, execute } = workOrderReader('dev')
  await api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
  const detail = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-work'))
  expect(detail.state).toBe('succeeded')
  expect(detail.data?.contact?.contactRef).toBe('synthetic-contact')
  expect(detail.data?.informationFields).toEqual([])
  expect(execute.mock.calls.some(([input]) => input.path.startsWith('basic/contacts/') || input.body?.colName === 'contacts')).toBe(false)
})

it.each(['staging', 'test'])('keeps new metadata closed in supported non-DEV %s even when configuration could be returned', async environment => {
  const { api, execute } = workOrderReader(environment)
  await api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
  const detail = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-work'))
  expect(detail.state).toBe('succeeded')
  expect(detail.data?.informationFields).toBeUndefined()
  expect(execute.mock.calls.some(([input]) => input.path === 'biz/extField/query' || input.path.startsWith('basic/contacts/'))).toBe(false)
})
