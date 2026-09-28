import { describe, expect, it } from 'vitest'

import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'

describe('G4-F Phase 1I authoritative Order read adapter', () => {
  it('uses the verified queryById request and returns a sanitized replace snapshot', async () => {
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: async (request) => {
        requests.push(request)
        return {
          data: {
            _id: 'order-synthetic',
            type: 1,
            serviceAppointmentId: 'work-order-synthetic',
            state: 1,
            processState: 0,
            originPrice: '12.50',
            totalPrice: 12.5,
            bjProducts: JSON.stringify({ orderList: [] }),
            exts: { coupons: '', sourceType: 'synthetic-source' },
            unlockPayState: [],
            settlePayState: [],
            qiniuList: ['https://synthetic.invalid/quote.pdf'],
            customerSecret: 'must-not-leak',
          },
        }
      },
    }
    const result = await createQuotationOrderReadAdapter(transport).getQuotationOrderById('order-synthetic')
    expect(requests).toEqual([{ method: 'POST', path: 'basic/order/queryById', body: { id: 'order-synthetic' } }])
    expect(result).toMatchObject({
      state: 'succeeded',
      data: {
        id: 'order-synthetic',
        type: 1,
        serviceAppointmentId: 'work-order-synthetic',
        originPrice: 12.5,
        totalPrice: 12.5,
        bjProducts: { orderList: [] },
        qiniuList: ['https://synthetic.invalid/quote.pdf'],
        replaceSnapshot: {
          _id: 'order-synthetic',
          unlockPayState: [],
          settlePayState: [],
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('customerSecret')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
  })

  it('fails closed if the authoritative order has no recognizable grouped read structure', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ _id: 'order-synthetic', type: 1, serviceAppointmentId: 'work-order-synthetic', bjProducts: '{}' }),
    }).getQuotationOrderById('order-synthetic')
    expect(result.state).toBe('failed_terminal')
  })

  it('keeps quotation Order read mapping out of the technician/work-order adapter', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('../../src/adapters/api/technician-api.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('QuotationOrderRead')
    expect(source).not.toContain('getQuotationOrderById')
    expect(source).not.toContain('basic/order/queryById')
  })
})
