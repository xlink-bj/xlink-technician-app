import type { QuotationCatalogItemRead } from '@shared/ports'
import type { QuotationLineKind } from './model'

/** R1 placeOrders.vue maintains a separate search value for each catalog kind. */
export function quotationCatalogSearchScopeKey(groupId: string, kind: QuotationLineKind): string {
  return `${groupId}\u0000${kind}`
}

/** Search fields mirror the pinned R1 selector rather than broadening matches. */
export function quotationCatalogSearchMatches(item: QuotationCatalogItemRead, query: string): boolean {
  if (!query) return true

  switch (item.kind) {
    case 'package':
      return item.name.includes(query)
    case 'procedure':
    case 'measure':
      return Boolean(item.content?.includes(query))
    case 'material':
      return Boolean(item.name.includes(query) || item.code?.includes(query))
  }
}

export function quotationCatalogSearchPlaceholder(kind: QuotationLineKind): string {
  switch (kind) {
    case 'package': return '请输入套餐名称'
    case 'procedure': return '请输入工序名称'
    case 'material': return '请输入材料名称或编号'
    case 'measure': return '请输入机措名称'
  }
}
