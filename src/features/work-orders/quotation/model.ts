export const QUOTATION_LINE_KINDS = ['package', 'procedure', 'material', 'measure'] as const

export type QuotationLineKind = typeof QUOTATION_LINE_KINDS[number]

/** A local composition model only; it is not a persisted/backend quotation. */
export interface QuotationLine {
  readonly lineId: string
  readonly kind: QuotationLineKind
  readonly catalogId: string
  readonly label: string
  readonly unit?: string
  readonly quantity: number
}

/** Local recovery state scoped to a single place_order workflow node. */
export interface QuotationDraft {
  readonly workOrderId: string
  readonly workflowNodeId: string
  /** Monotonic client-local edit generation; never a server revision. */
  readonly draftVersion: number
  readonly lines: readonly QuotationLine[]
}

export interface QuotationCatalogItem {
  readonly catalogId: string
  readonly kind: QuotationLineKind
  readonly label: string
  readonly unit?: string
}

export type QuotationQuantityResult =
  | { readonly valid: true; readonly value: number }
  | { readonly valid: false; readonly message: string }

export function createEmptyQuotationDraft(workOrderId: string, workflowNodeId: string): QuotationDraft {
  return { workOrderId, workflowNodeId, draftVersion: 1, lines: [] }
}

export function parseQuotationQuantity(input: string): QuotationQuantityResult {
  const normalized = input.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return { valid: false, message: '请输入大于 0 的数量' }
  }
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0
    ? { valid: true, value }
    : { valid: false, message: '请输入大于 0 的数量' }
}

export function appendQuotationLine(
  draft: QuotationDraft,
  item: QuotationCatalogItem,
  lineId: string,
): QuotationDraft {
  const line: QuotationLine = {
    lineId,
    kind: item.kind,
    catalogId: item.catalogId,
    label: item.label,
    ...(item.unit ? { unit: item.unit } : {}),
    quantity: 1,
  }
  return { ...draft, draftVersion: draft.draftVersion + 1, lines: [...draft.lines, line] }
}

export function changeQuotationLineQuantity(
  draft: QuotationDraft,
  lineId: string,
  quantity: number,
): QuotationDraft {
  const lines = draft.lines.map((line) => line.lineId === lineId ? { ...line, quantity } : line)
  return lines.some((line, index) => line !== draft.lines[index])
    ? { ...draft, draftVersion: draft.draftVersion + 1, lines }
    : draft
}

export function removeQuotationLine(draft: QuotationDraft, lineId: string): QuotationDraft {
  const lines = draft.lines.filter((line) => line.lineId !== lineId)
  return lines.length === draft.lines.length
    ? draft
    : { ...draft, draftVersion: draft.draftVersion + 1, lines }
}
