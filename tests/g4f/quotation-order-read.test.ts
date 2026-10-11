import { describe, expect, it, vi } from 'vitest'

import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'

describe('G4-F Production quotation Order read adapter', () => {
  it('does not issue an Order query without a valid role-listed Work Order identity', async () => {
    const execute = vi.fn(async () => ({ data: [] }))
    const result = await createQuotationOrderReadAdapter({ execute }, () => true).listTypeOneOrdersForWorkOrder('../unscoped')
    expect(result.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a syntactically valid Work Order ID absent from the current session list before transport', async () => {
    const execute = vi.fn(async () => ({ data: [] }))
    const result = await createQuotationOrderReadAdapter({ execute }, () => false)
      .listTypeOneOrdersForWorkOrder('work-order-synthetic')

    expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'authorization_denied' } })
    expect(execute).not.toHaveBeenCalled()
  })

  it('fails closed if the authenticated list scope changes while the quote request is in flight', async () => {
    const isAuthorized = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    const execute = vi.fn(async () => ({
      data: [{
        _id: 'order-synthetic',
        type: 1,
        serviceAppointmentId: 'work-order-synthetic',
        bjProducts: { orderList: [] },
      }],
    }))

    const result = await createQuotationOrderReadAdapter({ execute }, isAuthorized)
      .listTypeOneOrdersForWorkOrder('work-order-synthetic')

    expect(execute).toHaveBeenCalledOnce()
    expect(isAuthorized).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'authorization_denied' } })
    expect(JSON.stringify(result)).not.toContain('order-synthetic')
  })

  it('reads a bounded Work Order-scoped type=1 page and projects grouped SKU/SPU evidence without leaking the raw payload', async () => {
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: async (request) => {
        requests.push(request)
        return {
          data: [{
            _id: 'order-synthetic-list',
            type: 1,
            serviceAppointmentId: 'work-order-synthetic',
            orderNumber: 'Q-SYNTHETIC',
            totalPrice: 125.5,
            customerPhone: 'must-not-leak',
            exts: { bjdPDFurl: 'https://synthetic.invalid/private.pdf' },
            bjProducts: JSON.stringify({ orderList: [{
              repairParts: ['roof-code-synthetic'],
              partDescription: '合成屋面区域',
              maintainAreaNum: '10',
              projPackages: { data: [] },
              procedures: { data: [] },
              materials: { data: [{
                materialId: 'material-reference-synthetic',
                number: 2,
                material: { name: '合成材料', skuId: 'sku-synthetic', spuid: 'spu-synthetic', skuCode: 'SKU-SYN', unit: '支' },
              }] },
              measures: { data: [] },
            }] }),
          }],
        }
      },
    }

    const result = await createQuotationOrderReadAdapter(transport, (id) => id === 'work-order-synthetic')
      .listTypeOneOrdersForWorkOrder('work-order-synthetic')
    expect(requests).toEqual([{
      method: 'POST',
      path: 'basic/order/query',
      body: {
        _all: '1',
        page: 1,
        rows: 3,
        sortField: 'createTime',
        sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': 'work-order-synthetic',
        'is:type|integer#and': 1,
      },
    }])
    expect(result).toMatchObject({
      state: 'succeeded',
      data: {
        items: [{
          type: 1,
          serviceAppointmentId: 'work-order-synthetic',
          displayNumber: 'Q-SYNTHETIC',
          totalPrice: 125.5,
          pdfState: 'present_no_access',
          groups: [{
            partDescription: '合成屋面区域',
            maintainAreaNum: '10',
            lines: [{
              kind: 'material',
              label: '合成材料',
              quantity: 2,
              unit: '支',
              identity: {
                providerReferenceId: 'material-reference-synthetic',
                skuId: 'sku-synthetic',
                spuId: 'spu-synthetic',
                skuCode: 'SKU-SYN',
              },
            }],
          }],
        }],
      },
    })
    expect(JSON.stringify(result)).not.toContain('customerPhone')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(JSON.stringify(result)).not.toContain('private.pdf')
  })

  it('rejects a Work-Order-scoped quote response that exceeds the three-row bounded page', async () => {
    const row = {
      _id: 'order-synthetic', type: 1, serviceAppointmentId: 'work-order-synthetic',
      bjProducts: { orderList: [] },
    }
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [row, row, row, row] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-synthetic')
    expect(result.state).toBe('failed_terminal')
  })

  it('rejects two returned records when caller requested a single-row Order page', async () => {
    const row = (id: string) => ({
      _id: id, type: 1, serviceAppointmentId: 'work-order-synthetic',
      bjProducts: { orderList: [] },
    })
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [row('a'), row('b')] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-synthetic', 1)
    expect(result.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toContain('"a"')
    expect(JSON.stringify(result)).not.toContain('"b"')
  })

  it('rejects duplicate official Order IDs rather than offering repeated signing choices', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({
        data: [
          { _id: 'official-duplicate', type: 1, serviceAppointmentId: 'work-order-synthetic', bjProducts: { orderList: [] } },
          { _id: 'official-duplicate', type: 1, serviceAppointmentId: 'work-order-synthetic', bjProducts: { orderList: [] } },
        ],
      }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-synthetic', 3)
    expect(result.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toContain('official-duplicate')
  })

  it('rejects invalid page size without issuing any authenticated Order request', async () => {
    const execute = vi.fn(async () => ({ data: [] }))
    const result = await createQuotationOrderReadAdapter({ execute }, () => true)
      .listTypeOneOrdersForWorkOrder('work-order-synthetic', 2 as 1)
    expect(result.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects the entire quote page when any returned record belongs to another Work Order', async () => {
    const execute = vi.fn(async () => ({
      data: [
        {
          _id: 'order-synthetic-matching',
          type: 1,
          serviceAppointmentId: 'work-order-synthetic',
          bjProducts: { orderList: [] },
        },
        {
          _id: 'order-synthetic-mismatch',
          type: 1,
          serviceAppointmentId: 'different-work-order-synthetic',
          bjProducts: { orderList: [] },
        },
      ],
    }))
    const result = await createQuotationOrderReadAdapter({ execute }, () => true)
      .listTypeOneOrdersForWorkOrder('work-order-synthetic')

    expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'server_terminal' } })
    expect(JSON.stringify(result)).not.toContain('different-work-order-synthetic')
    expect(JSON.stringify(result)).not.toContain('order-synthetic-matching')
    expect(JSON.stringify(result)).not.toContain('order-synthetic-mismatch')
  })

  it('keeps incomplete grouped server Orders explicitly unsupported and never exposes PDF URLs or unrelated fields', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({
        data: [{
          _id: 'order-synthetic',
          type: 1,
          serviceAppointmentId: 'work-order-synthetic',
          ownerPhone: 'must-not-leak',
          exts: { bjdPDFurl: 'https://synthetic.invalid/private.pdf' },
          bjProducts: { orderList: [{
            repairParts: ['roof-path-synthetic'],
            partDescription: '合成维修部位',
            projPackages: { data: [{ name: '合成但结构不完整的套餐' }] },
          }] },
        }],
      }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-synthetic')

    expect(result).toMatchObject({
      state: 'succeeded',
      data: {
        items: [{
          contentSupported: false,
          pdfState: 'present_no_access',
          groups: [{
            contentSupported: false,
            lines: [{ kind: 'package', contentSupported: false, children: [] }],
          }],
        }],
      },
    })
    expect(JSON.stringify(result)).not.toContain('ownerPhone')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(JSON.stringify(result)).not.toContain('private.pdf')
  })

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
