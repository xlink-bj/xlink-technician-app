import { describe, expect, it } from 'vitest'

import type { QuotationCatalogReadPort, QuotationOrderRead } from '@shared/ports'
import { quotationOrderEditBlockers, reconstructQuotationOrder } from '@features/work-orders/quotation/order-reconstruction'
import { hydrateQuotationDraft } from '@features/work-orders/quotation/hydration'

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

  it('rehydrates an R1 Package snapshot with component row IDs and embedded catalog IDs but no explicit references', async () => {
    const r1Order = order({ bjProducts: {
      orderList: [{
        repairParts: ['roof'], partDescription: 'synthetic', maintainAreaNum: '1',
        projPackages: { data: [{
          _id: 'package-a', name: 'synthetic package', number: 1,
          procedureList: [{ _id: 'procedure-component-a', number: '1', procedure: { _id: 'procedure-catalog-a', name: 'synthetic procedure', unit: '项' } }],
          materialList: [{ _id: 'material-component-a', checked: true, exts: { layer: 'roof-base' }, material: { _id: 'material-catalog-a', name: 'synthetic material', unit: '桶' } }],
          measureList: [{ _id: 'measure-component-a', number: '1', measure: { _id: 'measure-catalog-a', name: 'synthetic measure', unit: '次' } }],
        }] },
        procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
      }], addItems: { data: [] }, deleteItems: { data: [] },
    } })
    const reconstructed = reconstructQuotationOrder(r1Order, 'workflow-node-synthetic')
    expect(reconstructed.state).toBe('ready')
    if (reconstructed.state !== 'ready') return
    expect(reconstructed.draft.groups[0].projPackages[0].configuration).toMatchObject({
      procedures: [{ providerComponentId: 'procedure-component-a', catalogId: 'procedure-catalog-a' }],
      materials: [{ providerComponentId: 'material-component-a', catalogId: 'material-catalog-a', layer: 'roof-base' }],
      measures: [{ providerComponentId: 'measure-component-a', catalogId: 'measure-catalog-a' }],
    })
    for (const components of Object.values(reconstructed.draft.groups[0].projPackages[0].configuration!)) {
      expect(components[0]).not.toHaveProperty('providerReferenceId')
    }
    const packageRead = { id: 'package-a', kind: 'package' as const, name: 'synthetic package' }
    const procedureRead = { id: 'procedure-catalog-a', kind: 'procedure' as const, name: 'synthetic procedure' }
    const materialRead = { id: 'material-catalog-a', kind: 'material' as const, name: 'synthetic material' }
    const measureRead = { id: 'measure-catalog-a', kind: 'measure' as const, name: 'synthetic measure' }
    const detail = {
      package: packageRead,
      procedures: [{ kind: 'procedure' as const, id: 'procedure-component-a', item: procedureRead }],
      materials: [{ kind: 'material' as const, id: 'material-component-a', layer: 'roof-base', item: materialRead }],
      measures: [{ kind: 'measure' as const, id: 'measure-component-a', item: measureRead }],
    }
    const provider: QuotationCatalogReadPort = {
      listPackages: async () => ({ state: 'succeeded', data: { items: [packageRead] } }),
      getPackageDetail: async () => ({ state: 'succeeded' as const, data: detail }),
      listProcedures: async () => ({ state: 'succeeded' as const, data: { items: [] } }),
      listMaterials: async () => ({ state: 'succeeded' as const, data: { items: [] } }),
      listMeasures: async () => ({ state: 'succeeded' as const, data: { items: [] } }),
    }
    const hydrated = await hydrateQuotationDraft({
      draft: reconstructed.draft,
      context: { serviceType: 'synthetic-service' },
      port: provider,
    })
    expect(hydrated.state).toBe('succeeded')
  })

  it('fails closed when a genuinely explicit Package reference conflicts with embedded catalog identity', () => {
    const conflicting = order({ bjProducts: {
      orderList: [{
        repairParts: ['roof'], partDescription: 'synthetic', maintainAreaNum: '1',
        projPackages: { data: [{
          _id: 'package-a', name: 'synthetic package', number: 1,
          procedureList: [{ _id: 'procedure-component-a', procedureId: 'different-reference', procedure: { _id: 'procedure-catalog-a', name: 'synthetic procedure' } }],
          materialList: [], measureList: [],
        }] }, procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
      }], addItems: { data: [] }, deleteItems: { data: [] },
    } })
    expect(reconstructQuotationOrder(conflicting, 'node')).toMatchObject({ state: 'blocked' })
  })
})
