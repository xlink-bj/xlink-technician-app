import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMockOwnedRead, resetBusinessMockCache, setBusinessMockMode, tryMockRead } from '@adapters/api/mock'
import { isDevSyntheticContractReadPreviewEnabled } from '@app/business-mock'

const workOrderId = 'mock-work-order-002'
const orderId = 'mock-official-order-001'
const orderBody = {
  _all: '1', page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
  'is:serviceAppointmentId|string#and': workOrderId, 'is:type|integer#and': 1,
}
const contractBody = {
  _all: '1', page: 1, rows: 3,
  'is:workOrderId|string#and': workOrderId, 'in:state|array-integer#and': '1',
  sortField: 'updateTime', sortOrder: 'asc',
}

describe('I6 isolated DEV signing read fixture, never a submitted legal Contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
  })

  it('serves an explicit synthetic Order and Contract pair locally only in DEV H5 Mock data', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    setBusinessMockMode('data')
    expect(isDevSyntheticContractReadPreviewEnabled(workOrderId)).toBe(true)
    const order = await tryMockRead('basic/order/query', orderBody, { latencyMs: 0 })
    const contract = await tryMockRead('basic/contract/query.do', contractBody, { latencyMs: 0 })
    expect(order).toMatchObject({ data: [{ _id: orderId, type: 1, serviceAppointmentId: workOrderId }] })
    expect(contract).toMatchObject({ data: [{
      _id: 'mock-contract-001', serviceAppointmentId: workOrderId, orderId, exts: { contractStatus: '2' },
    }] })
    expect(JSON.stringify(contract)).not.toMatch(/contactPhone|signedUrl|qiniuUrl/)
  })

  it('rejects other WorkOrders and DEV mock off even if the previous synthetic URL remains', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    setBusinessMockMode('off')
    expect(isDevSyntheticContractReadPreviewEnabled(workOrderId)).toBe(false)
    expect(await tryMockRead('basic/contract/query.do', contractBody, { latencyMs: 0 })).toBeNull()
    expect(isMockOwnedRead('basic/contract/query.do', contractBody)).toBe(true)
    setBusinessMockMode('data')
    expect(isDevSyntheticContractReadPreviewEnabled('other-workorder')).toBe(false)
    expect(await tryMockRead('basic/contract/query.do', {
      ...contractBody, 'is:workOrderId|string#and': 'other-workorder',
    }, { latencyMs: 0 })).toBeNull()
  })

  it('does not enable any real-world Contract read from staging/Beta, H5 disabled, or Production', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    setBusinessMockMode('data')
    expect(isDevSyntheticContractReadPreviewEnabled(workOrderId)).toBe(false)
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    vi.stubEnv('DEV', false)
    expect(isDevSyntheticContractReadPreviewEnabled(workOrderId)).toBe(false)
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    resetBusinessMockCache()
    expect(isDevSyntheticContractReadPreviewEnabled(workOrderId)).toBe(false)
  })
})
