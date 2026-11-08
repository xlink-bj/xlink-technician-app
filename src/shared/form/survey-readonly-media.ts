import type { FormDefinitionRead, FormFieldRead } from '../ports'
import type { MediaValueRef } from '../types'

// G4E_SURVEY_MEDIA_CONTRACT: Survey List<Map>, not generic file/data.
// STORAGE_59: drawing/infrared are typed root; photo/mold values live in EXTS.
const keys = new Set(['surveyDrawing', ...Array.from({ length: 20 }, (_, i) => `images${i + 1}`),
  'infraredImageList', 'beforeMoldRemoval', 'afterMoldRemoval'])

export function isSurveyReadOnlyMediaField(definition: FormDefinitionRead, field: FormFieldRead): boolean {
  return definition.purpose === 'survey' && field.type === 'file' && keys.has(field.valueKey)
    && field.state === 1 && !field.unsupportedReason && !field.presentationOnly && !field.valueOption
    && (definition.fields ?? []).filter(candidate => candidate.valueKey === field.valueKey).length === 1
}

const text = (value: unknown, max: number): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)

/** Conservative, platform-independent URL syntax gate. It is NOT permission to
 * fetch/open a URL: signed URLs remain transient and never enter display text. */
export function isSurveyReadOnlyMediaUrl(value: unknown): value is string {
  if (!text(value, 2048) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return false
  const match = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::([0-9]{1,5}))?(?:[/?#][^\s\\]*)?$/i.exec(value)
  return Boolean(match && (match[1] === undefined || (Number(match[1]) > 0 && Number(match[1]) <= 65535)))
}

const optionalText = (value: unknown) => value === undefined || text(value, 500)
const extension = (value: unknown) => value === undefined || typeof value === 'string' && /^[a-z0-9]{1,12}$/i.test(value)
export function isSurveyReadOnlyMediaRef(value: unknown): value is MediaValueRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).every(key => ['url', 'objectKey', 'extension'].includes(key))
    && isSurveyReadOnlyMediaUrl(item.url) && optionalText(item.objectKey) && extension(item.extension)
}

/** Bound only for display safety, not a Survey business count limit. */
export const SURVEY_READ_ONLY_MEDIA_SAFETY_LIMIT = 100

// Transient provenance, not a persisted flag or permission. Generic [] and
// command-codec values must never masquerade as a verified empty read.
const verifiedLists = new WeakSet<object>()
export function markSurveyReadOnlyMediaList<T extends readonly MediaValueRef[]>(value: T): T {
  verifiedLists.add(value)
  return value
}
export function isVerifiedSurveyReadOnlyMediaList(value: unknown): value is readonly MediaValueRef[] {
  return Array.isArray(value) && verifiedLists.has(value)
}

export function surveyReadOnlyMediaText(value: unknown): string | undefined {
  if (!isVerifiedSurveyReadOnlyMediaList(value) || value.length > SURVEY_READ_ONLY_MEDIA_SAFETY_LIMIT
    || !value.every(isSurveyReadOnlyMediaRef)) return undefined
  if (!value.length) return '无附件'
  // name is an object key, not a user filename. Never display URL/key, signed
  // query tokens or arbitrary metadata; no links, previews or downloads.
  return `已保存 ${value.length} 个附件（暂不支持打开）：` + value.map((item, index) =>
    `附件 ${index + 1}${item.extension ? `（${item.extension.toUpperCase()}）` : ''}`).join(' / ')
}
