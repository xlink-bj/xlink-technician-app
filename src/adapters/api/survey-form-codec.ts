import type { FormFieldPrimitive, FormFieldValue, FormValueCodec } from '@shared/ports'
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
  const scalar = primitive(value)
  if (scalar !== undefined) return scalar
  const scalarList = primitiveList(value)
  if (scalarList) return scalarList
  if (!SURVEY_MEDIA_VALUE_KEYS.has(valueKey)) return undefined
  if (Array.isArray(value)) {
    const media = value.map(wireMediaRef)
    if (media.every((item) => item !== undefined)) return media as FormFieldValue
    if (value.some((item) => item !== null && typeof item === 'object')) {
      throw new AdapterMappingError(`Survey media list is malformed for ${valueKey}`)
    }
    return undefined
  }
  return wireMediaRef(value)
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
  if (primitive(value) !== undefined || primitiveList(value)) return value
  if (isMediaValueRef(value)) return wireMediaRefFromValue(value)
  if (Array.isArray(value)) {
    if (value.every((item) => isMediaValueRef(item))) {
      return value.map((item) => wireMediaRefFromValue(item as FormFieldValue))
    }
    throw new AdapterMappingError(`Survey media list is malformed for ${valueKey}`)
  }
  throw new AdapterMappingError(`Survey field value is unsupported for ${valueKey}`)
}

export const surveyMediaValueCodec: FormValueCodec = {
  decode(value, context) {
    return decodeSurveyValue(value, context.valueKey)
  },
  encode(value, context) {
    return encodeSurveyValue(value, context.valueKey)
  },
}
