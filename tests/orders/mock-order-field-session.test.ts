import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoragePort } from '@shared/ports'
const mock = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@adapters/api/mock/router', () => ({ tryMockRead: mock.read }))
import { createMockOrderFieldSession } from '../../src/app/mock-order-field-session'
import wire from '../../contracts/production/technician-role-readonly-20261105/effective-order-wire.json'
import { evaluateOrderExtFields } from '../../src/features/work-orders/quotation/order-extfield-runtime'

function storage() {
  let value: unknown = null
  return { read: vi.fn(async () => ({ state: 'succeeded', data: value })), write: vi.fn(async (_key, next) => {
    value = next; return { state: 'succeeded' }
  }), remove: vi.fn(async () => ({ state: 'succeeded' })) } as unknown as StoragePort
}
function schema() {
  mock.read.mockResolvedValue({ total: 1, data: [{ _id: 'row', name: 'note', nameDisp: '说明', colName: 'order', state: 1,
    showList: [4], type: 'text', required: '0', frontEndConfig: { showType: 'placeOrder' } }] })
}
afterEach(() => vi.clearAllMocks())
describe('scoped Mock Order field draft session', () => {
  it.each(['unverified-area-provider', { unexpected: true }])('rejects unverified area provider metadata before another request: %j', async valueOption => {
    const field = wire.fieldResponse.data.find(row => row.name === 'projectArea')!
    mock.read.mockResolvedValue({ total: 1, data: [{ ...field, valueOption }] })
    const session = createMockOrderFieldSession(storage(), () => true, 'actor:unsupported-area')
    expect(await session.load(wire.context.serviceType, 'submitOrder')).toBeNull()
    expect(mock.read).toHaveBeenCalledTimes(1)
  })
  it('binds the pinned area dictionary to the captured submit-stage field without a Code request', async () => {
    const field = wire.fieldResponse.data.find(row => row.name === 'projectArea')!
    mock.read.mockResolvedValue({ total: 1, data: [field] })
    const session = createMockOrderFieldSession(storage(), () => true, 'actor:captured-area')
    const draft = await session.load(wire.context.serviceType, 'submitOrder')
    expect(draft).not.toBeNull()
    const path = ['440000', '440300', '440305']
    const input = { ...draft!.input, values: { projectArea: path } }
    expect(evaluateOrderExtFields(input, 'submit')).toMatchObject({ state: 'ready', exts: { projectArea: path } })
    expect(evaluateOrderExtFields({ ...input, values: { projectArea: ['440000', '440300', '110101'] } }, 'submit').state).toBe('blocked')
    expect(mock.read).toHaveBeenCalledTimes(1)
    expect(mock.read.mock.calls[0][0]).toBe('biz/extField/query')
    expect(await session.save({ projectArea: path }, 0)).toBe(1)
    expect(await session.verifyCurrent()).toBe(true)
  })
  it('restores the same schema/context and rejects stale cross-session updates', async () => {
    schema()
    const port = storage()
    const first = createMockOrderFieldSession(port, () => true, 'actor:work')
    expect((await first.load('service'))?.revision).toBe(0)
    expect(await first.save({ note: '现场记录' }, 0)).toBe(1)
    const second = createMockOrderFieldSession(port, () => true, 'actor:work')
    expect((await second.load('service'))?.input.values).toEqual({ note: '现场记录' })
    expect(await second.save({ note: '新记录' }, 1)).toBe(2)
    expect(await first.verifyCurrent()).toBe(false)
    expect(await second.verifyCurrent()).toBe(true)
    expect(await first.save({ note: '过时记录' }, 1)).toBeNull()
  })
  it('serializes truly concurrent sessions so only one revision can win', async () => {
    schema()
    const port = storage()
    const first = createMockOrderFieldSession(port, () => true, 'actor:work')
    const second = createMockOrderFieldSession(port, () => true, 'actor:work')
    await Promise.all([first.load('service'), second.load('service')])
    const results = await Promise.all([first.save({ note: 'one' }, 0), second.save({ note: 'two' }, 0)])
    expect(results.filter(value => value === 1)).toHaveLength(1)
    expect(results.filter(value => value === null)).toHaveLength(1)
  })
  it('restores configured existing Quote.exts when no local record exists', async () => {
    schema()
    const session = createMockOrderFieldSession(storage(), () => true, 'actor:work', async () => ({ note: '报价原值', foreign: 'excluded' }))
    expect((await session.load('service'))?.input.values).toEqual({ note: '报价原值' })
  })
  it('restores area aliases from the scoped local draft without importing foreign keys', async () => {
    mock.read.mockResolvedValue({ total: 1, data: [{ _id: 'area', name: 'site', nameDisp: '省市区', colName: 'order', state: 1,
      showList: [4], type: 'area', required: '0', frontEndConfig: { showType: 'placeOrder' } }] })
    const port = storage()
    const first = createMockOrderFieldSession(port, () => true, 'actor:area')
    await first.load('service')
    await first.save({ site: ['110000', '110100', '110101'], province: '110000', city: '110100', district: '110101', foreign: 'excluded' }, 0)
    const restored = await createMockOrderFieldSession(port, () => true, 'actor:area').load('service')
    expect(restored?.input.values).toEqual({ site: ['110000', '110100', '110101'], province: '110000', city: '110100', district: '110101' })
  })
  it('invalidates reads and saves when authorization changes', async () => {
    schema()
    let current = true
    const session = createMockOrderFieldSession(storage(), () => current, 'actor:work')
    await session.load('service')
    current = false
    expect(session.current()).toBeNull()
    expect(await session.save({ note: 'stale' }, 0)).toBeNull()
    expect(await session.load('service')).toBeNull()
  })
  it('keeps malformed stored records intact and blocks truncated schemas', async () => {
    schema()
    const port = storage()
    await port.write({ namespace: 'draft', key: 'ignored' }, { broken: true })
    const session = createMockOrderFieldSession(port, () => true, 'actor:work')
    expect(await session.load('service')).toBeNull()
    expect(port.write).toHaveBeenCalledTimes(1)
    mock.read.mockResolvedValue({ total: 2, data: [] })
    expect(await createMockOrderFieldSession(storage(), () => true, 'actor:work').load('service')).toBeNull()
  })
  it('does not report a failed storage write as saved', async () => {
    schema()
    const port = storage()
    const session = createMockOrderFieldSession(port, () => true, 'actor:work')
    await session.load('service')
    vi.mocked(port.write).mockResolvedValue({ state: 'failed_retryable' })
    expect(await session.save({ note: 'not persisted' }, 0)).toBeNull()
    expect(session.current()?.revision).toBe(0)
  })
})
