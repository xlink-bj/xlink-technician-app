import type { QuotationCatalogItem, QuotationLineKind } from './model'

/** Synthetic development catalog; deliberately carries no pricing authority. */
export const quotationCatalog: readonly QuotationCatalogItem[] = [
  { catalogId: 'synthetic-package-basic', kind: 'package', label: '标准服务方案', unit: '套' },
  { catalogId: 'synthetic-procedure-base', kind: 'procedure', label: '基层处理', unit: '项' },
  { catalogId: 'synthetic-material-demo', kind: 'material', label: '演示防水材料', unit: '桶' },
  { catalogId: 'synthetic-measure-area', kind: 'measure', label: '施工面积', unit: '㎡' },
]

export const quotationCatalogKindLabels: Readonly<Record<QuotationLineKind, string>> = {
  package: '套餐',
  procedure: '工序',
  material: '材料',
  measure: '机措',
}

export function quotationCatalogItemsFor(kind: QuotationLineKind): readonly QuotationCatalogItem[] {
  return quotationCatalog.filter((item) => item.kind === kind)
}

export function quotationCatalogItemFor(kind: QuotationLineKind, catalogId: string): QuotationCatalogItem | undefined {
  return quotationCatalog.find((item) => item.kind === kind && item.catalogId === catalogId)
}
