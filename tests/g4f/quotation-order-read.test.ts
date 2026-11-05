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
        // DB-bounded first page: no _all, which overrides rows in the existing backend.
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

  it('keeps captured Order unit price and line total distinct from the current catalog price', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [{
        _id: 'official-order-price-read',
        type: 1,
        serviceAppointmentId: 'work-order-price-read',
        originPrice: 51.5,
        totalPrice: 42.25,
        discount: 0.9,
        bjProducts: { orderList: [{
          repairParts: ['roof'], partDescription: '屋面', totalAmount: 51.5,
          projPackages: { data: [] }, procedures: { data: [] }, measures: { data: [] },
          materials: { data: [{
            _id: 'sku-read-1', spuid: 'spu-read-1', name: '防水材料',
            number: 2, unit: '桶', price: 99, amount: 10.25, totalAmount: 20.5,
          }] },
        }] },
      }] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-price-read')

    expect(result).toMatchObject({ state: 'succeeded', data: { items: [{
      originPrice: 51.5,
      totalPrice: 42.25,
      groups: [{ contentSupported: true, lines: [{
        kind: 'material', quantity: 2, unit: '桶', unitPrice: 10.25, lineTotal: 20.5,
        identity: { spuId: 'spu-read-1', skuId: 'sku-read-1' },
      }] }],
    }] } })
    expect(JSON.stringify(result)).not.toContain('99')
    expect(JSON.stringify(result)).not.toContain('discount')
  })

  it('does not display a catalog `price` as an Order price when captured `amount` fields are absent', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [{
        _id: 'official-order-incomplete-price', type: 1,
        serviceAppointmentId: 'work-order-price-read',
        bjProducts: { orderList: [{
          repairParts: ['roof'], partDescription: '屋面',
          projPackages: { data: [] }, procedures: { data: [] }, measures: { data: [] },
          materials: { data: [{ _id: 'spu-current-catalog', name: '材料', number: 2, price: 199 }] },
        }] },
      }] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-price-read')
    expect(result).toMatchObject({ state: 'succeeded', data: { items: [{ groups: [{
      contentSupported: false,
      lines: [{ identity: { spuId: 'spu-current-catalog' }, contentSupported: false }],
    }] }] } })
    const line = result.state === 'succeeded' ? result.data?.items[0]?.groups[0]?.lines[0] : undefined
    expect(line).not.toHaveProperty('unitPrice')
    expect(line).not.toHaveProperty('lineTotal')
    expect(JSON.stringify(result)).not.toContain('199')
  })

  it('keeps an incomplete or inconsistent persisted amount relationship unverified', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [{
        _id: 'official-order-inconsistent-price', type: 1,
        serviceAppointmentId: 'work-order-price-read',
        bjProducts: { orderList: [{
          repairParts: ['roof'], partDescription: '屋面',
          projPackages: { data: [] }, procedures: { data: [] }, measures: { data: [] },
          materials: { data: [
            { _id: 'sku-missing-total', spuid: 'spu-price-read', name: '材料 A', number: 2, amount: 10 },
            { _id: 'sku-inconsistent-total', spuid: 'spu-price-read', name: '材料 B', number: 2, amount: 10, totalAmount: 19.99 },
          ] },
        }] },
      }] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-price-read')

    expect(result).toMatchObject({ state: 'succeeded', data: { items: [{ groups: [{
      contentSupported: false,
      lines: [
        { contentSupported: false },
        { contentSupported: false },
      ],
    }] }] } })
    const lines = result.state === 'succeeded' ? result.data?.items[0]?.groups[0]?.lines : undefined
    expect(lines?.[0]).not.toHaveProperty('unitPrice')
    expect(lines?.[0]).not.toHaveProperty('lineTotal')
    expect(lines?.[1]).not.toHaveProperty('unitPrice')
    expect(lines?.[1]).not.toHaveProperty('lineTotal')
  })

  it('does not surface a captured SKU price when its parent SPU identity is missing', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [{
        _id: 'official-order-sku-parent-missing', type: 1,
        serviceAppointmentId: 'work-order-price-read',
        bjProducts: { orderList: [{
          repairParts: ['roof'], projPackages: { data: [] }, procedures: { data: [] },
          materials: { data: [{
            _id: 'sku-without-parent', skuId: 'sku-without-parent',
            name: '材料变体', number: 2, amount: 10, totalAmount: 20,
          }, {
            _id: 'sku-code-without-parent', skuCode: 'SKU-ONLY-CODE',
            name: '仅有 SKU 编码的材料', number: 1, amount: 12, totalAmount: 12,
          }] }, measures: { data: [] },
        }] },
      }] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-price-read')

    const lines = result.state === 'succeeded' ? result.data?.items[0]?.groups[0]?.lines : undefined
    expect(lines?.[0]).toMatchObject({ contentSupported: false, identity: { skuId: 'sku-without-parent' } })
    expect(lines?.[1]).toMatchObject({ contentSupported: false, identity: { skuCode: 'SKU-ONLY-CODE' } })
    for (const line of lines ?? []) {
      expect(line).not.toHaveProperty('unitPrice')
      expect(line).not.toHaveProperty('lineTotal')
    }
  })

  it('rejects a material row when nested and Order-line SKU codes disagree', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [{
        _id: 'official-order-conflicting-sku-code', type: 1,
        serviceAppointmentId: 'work-order-price-read',
        bjProducts: { orderList: [{
          repairParts: ['roof'], projPackages: { data: [] }, procedures: { data: [] },
          materials: { data: [{
            _id: 'sku-code-match', spuid: 'spu-code-match', skuId: 'sku-code-match',
            skuCode: 'SKU-A', name: '材料', number: 1, amount: 10, totalAmount: 10,
            material: { _id: 'spu-code-match', skuId: 'sku-code-match', skuCode: 'SKU-B', name: '材料' },
          }] }, measures: { data: [] },
        }] },
      }] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-price-read')
    expect(result.state).toBe('failed_terminal')
  })

  it('recognizes only R1 package and procedure minimum-price floors', async () => {
    const result = await createQuotationOrderReadAdapter({
      execute: async () => ({ data: [
        {
          _id: 'official-order-minimum-valid', type: 1, serviceAppointmentId: 'work-order-price-read',
          bjProducts: { orderList: [{
            repairParts: ['roof'],
            projPackages: { data: [{
              _id: 'package-valid', name: '套餐', number: 1, amount: 12,
              minimumPrice: 20, totalAmount: 20,
              procedureList: [], materialList: [], measureList: [],
            }] },
            procedures: { data: [{
              _id: 'procedure-valid', procedure: { _id: 'procedure-ref', name: '工序' },
              number: 1, amount: 12, minimumGuideTotalPrice: 20, totalAmount: 20,
            }] },
            materials: { data: [] }, measures: { data: [] },
          }] },
        },
        {
          _id: 'official-order-minimum-invalid', type: 1, serviceAppointmentId: 'work-order-price-read',
          bjProducts: { orderList: [{
            repairParts: ['roof'],
            projPackages: { data: [{
              _id: 'package-invalid', name: '套餐', number: 1, amount: 12,
              minimumPrice: 20, totalAmount: 19.99,
              procedureList: [], materialList: [], measureList: [],
            }] },
            procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
          }] },
        },
        {
          _id: 'official-order-minimum-bypassed', type: 1, serviceAppointmentId: 'work-order-price-read',
          bjProducts: { orderList: [{
            repairParts: ['roof'],
            projPackages: { data: [{
              _id: 'package-below-floor', name: '套餐', number: 1, amount: 12,
              minimumPrice: 20, totalAmount: 12,
              procedureList: [], materialList: [], measureList: [],
            }] },
            procedures: { data: [{
              _id: 'procedure-below-floor', procedure: { _id: 'procedure-ref', name: '工序' },
              number: 1, amount: 12, minimumGuideTotalPrice: 20, totalAmount: 12,
            }] },
            materials: { data: [] }, measures: { data: [] },
          }] },
        },
      ] }),
    }, () => true).listTypeOneOrdersForWorkOrder('work-order-price-read')

    expect(result).toMatchObject({ state: 'succeeded', data: { items: [
      { groups: [{ contentSupported: true, lines: [
        { kind: 'package', lineTotal: 20, contentSupported: true },
        { kind: 'procedure', lineTotal: 20, contentSupported: true },
      ] }] },
      { groups: [{ contentSupported: false, lines: [
        { kind: 'package', contentSupported: false },
      ] }] },
      { groups: [{ contentSupported: false, lines: [
        { kind: 'package', contentSupported: false },
        { kind: 'procedure', contentSupported: false },
      ] }] },
    ] } })
    if (result.state === 'succeeded' && result.data) {
      for (const line of result.data.items[2]?.groups[0]?.lines ?? []) {
        expect(line).not.toHaveProperty('unitPrice')
        expect(line).not.toHaveProperty('lineTotal')
      }
    }
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

  it.each([
    { _id: 'unrelated-order' },
    { _id: 'order-synthetic', id: 'unrelated-order' },
  ])('rejects a queryById payload with contradictory official Order identity: %j', async (wireIds) => {
    const execute = vi.fn(async () => ({ data: {
      ...wireIds,
      type: 1,
      serviceAppointmentId: 'work-order-synthetic',
      bjProducts: { orderList: [] },
    } }))
    const result = await createQuotationOrderReadAdapter({ execute }).getQuotationOrderById('order-synthetic')

    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
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
