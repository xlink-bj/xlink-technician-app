import {
  actionDraftIdentityMatches,
  type ActionDraftIdentity,
  type ActionDraftRecord,
} from '@runtimes/action'

import { QUOTATION_LINE_KINDS, type QuotationDraft, type QuotationLine, type QuotationLineKind } from './model'

const QUOTATION_DRAFT_SCHEMA_VERSION = 1

export interface QuotationDraftRecordValues extends Readonly<Record<string, unknown>> {
  readonly schemaVersion: 1
  readonly quotationDraft: QuotationDraft
}

export type QuotationDraftDecodeResult =
  | { readonly state: 'valid'; readonly draft: QuotationDraft }
  | { readonly state: 'invalid'; readonly reason: string }

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validLine(value: unknown): value is QuotationLine {
  const line = record(value)
  if (!line) return false
  const expectedKeys = ['lineId', 'kind', 'catalogId', 'label', 'quantity', ...(Object.prototype.hasOwnProperty.call(line, 'unit') ? ['unit'] : [])]
  if (!exactKeys(line, expectedKeys)) return false
  return nonEmptyString(line.lineId)
    && nonEmptyString(line.catalogId)
    && nonEmptyString(line.label)
    && (QUOTATION_LINE_KINDS as readonly unknown[]).includes(line.kind)
    && (line.unit === undefined || nonEmptyString(line.unit))
    && typeof line.quantity === 'number'
    && Number.isFinite(line.quantity)
    && line.quantity > 0
}

export function quotationDraftRecordFor(
  identity: ActionDraftIdentity,
  draft: QuotationDraft,
  updatedAt: string,
): ActionDraftRecord<QuotationDraftRecordValues> {
  return {
    version: 1,
    identity,
    values: { schemaVersion: QUOTATION_DRAFT_SCHEMA_VERSION, quotationDraft: draft },
    updatedAt,
    status: 'unfinished',
  }
}
export function decodeQuotationDraftRecord(
  value: unknown,
  expectedIdentity: ActionDraftIdentity,
): QuotationDraftDecodeResult {
  const stored = record(value)
  const identity = record(stored?.identity)
  const values = record(stored?.values)
  if (
    !stored ||
    stored.version !== 1 ||
    !identity ||
    !actionDraftIdentityMatches(identity as unknown as ActionDraftIdentity, expectedIdentity) ||
    expectedIdentity.actionIntent !== 'place_order' ||
    expectedIdentity.contentKind !== 'quotation' ||
    typeof stored.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(stored.updatedAt)) ||
    stored.status !== 'unfinished' ||
    !values ||
    !exactKeys(values, ['schemaVersion', 'quotationDraft']) ||
    values.schemaVersion !== QUOTATION_DRAFT_SCHEMA_VERSION
  ) return { state: 'invalid', reason: '本地报价草稿格式不兼容，未覆盖原记录。' }

  const draftValue = record(values.quotationDraft)
  if (
    !draftValue ||
    !exactKeys(draftValue, ['workOrderId', 'workflowNodeId', 'draftVersion', 'lines']) ||
    !nonEmptyString(draftValue.workOrderId) ||
    !nonEmptyString(draftValue.workflowNodeId) ||
    String(expectedIdentity.workOrderId) !== draftValue.workOrderId ||
    String(expectedIdentity.workflowNodeId) !== draftValue.workflowNodeId ||
    typeof draftValue.draftVersion !== 'number' ||
    !Number.isSafeInteger(draftValue.draftVersion) ||
    draftValue.draftVersion < 1 ||
    !Array.isArray(draftValue.lines) ||
    !draftValue.lines.every(validLine)
  ) return { state: 'invalid', reason: '本地报价草稿内容无效，未覆盖原记录。' }

  const lines = draftValue.lines as QuotationLine[]
  const lineIds = new Set(lines.map((line) => line.lineId))
  if (lineIds.size !== lines.length) return { state: 'invalid', reason: '本地报价草稿包含重复行，未覆盖原记录。' }

  return {
    state: 'valid',
    draft: {
      workOrderId: draftValue.workOrderId,
      workflowNodeId: draftValue.workflowNodeId,
      draftVersion: draftValue.draftVersion,
      lines: lines.map((line) => ({
        lineId: line.lineId,
        kind: line.kind as QuotationLineKind,
        catalogId: line.catalogId,
        label: line.label,
        ...(line.unit ? { unit: line.unit } : {}),
        quantity: line.quantity,
      })),
    },
  }
}
