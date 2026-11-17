import { describe, expect, it } from 'vitest'

import type { QuotationCatalogItemRead } from '@shared/ports'
import {
  quotationCatalogSearchMatches,
  quotationCatalogSearchPlaceholder,
  quotationCatalogSearchScopeKey,
} from '@features/work-orders/quotation/catalog-search'

const packageItem: QuotationCatalogItemRead = {
  id: 'package-1',
  kind: 'package',
  name: '屋面修缮套餐',
  code: 'PK-01',
  specification: '20kg',
  description: '套餐说明',
}

const procedureItem: QuotationCatalogItemRead = {
  id: 'procedure-1',
  kind: 'procedure',
  name: '工序显示名称',
  content: '基层处理施工',
  description: '工序说明',
}

const materialItem: QuotationCatalogItemRead = {
  id: 'material-1',
  kind: 'material',
  name: '弹性涂料',
  code: 'MAT-02',
  specification: '18kg',
  description: '材料说明',
}

const measureItem: QuotationCatalogItemRead = {
  id: 'measure-1',
  kind: 'measure',
  name: '机措显示名称',
  content: '高处作业防护',
}

describe('quotation catalog search R1 parity', () => {
  it('uses the R1 search fields per catalog kind', () => {
    expect(quotationCatalogSearchMatches(packageItem, '屋面')).toBe(true)
    expect(quotationCatalogSearchMatches(packageItem, 'PK-01')).toBe(false)
    expect(quotationCatalogSearchMatches(packageItem, '20kg')).toBe(false)

    expect(quotationCatalogSearchMatches(procedureItem, '基层处理')).toBe(true)
    expect(quotationCatalogSearchMatches(procedureItem, '工序显示名称')).toBe(false)

    expect(quotationCatalogSearchMatches(materialItem, '弹性')).toBe(true)
    expect(quotationCatalogSearchMatches(materialItem, 'MAT-02')).toBe(true)
    expect(quotationCatalogSearchMatches(materialItem, '18kg')).toBe(false)

    expect(quotationCatalogSearchMatches(measureItem, '高处作业')).toBe(true)
    expect(quotationCatalogSearchMatches(measureItem, '机措显示名称')).toBe(false)
  })

  it('provides search hints that describe the supported R1 query fields', () => {
    expect(quotationCatalogSearchPlaceholder('package')).toBe('请输入套餐名称')
    expect(quotationCatalogSearchPlaceholder('procedure')).toBe('请输入工序名称')
    expect(quotationCatalogSearchPlaceholder('material')).toBe('请输入材料名称或编号')
    expect(quotationCatalogSearchPlaceholder('measure')).toBe('请输入机措名称')
  })

  it('isolates the search value scope by repair-part group and category', () => {
    expect(quotationCatalogSearchScopeKey('group-a', 'package')).not.toBe(
      quotationCatalogSearchScopeKey('group-a', 'material'),
    )
    expect(quotationCatalogSearchScopeKey('group-a', 'package')).not.toBe(
      quotationCatalogSearchScopeKey('group-b', 'package'),
    )
  })
})
