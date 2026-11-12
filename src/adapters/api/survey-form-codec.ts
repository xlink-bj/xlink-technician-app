import type { FormDefinitionRead, FormFieldPrimitive, FormFieldValue, FormValueCodec } from '@shared/ports'
import { isMediaValueRef } from '@shared/types'

import { AdapterMappingError } from '../common/operations'

const SURVEY_MEDIA_VALUE_KEYS = new Set([
  'surveyDrawing',
  ...Array.from({ length: 20 }, (_, index) => `images${index + 1}`),
  'infraredImageList',
  'beforeMoldRemoval',
  'afterMoldRemoval',
])

function primitive(value: unknown): FormFieldPrimitive | null | undefined {
  if (value === null) return null
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined
}

function primitiveList(value: unknown): readonly FormFieldPrimitive[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.every((item) => primitive(item) !== undefined)
    ? value as readonly FormFieldPrimitive[]
    : undefined
}

function wireMediaRef(value: unknown): FormFieldValue | undefined {
  if (isMediaValueRef(value)) return value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const hasMediaShape = ['url', 'key', 'fileKey', 'objectKey', 'name', 'extname', 'extension', 'fileName']
    .some((key) => Object.prototype.hasOwnProperty.call(record, key))
  if (!hasMediaShape) return undefined
  if (typeof record.url !== 'string' || record.url.trim().length === 0) {
    throw new AdapterMappingError('Survey media record is missing a usable url')
  }
  const objectKey = [record.key, record.fileKey, record.objectKey, record.name]
    .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
  const fileName = typeof record.fileName === 'string' && record.fileName.trim().length > 0
    ? record.fileName
    : undefined
  const extension = [record.extname, record.extension]
    .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
  return {
    url: record.url,
    ...(objectKey ? { objectKey } : {}),
    ...(fileName ? { fileName } : {}),
    ...(extension ? { extension } : {}),
  }
}

function decodeSurveyValue(value: unknown, valueKey: string): FormFieldValue | undefined {
  if (SURVEY_MEDIA_VALUE_KEYS.has(valueKey)) {
    if (!Array.isArray(value)) {
      throw new AdapterMappingError(`Survey media list is malformed for ${valueKey}`)
    }
    const media = value.map(wireMediaRef)
    if (media.every((item) => item !== undefined)) return media as FormFieldValue
    throw new AdapterMappingError(`Survey media list is malformed for ${valueKey}`)
  }
  const scalar = primitive(value)
  if (scalar !== undefined) return scalar
  const scalarList = primitiveList(value)
  if (scalarList) return scalarList
  return undefined
}

function wireMediaRefFromValue(value: FormFieldValue): Record<string, string> {
  if (!isMediaValueRef(value)) throw new AdapterMappingError('Survey media value is not normalized')
  return {
    url: value.url,
    ...(value.objectKey ? { name: value.objectKey } : {}),
    ...(value.fileName ? { fileName: value.fileName } : {}),
    ...(value.extension ? { extname: value.extension } : {}),
  }
}

function encodeSurveyValue(value: FormFieldValue, valueKey: string): unknown {
  if (!SURVEY_MEDIA_VALUE_KEYS.has(valueKey)) {
    if (isMediaValueRef(value) || (Array.isArray(value) && value.some(isMediaValueRef))) {
      throw new AdapterMappingError(`No verified Survey media field contract for ${valueKey}`)
    }
    return value
  }
  if (!Array.isArray(value) || !value.every((item) => isMediaValueRef(item))) {
    throw new AdapterMappingError(`Survey media list is malformed for ${valueKey}`)
  }
  return value.map((item) => wireMediaRefFromValue(item))
}

/** Historical value-level compatibility, also used by the unchanged writer.
 * A whole-record read must bind the resolved declaration below; a valueKey
 * alone cannot distinguish editable fields from server metadata or raw slots. */
export const surveyMediaValueCodec: FormValueCodec = {
  decode(value, context) {
    return decodeSurveyValue(value, context.valueKey)
  },
  encode(value, context) {
    return encodeSurveyValue(value, context.valueKey)
  },
}

interface SurveyReadDeclaration {
  readonly definitionId: string
  readonly valueKeys: ReadonlySet<string>
}
// Only transient immutable declarations, never values, sessions, proofs or
// write permits. No caller-set property can brand an arbitrary codec.
const surveyReadDeclarations = new WeakMap<FormValueCodec, SurveyReadDeclaration>()
const missingDeclaration = (): never => {
  throw new AdapterMappingError('字段配置尚未完整核实，无法回读勘查记录。')
}
const unsupportedStoredValue = (): never => {
  throw new AdapterMappingError('当前读取路径不支持该字段的已保存内容，请从工单重新读取。')
}

