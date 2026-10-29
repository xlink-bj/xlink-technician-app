import type { QuotationCatalogItemRead } from '@shared/ports'
import { formatQuotationMoney } from './amount-presentation'

export interface CatalogUnitPricePresentation {
  readonly label: string
  readonly price?: string
}

/**
 * Catalogue-level reference ONLY. Effective quotation amounts are derived by
 * the existing R1 pricing engine after the selection is in the workbench.
 * Never infer a SKU price from an SPU, or show package base cost as a quote.
 */
export function catalogUnitPricePresentation(item: QuotationCatalogItemRead): CatalogUnitPricePresentation {
  if (item.kind === 'package') return { label: '按套餐配置核价' }
  if (item.kind === 'material' && item.saleOptionCandidates
    && Object.keys(item.saleOptionCandidates).length > 0) {
    return { label: '按材料规格核价' }
  }
  const amount = item.kind === 'material' ? item.price : item.guideUnitPrice
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return { label: '目录单价未提供' }
  }
  const unit = item.unit?.trim()
  return {
    label: item.kind === 'material' ? '目录单价' : '指导单价',
    price: `¥${formatQuotationMoney(amount)}${unit ? '/'+unit : ''}`,
  }
}
