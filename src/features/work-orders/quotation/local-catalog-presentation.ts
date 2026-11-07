import type { QuotationCatalogItemRead } from '@shared/ports'
import type { QuotationEngineResult } from './engine'
import type { QuotationDraft, QuotationSelection } from './model'
import { formatQuotationMoney } from './amount-presentation'

/** Plain-text rendering only, never an HTML sanitizer or a wire transformation. */
export function localCatalogDescription(raw: string | undefined, verifiedLocalScope: boolean): string {
  if (!raw || !verifiedLocalScope) return raw ?? ''
  const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?[A-Za-z][^"'<>]*(?:(?:"[^"]*"|'[^']*')[^"'<>]*)*>/g,
      tag => /^<\/?(?:p|div|br|li|ul|ol|h[1-6]|table|tr|td)\b/i.test(tag) ? ' ' : '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, entity: string) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? original
      const value = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return Number.isInteger(value) && value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value) : original
    })
    .replace(/\s+/g, ' ').trim()
}

function validMinimum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e21
}
function minimumCopy(minimum: number, applied = false): string {
  return `最低收费 ¥${formatQuotationMoney(minimum)}${applied ? ' · 本项按最低收费计价' : ''}`
}

export function localCatalogMinimumCharge(item: QuotationCatalogItemRead, verifiedLocalScope: boolean): string {
  return verifiedLocalScope && item.kind === 'procedure' && validMinimum(item.minimumGuideTotalPrice)
    ? minimumCopy(item.minimumGuideTotalPrice) : ''
}

/** Read the source field already preserved by the current encoder, without
 * adding a new price projection, network request or mutation to any object. */
export function localSelectionMinimumCharge(input: {
  readonly verifiedLocalScope: boolean
  readonly result: QuotationEngineResult | null | undefined
  readonly draft: QuotationDraft | null | undefined
  readonly groupId: string
  readonly selection: QuotationSelection
}): string {
  const { result, draft, selection } = input
  if (!input.verifiedLocalScope || selection.kind !== 'procedure' || !draft
    || result?.state !== 'ready' || result.draftVersion !== draft.draftVersion
    || result.payload?.serviceAppointmentId !== draft.workOrderId) return ''
  const groupIndex = draft.groups.findIndex(group => group.groupId === input.groupId)
  const sourceSelection = draft.groups[groupIndex]?.procedures.find(row => row.selectionId === selection.selectionId)
  if (!sourceSelection || sourceSelection.catalogId !== selection.catalogId || sourceSelection.quantity !== selection.quantity) return ''
  const priced = result.pricing?.fillOrder.groups.find(group => group.groupId === input.groupId)
    ?.selectionAmounts.find(row => row.kind === 'procedure' && row.selectionId === selection.selectionId)
  if (!priced || typeof priced.catalogUnitPrice !== 'number' || !Number.isFinite(priced.catalogUnitPrice)
    || priced.catalogUnitPrice < 0 || !Number.isFinite(priced.fillOrderTotalAmount)) return ''
  try {
    const payload = JSON.parse(result.payload.bjProducts)
    const rows: unknown = payload?.orderList?.[groupIndex]?.procedures?.data
    if (!Array.isArray(rows)) return ''
    const matches = rows.filter(row => row?._id === selection.catalogId)
    const row = matches[0]
    if (matches.length !== 1 || !validMinimum(row.minimumGuideTotalPrice)
      || row.number !== selection.quantity || row.guideUnitPrice !== priced.catalogUnitPrice
      || row.amount !== priced.catalogUnitPrice || row.totalAmount !== priced.fillOrderTotalAmount) return ''
    const applied = selection.quantity * row.guideUnitPrice < row.minimumGuideTotalPrice
      && row.totalAmount === row.minimumGuideTotalPrice
    return minimumCopy(row.minimumGuideTotalPrice, applied)
  } catch { return '' }
}