/** Narrow legacy-read boundary, not a replacement for the normal configured
 * storage reader. Unrepresentable declared values fail; arbitrary object arrays
 * never become supported media merely because their objects contain a URL. */
export function createSurveyReadValueCodec(definition: FormDefinitionRead): FormValueCodec {
  if (definition.purpose !== 'survey' || typeof definition.id !== 'string' || !definition.id.trim()
    || !definition.fields?.length) return missingDeclaration()
  const valueKeys = new Set<string>(), fieldIds = new Set<string>(), fileKeys = new Set<string>()
  const representations = new Map<string, string>()
  for (const field of definition.fields) {
    if (typeof field.fieldId !== 'string' || !field.fieldId.trim() || fieldIds.has(field.fieldId)
      || typeof field.valueKey !== 'string' || !field.valueKey.trim()
      || ['__proto__', 'prototype', 'constructor', 'exts'].includes(field.valueKey)
      || typeof field.type !== 'string' || !field.type) return missingDeclaration()
    // Field instances may intentionally repeat a valueKey for different
    // conditions/required rules. This reader only distinguishes its existing
    // file representation from primitive values; it issues no write schema.
    const representation = JSON.stringify([field.type === 'file', field.preset ?? null])
    if (representations.has(field.valueKey) && representations.get(field.valueKey) !== representation) {
      throw new AdapterMappingError('同名字段的读取存储配置不一致，无法完整回读勘查记录。')
    }
    representations.set(field.valueKey, representation)
    fieldIds.add(field.fieldId); valueKeys.add(field.valueKey)
    if (field.type === 'file') fileKeys.add(field.valueKey)
  }
  const codec: FormValueCodec = Object.freeze({
    decode(value: unknown, context: { readonly valueKey: string }) {
      if (fileKeys.has(context.valueKey) && !SURVEY_MEDIA_VALUE_KEYS.has(context.valueKey)
        && value !== null && !(Array.isArray(value) && value.length === 0)) return unsupportedStoredValue()
      const decoded = decodeSurveyValue(value, context.valueKey)
      if (decoded === undefined && valueKeys.has(context.valueKey)) return unsupportedStoredValue()
      return decoded
    },
    encode(): never {
      throw new AdapterMappingError('读取上下文不能用于保存勘查记录。')
    },
  })
  surveyReadDeclarations.set(codec, { definitionId: String(definition.id), valueKeys })
  return codec
}

function sameStoredValue(left: unknown, right: unknown): boolean {
  // API JSON values only: property order is irrelevant, array order is not.
  const stable = (value: unknown) => JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
  try { return stable(left) === stable(right) } catch { return false }
}

/** Runs once on the complete raw row before the general EXTS-first projection.
 * The conservative conflict refusal is this App's read/recovery safety policy;
 * old R1 displayed EXTS over root. It does not mint a canonical storage slot. */
export function assertSurveyReadRecord(
  codec: FormValueCodec | undefined,
  record: Readonly<Record<string, unknown>>,
  expectedDefinitionId?: string,
): void {
  if (codec === surveyMediaValueCodec) return missingDeclaration()
  const declaration = codec && surveyReadDeclarations.get(codec)
  if (!declaration) return // Other codecs, including the normal reader, are unchanged.
  if (expectedDefinitionId !== undefined && expectedDefinitionId !== declaration.definitionId) return missingDeclaration()
  const rawExtensions = record.exts
  if (rawExtensions !== undefined && rawExtensions !== null
    && (typeof rawExtensions !== 'object' || Array.isArray(rawExtensions))) return unsupportedStoredValue()
  const extensions = (rawExtensions ?? {}) as Readonly<Record<string, unknown>>
  for (const key of declaration.valueKeys) {
    const inRoot = Object.hasOwn(record, key), inExtensions = Object.hasOwn(extensions, key)
    if (inRoot && inExtensions && !sameStoredValue(record[key], extensions[key])) {
      throw new AdapterMappingError('记录的字段存储副本不一致，无法完整回读；请重新读取工单核对。')
    }
    // Do not let an unsupported EXTS value silently fall back to an old root.
    if (inRoot) codec!.decode(record[key], { valueKey: key })
    if (inExtensions) codec!.decode(extensions[key], { valueKey: key })
  }
}
