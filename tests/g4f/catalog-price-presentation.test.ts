import { describe, expect, it } from 'vitest'
import type { QuotationCatalogItemRead } from '@shared/ports'
import { catalogUnitPricePresentation } from '@features/work-orders/quotation/catalog-price-presentation'

const item = (value: object) => value as QuotationCatalogItemRead

describe('Q03 catalog unit-price presentation', () => {
  it('shows source-backed ordinary material prices with currency and catalogue unit', () => {
    expect(catalogUnitPricePresentation(item({
      kind: 'material', id: 'mat-1', name: '丁基防水密封胶带',
      unit: '卷', price: 38.6,
    }))).toEqual({ label: '目录单价', price: '¥38.60/卷' })
  })
  it('shows guide price, not a calculated order total, for procedure and measure', () => {
    expect(catalogUnitPricePresentation(item({
      kind: 'procedure', id: 'p-1', name: '屋面节点密封加强施工',
      unit: '处', guideUnitPrice: 68.4,
    }))).toEqual({ label: '指导单价', price: '¥68.40/处' })
    expect(catalogUnitPricePresentation(item({
      kind: 'measure', id: 'm-1', name: '施工区域安全防护',
      unit: '次', guideUnitPrice: 54.2,
    }))).toEqual({ label: '指导单价', price: '¥54.20/次' })
  })
  it('does not imply a package base-price or an SPU price is an effective price', () => {
    expect(catalogUnitPricePresentation(item({
      kind: 'package', id: 'pkg', name: '屋面防水修缮方案', unit: '套', price: 499,
    }))).toEqual({ label: '按套餐配置核价' })
    expect(catalogUnitPricePresentation(item({
      kind: 'material', id: 'spu', name: '密封材料',
      unit: '支', price: 45, saleOptionCandidates: { thickness: ['2','3'] },
    }))).toEqual({ label: '按材料规格核价' })
  })
  it('does not invent prices for missing, NaN, or negative provider data', () => {
    for(const price of [undefined, Number.NaN, -1]){
      expect(catalogUnitPricePresentation(item({
        kind: 'material', id: 'mat', name: '未报价材料', unit: '件', price,
      }))).toEqual({ label: '目录单价未提供' })
    }
  })
})
