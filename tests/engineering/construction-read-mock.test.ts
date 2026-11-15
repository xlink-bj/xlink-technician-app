import { it, expect, vi } from 'vitest'
import { constructionReadRequest } from '../../src/shared/construction-read-contract'
const gate = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../src/adapters/api/mock/journey', () => ({ isDevMockJourneyEnabled: () => gate.enabled }))
import { queryConstructionMock, constructionMockEnabled, constructionMockWorkOrderId } from '../../src/adapters/api/mock/construction-read'
it('only reads the existing fixed synthetic WorkOrder', async () => {
  expect(constructionMockEnabled('real-work-order')).toBe(false)
  await expect(queryConstructionMock(constructionReadRequest('other'))).rejects.toThrow()
  const result: any = await queryConstructionMock(constructionReadRequest(constructionMockWorkOrderId))
  expect(result.data).toHaveLength(2)
  expect(result.data.every((r: any) => r.serviceAppointmentId === constructionMockWorkOrderId)).toBe(true)
})
it('does not accept relaxed filters or write routes', async () => {
  const request = constructionReadRequest(constructionMockWorkOrderId)
  for (const invalid of [{ ...request, path: 'biz/extForm/upsert/9190357980804726357' }, { ...request, body: { ...request.body, sortOrder: 'desc' } }, { ...request, body: { ...request.body, notFilterBelongTo: 1 } }]) await expect(queryConstructionMock(invalid)).rejects.toThrow()
})
it('has no fallback when existing DEV Mock is off', async () => {
  gate.enabled = false
  try { expect(constructionMockEnabled(constructionMockWorkOrderId)).toBe(false); await expect(queryConstructionMock(constructionReadRequest(constructionMockWorkOrderId))).rejects.toThrow() } finally { gate.enabled = true }
})
