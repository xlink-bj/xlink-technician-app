import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { resetBusinessMockCache } from '@adapters/api/mock'

const workOrderId = 'listed-wo-synthetic'
const orderRequest = {
  method: 'POST' as const,
  path: 'basic/order/query',
  body: {
    page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
    'is:serviceAppointmentId|string#and': workOrderId,
    'is:type|integer#and': 1,
  },
}
const completed = (wire: UniNamespace.RequestOptions) =>
  wire.success?.({ statusCode: 200, data: { data: [{ ownerPhone: 'PRIVATE-SYNTHETIC-VALUE' }] } } as never)
function transport(
  options: {
    readonly listed?: (id: string) => boolean
    readonly identity?: () => string | null
    readonly session?: () => string | null
    readonly request?: (wire: UniNamespace.RequestOptions) => void
  } = {},
) {
  const request = vi.fn(options.request ?? completed)
  const adapter = createUniApiReadTransport({
    apiBaseUrl: 'https://production.invalid',
    getSessionRef: () => (options.session?.() ?? 'synthetic-session') as never,
    ...(options.listed ? { isOrderWorkOrderListedForCurrentSession: options.listed } : {}),
    ...(options.identity ? { getOrderReadAuthorizationIdentity: options.identity } : {}),
    request,
  })
  return { adapter, request }
}

describe('C11 P0 raw Production official Order transport role fence', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
  })

  it('blocks a perfectly shaped Order request when its caller has no separate role-list proof', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const { adapter, request } = transport()
    await expect(adapter.execute(orderRequest))
      .rejects.toMatchObject({ category: 'authorization_denied' })
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks well-formed foreign WorkOrder when current role has only the local WorkOrder', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const { adapter, request } = transport({
      listed: id => id === 'another-listed-wo',
      identity: () => 'session:user:role:v1',
    })
    await expect(adapter.execute(orderRequest))
      .rejects.toMatchObject({ category: 'authorization_denied' })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    ['missing identity', (): string | null => null],
    ['blank identity', (): string | null => ''],
    ['uncanonical identity', (): string | null => ' session:user:role:v1 '],
    ['throwing identity source', (): string | null => { throw Error('synthetic-context-error') }],
  ] as const)('fails closed on %s even when WorkOrder membership returns true', async (_case, identity) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const { adapter, request } = transport({ listed: () => true, identity })
    await expect(adapter.execute(orderRequest))
      .rejects.toMatchObject({ category: 'authorization_denied' })
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts a bounded current-role Order query; does not expose any broader queryById', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const { adapter, request } = transport({
      listed: id => id === workOrderId,
      identity: () => 'session:user:role:v1',
    })
    await expect(adapter.execute(orderRequest))
      .resolves.toEqual({ data: [{ ownerPhone: 'PRIVATE-SYNTHETIC-VALUE' }] })
    expect(request).toHaveBeenCalledTimes(1)
    const sent = request.mock.calls[0]?.[0]
    const params = new URLSearchParams(String(sent?.data))
    expect(params.get('_all')).toBeNull()
    expect(params.get('rows')).toBe('3')
    expect(params.get('is:serviceAppointmentId|string#and')).toBe(workOrderId)
    await expect(adapter.execute({
      method: 'POST', path: 'basic/order/queryById', body: { id: 'another-order' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('rejects role revocation while a dispatched Order read is in flight and never returns its body', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let resolve!: (result: unknown) => void
    let listed = true
    const { adapter, request } = transport({
      listed: () => listed,
      identity: () => 'session:user:role:v1',
      request: wire => {
        resolve = (body) => wire.success?.({ statusCode: 200, data: body } as never)
      },
    })
    const pending = adapter.execute(orderRequest)
    for (let i = 0; i < 30 && !resolve; i += 1) await Promise.resolve()
    expect(resolve).toBeTypeOf('function')
    listed = false
    resolve({ data: [{ ownerPhone: 'PRIVATE-SYNTHETIC-VALUE' }] })
    await expect(pending).rejects.toMatchObject({ category: 'authorization_denied' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['role version', { identity: 'session:user:role:v2', session: 'synthetic-session' }],
    ['session', { identity: 'session:user:role:v1', session: 'rotated-session' }],
  ])('rejects a previously authorized read when %s changes mid-flight', async (_case, next) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let identity = 'session:user:role:v1'
    let session = 'synthetic-session'
    let resolve!: (body: unknown) => void
    const { adapter } = transport({
      listed: () => true,
      identity: () => identity,
      session: () => session,
      request: wire => {
        resolve = body => wire.success?.({ statusCode: 200, data: body } as never)
      },
    })
    const pending = adapter.execute(orderRequest)
    for (let i = 0; i < 30 && !resolve; i += 1) await Promise.resolve()
    expect(resolve).toBeTypeOf('function')
    identity = next.identity
    session = next.session
    resolve({ data: [{ ownerPhone: 'PRIVATE-SYNTHETIC-VALUE' }] })
    await expect(pending).rejects.toMatchObject({ category: 'authorization_denied' })
  })

  it('does not grant caller permission from a valid body when membership guard throws', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const { adapter, request } = transport({
      listed: () => { throw Error('no-scope-context') },
      identity: () => 'session:user:role:v1',
    })
    await expect(adapter.execute(orderRequest))
      .rejects.toMatchObject({ category: 'authorization_denied' })
    expect(request).not.toHaveBeenCalled()
  })
})
