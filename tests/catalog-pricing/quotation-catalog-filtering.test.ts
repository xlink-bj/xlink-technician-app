import { describe, expect, it } from 'vitest'

import type { QuotationCatalogFilterOptionsRead, QuotationCatalogItemRead } from '@shared/ports'
import { filterQuotationCatalogItemsForR1, quotationCatalogOptionsForKind } from '@features/work-orders/quotation/catalog-filtering'

const filters: QuotationCatalogFilterOptionsRead = {
  serviceType: '11',
  packageParts: { codeId: 'partsOne', options: [{ value: 'roof', label: '屋面' }] },
  packageTypes: { codeId: 'packageType', options: [{ value: 'bundle', label: '套餐' }] },
  packageAgeLimits: { codeId: 'agelimitFilter', options: [{ value: '5', label: '5 年' }] },
  procedures: { codeId: 'repairProcedure', options: [{ value: 'prepare', label: '基层处理' }] },
  materials: { codeId: 'type1', options: [{ value: '2', label: '防水材料' }] },
  packageMaterialLayers: { codeId: 'maintenanceLayer', options: [] },
}

const items: readonly QuotationCatalogItemRead[] = [
  { kind: 'package', id: 'package-roof', name: '屋面套餐', r1RepairPartsCodes: ['roof'], r1ConstructionPartsCodes: ['site'], ageLimit: 5 },
  { kind: 'package', id: 'package-other', name: '其他套餐', r1RepairPartsCodes: ['other'], r1ConstructionPartsCodes: ['roof'], ageLimit: 3 },
  { kind: 'package', id: 'package-unknown', name: '未分类套餐', ageLimit: 5 },
  { kind: 'procedure', id: 'procedure-prep', name: '基层处理', r1RepairProcedureCodes: ['prepare'] },
  { kind: 'procedure', id: 'procedure-unknown', name: '未分类工序' },
  { kind: 'material', id: 'material-type-two', name: '材料二', type: 2 },
  { kind: 'material', id: 'material-type-one', name: '材料一', type: 1 },
]

describe('R1 quotation catalog selector filters', () => {
  it('selects only the serviceType-specific R1 dictionary for each category', () => {
    expect(quotationCatalogOptionsForKind(filters, 'package')).toEqual(filters.packageParts.options)
    expect(quotationCatalogOptionsForKind(filters, 'procedure')).toEqual(filters.procedures.options)
    expect(quotationCatalogOptionsForKind(filters, 'material')).toEqual(filters.materials.options)
    expect(quotationCatalogOptionsForKind(filters, 'measure')).toEqual([])
  })

  it.each(['11', '12', '40'])('filters Packages by R1 repairParts for serviceType %s', (serviceType) => {
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'package',
      serviceType,
      options: filters,
      selectedCode: 'roof',
    }).map(item => item.id)).toEqual(['package-roof'])
  })

  it('filters non-repair service Packages by constructionParts codes', () => {
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'package',
      serviceType: '21',
      options: filters,
      selectedCode: 'roof',
    }).map(item => item.id)).toEqual(['package-other'])
  })

  it('applies the selected Package part and verified warranty-age option together', () => {
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'package',
      serviceType: '11',
      options: filters,
      selectedCode: 'roof',
      selectedPackageAgeLimit: '5',
    }).map(item => item.id)).toEqual(['package-roof'])
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'package',
      serviceType: '11',
      options: filters,
      selectedPackageAgeLimit: 'not-a-code-option',
    })).toEqual([])
  })

  it('filters Procedures by R1 repairProcedure values and keeps unknown rows in All', () => {
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'procedure',
      serviceType: '11',
      options: filters,
    }).map(item => item.id)).toEqual(['procedure-prep', 'procedure-unknown'])
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'procedure',
      serviceType: '11',
      options: filters,
      selectedCode: 'prepare',
    }).map(item => item.id)).toEqual(['procedure-prep'])
  })

  it('filters Materials by the R1 serviceType material taxonomy without treating unknown as a match', () => {
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'material',
      serviceType: '11',
      options: filters,
      selectedCode: '2',
    }).map(item => item.id)).toEqual(['material-type-two'])
  })

  it('keeps the complete category visible if filter data is unavailable until a code is selected', () => {
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'package',
      serviceType: '11',
    }).map(item => item.id)).toEqual(['package-roof', 'package-other', 'package-unknown'])
    expect(filterQuotationCatalogItemsForR1({
      items,
      kind: 'package',
      serviceType: '11',
      selectedCode: 'roof',
    })).toEqual([])
  })
})
