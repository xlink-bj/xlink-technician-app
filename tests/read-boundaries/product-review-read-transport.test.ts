import { describe, expect, it } from 'vitest'
import { productReviewReadAllowed, createProductMockReadTransport } from '../../tools/review/quotation-demo/product-read-transport'
import { mockCommandScenarioIds, mockQuotationCatalogServiceType } from '@adapters/api/mock'

const actor = { userId: 'synthetic-review-user', roleId: 'synthetic-role' }

describe('G4-F product review transport is fail-closed', () => {
  it('permits only scoped synthetic route shapes', () => {
    expect(productReviewReadAllowed({ method: 'POST', path: 'function/changeRole', body: { roleIds: actor.roleId } }, actor)).toBe(true)
    expect(productReviewReadAllowed({ method: 'POST', path: 'basic/serviceAppointment/querySAWorkflowNode', body: { page: 1, rows: 20 } }, actor)).toBe(true)
    expect(productReviewReadAllowed({ method: 'POST', path: `basic/serviceAppointment/queryById/${mockCommandScenarioIds.quotationFoundation}` }, actor)).toBe(true)
    expect(productReviewReadAllowed({ method: 'POST', path: 'biz/projPackage/queryWithRank', body: { 'in:serviceType|array#and': mockQuotationCatalogServiceType } }, actor)).toBe(true)
    expect(productReviewReadAllowed({ method: 'POST', path: 'biz/projPackage/findById/mock-catalog-package-basic' }, actor)).toBe(true)
  })
  it('denies foreign IDs, query overflow, role changes, arbitrary providers, all writes', () => {
    const requests = [
      { method: 'POST', path: 'function/changeRole', body: { roleIds: 'real-role' } },
      { method: 'GET', path: 'basic/serviceAppointment/query' },
      { method: 'POST', path: 'basic/serviceAppointment/query', body: { page: 1, rows: 51 } },
      { method: 'POST', path: 'basic/serviceAppointment/queryById/real-customer-id' },
      { method: 'POST', path: 'biz/projPackage/queryWithRank', body: { 'in:serviceType|array#and': 'real-service-type' } },
      { method: 'POST', path: 'biz/projPackage/findById/real-id' },
      { method: 'POST', path: 'biz/extField/query' },
      { method: 'POST', path: 'basic/order/upsert' },
      { method: 'POST', path: 'workflow/process' },
      { method: 'POST', path: 'i/code/selectCode.do' },
      { method: 'POST', path: 'https://example.com' },
    ] as const
    for (const request of requests) expect(productReviewReadAllowed(request, actor)).toBe(false)
  })
  it('rejects disallowed routes at transport level without attempting HTTP', async () => {
    const adapter = createProductMockReadTransport(actor)
    await expect(adapter.execute({ method: 'POST', path: 'https://example.com/private' }))
      .rejects.toMatchObject({ category: 'authorization_denied' })
  })
})
