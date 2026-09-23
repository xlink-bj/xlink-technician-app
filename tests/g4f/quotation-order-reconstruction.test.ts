import { describe, expect, it } from 'vitest'

import type { QuotationOrderRead } from '@shared/ports'
import { quotationOrderEditBlockers, reconstructQuotationOrder } from '@features/work-orders/quotation/order-reconstruction'

function order(overrides: Partial<QuotationOrderRead> = {}): QuotationOrderRead {
  return {
    id: 'order-synthetic',
    type: 1,
    serviceAppointmentId: 'work-order-synthetic',
    state: 1,
    processState: 0,
    discount: 1,
    preferentialAmount: 0,
    coupons: '',
    bjProducts: {
      orderList: [{
        repairParts: ['roof', 'flat-roof'],
        partDescription: 'synthetic area',
        maintainAreaNum: '12',
        projPackages: { data: [], totalAmount: 0 },
        procedures: { data: [{ _id: 'procedure-a', name: 'synthetic procedure', number: 1 }] },
        materials: { data: [{ _id: 'material-a', name: 'synthetic material', number: 2 }] },
        measures: { data: [] },
      }],
      addItems: { data: [] },
      deleteItems: { data: [] },
    },
    replaceSnapshot: {
      _id: 'order-synthetic',
      type: 1,
      serviceAppointmentId: 'work-order-synthetic',
      productIds: '[]',
      exts: {},
    },
    ...overrides,
  }
}

describe('G4-F Phase 1I Order reconstruction/edit safety', () => {
  it('reconstructs supported grouped procedure/material rows without inferring identities from labels', () => {
    const result = reconstructQuotationOrder(order(), 'workflow-node-synthetic')
    expect(result.state).toBe('ready')
    if (result.state !== 'ready') return
    expect(result.draft.groups[0]).toMatchObject({
      repairParts: ['roof', 'flat-roof'],
      partDescription: 'synthetic area',
      maintainAreaNum: '12',
      procedures: [{ catalogId: 'procedure-a', quantity: 1 }],
      materials: [{ catalogId: 'material-a', quantity: 2 }],
    })
  })

  it('blocks destructive edit when commercial or payment state is unsupported or unknown', () => {
    expect(quotationOrderEditBlockers(order({ discount: undefined }))).toContain('折扣信息缺失或包含非中性折扣。')
    expect(quotationOrderEditBlockers(order({ replaceSnapshot: {
      _id: 'order-synthetic', type: 1, serviceAppointmentId: 'work-order-synthetic', productIds: '[]',
      exts: { coupons: 'coupon-synthetic', couponsVal: 10 },
    } }))).toContain('订单包含优惠券或优惠券金额。')
    expect(quotationOrderEditBlockers(order({ replaceSnapshot: {
      _id: 'order-synthetic', type: 1, serviceAppointmentId: 'work-order-synthetic', productIds: '[]',
      exts: {}, payState: 1,
    } }))).toContain('订单已有支付或结算记录，不支持报价替换编辑。')
  })

  it('blocks existing direct SPU/SKU rows and ambiguous required repair paths', () => {
    const skuOrder = order({ bjProducts: {
      orderList: [{
        repairParts: ['roof'], partDescription: 'x', maintainAreaNum: '1',
        projPackages: { data: [] }, procedures: { data: [] },
        materials: { data: [{ _id: 'material-a', spuid: 'spu-synthetic', number: 1 }] },
        measures: { data: [] },
      }], addItems: { data: [] }, deleteItems: { data: [] },
    } })
    expect(quotationOrderEditBlockers(skuOrder)).toContain('订单包含未支持的 SPU/SKU 材料。')
    const missingParts = order({ bjProducts: {
      orderList: [{ repairParts: [], projPackages: { data: [] }, procedures: { data: [] }, materials: { data: [] }, measures: { data: [] } }],
      addItems: { data: [] }, deleteItems: { data: [] },
    } })
    expect(reconstructQuotationOrder(missingParts, 'node').state).toBe('blocked')
  })

  it('blocks additions and deletions rather than dropping them during replace-snapshot edit', () => {
    for (const field of ['addItems', 'deleteItems'] as const) {
      const result = quotationOrderEditBlockers(order({
        bjProducts: {
          orderList: [],
          addItems: { data: field === 'addItems' ? [{ name: 'synthetic extra' }] : [] },
          deleteItems: { data: field === 'deleteItems' ? [{ name: 'synthetic removal' }] : [] },
        },
      }))
      expect(result).toContain('订单包含当前编辑器不能无损保留的增减项。')
    }
  })

  it('blocks an Order that has entered execution or has payment state', () => {
    expect(quotationOrderEditBlockers(order({ processState: 2 }))).toContain('订单进展状态缺失或已进入施工，不能安全执行替换编辑。')
    expect(quotationOrderEditBlockers(order({ replaceSnapshot: {
      _id: 'order-synthetic', type: 1, serviceAppointmentId: 'work-order-synthetic', productIds: '[]', exts: {}, payIds: ['payment-synthetic'],
    } }))).toContain('订单已有支付或结算记录，不支持报价替换编辑。')
  })

  it('blocks an existing SKU Package and malformed package group instead of guessing', () => {
    const packageSku = order({ bjProducts: {
      orderList: [{
        repairParts: ['roof'], partDescription: 'synthetic', maintainAreaNum: '1',
        projPackages: { data: [{ _id: 'package-a', name: 'synthetic package', number: 1, exts: { pricingMethod: '1' } }] },
        procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
      }], addItems: { data: [] }, deleteItems: { data: [] },
    } })
    expect(quotationOrderEditBlockers(packageSku)).toContain('订单包含未支持的 SKU 套餐。')
    expect(reconstructQuotationOrder(packageSku, 'node')).toMatchObject({ state: 'blocked' })
  })

  it('requires exact provider row identity and unambiguous selected package material layers', () => {
    const missingIdentity = order({ bjProducts: {
      orderList: [{
        repairParts: ['roof'], partDescription: 'synthetic', maintainAreaNum: '1',
        projPackages: { data: [] }, procedures: { data: [{ name: 'label only', number: 1 }] },
        materials: { data: [] }, measures: { data: [] },
      }], addItems: { data: [] }, deleteItems: { data: [] },
    } })
    expect(reconstructQuotationOrder(missingIdentity, 'node').state).toBe('blocked')
    const ambiguousLayer = order({ bjProducts: {
      orderList: [{
        repairParts: ['roof'], partDescription: 'synthetic', maintainAreaNum: '1',
        projPackages: { data: [{
          _id: 'package-a', name: 'synthetic package', number: 1,
          procedureList: [], measureList: [],
          materialList: [
            { _id: 'component-a', materialId: 'material-a', checked: true, exts: { layer: '1' }, material: { _id: 'material-a', name: 'synthetic material' } },
            { _id: 'component-b', materialId: 'material-b', checked: true, exts: { layer: '1' }, material: { _id: 'material-b', name: 'synthetic material 2' } },
          ],
        }] }, procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
      }], addItems: { data: [] }, deleteItems: { data: [] },
    } })
    expect(reconstructQuotationOrder(ambiguousLayer, 'node').state).toBe('blocked')
  })
})
