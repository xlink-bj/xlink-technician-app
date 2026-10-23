import { describe, expect, it, vi } from 'vitest'
import {
  createUniApiCommandTransport,
  isUnapprovedR1QuotationStageMutationPath,
} from '@adapters/api/uni-api-command-transport'
import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'

const mutationPaths = [
  'basic/order/creatQuotation',
  'basic/order/creatQuotation.do',
  '/basic/order/creatQuotation?origin=legacy',
  'basic%2Forder%2FcreatQuotation',
  'basic/order/quotation',
  'basic/order/orderConfirm',
  'basic/order/sendMessage',
  'basic/couponPrinting/useCoupon/synthetic-coupon',
]
const readAndIndependentlyGatedPaths = [
  'basic/order/query',
  'basic/order/queryById',
  'basic/order/upsert', // Gated by separate type=1/real-write constraints
  'workflow/startWorkflow/order/null/synthetic-definition',
]

describe('M1 I3 R1 quotation type=0 and official type=1 side-effect fences', () => {
  it.each(mutationPaths)('classifies %s as a separately unapproved R1 mutation', path => {
    expect(isUnapprovedR1QuotationStageMutationPath(path)).toBe(true)
  })

  it.each(readAndIndependentlyGatedPaths)('does not redefine existing read/official Order gates for %s', path => {
    expect(isUnapprovedR1QuotationStageMutationPath(path)).toBe(false)
  })

  it.each(mutationPaths)('never invokes network or DEV Mock dispatch for %s', async path => {
    const request = vi.fn()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://test.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      request,
      blockRealRequests: false,
    })
    await expect(transport.execute({ method: 'POST', path, body: { data: '{}' } }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects malformed encoded mutation route without dispatch', async () => {
    const request = vi.fn()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://test.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      request,
    })
    await expect(transport.execute({
      method: 'POST', path: 'basic/order/creatQuotation%XX', body: { data: '{}' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('preserves the independent official type=1 command adapter validation', async () => {
    const execute = vi.fn()
    const adapter = createQuotationOrderCommandAdapter({ execute } as never)
    const wronglyStaged = await adapter.upsertOfficialOrder({
      order: { type: 0, serviceAppointmentId: 'synthetic-appointment' },
    })
    expect(wronglyStaged.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })
})
