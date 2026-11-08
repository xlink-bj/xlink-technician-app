import type { FormDefinitionRead, FormFieldValue, FormValueCodec } from '@shared/ports'
import { isSurveyReadOnlyMediaField, isSurveyReadOnlyMediaRef, markSurveyReadOnlyMediaList, SURVEY_READ_ONLY_MEDIA_SAFETY_LIMIT } from '@shared/form/survey-readonly-media'
import { AdapterMappingError } from '../common/operations'

export interface SurveyReadOnlyMediaCodec extends FormValueCodec {
  validateSlots(record: Readonly<Record<string, unknown>>): void
  cloneValues(values: Readonly<Record<string, FormFieldValue>>): Readonly<Record<string, FormFieldValue>>
}

const fail = (): never => { throw new AdapterMappingError('Survey read-only media contract is unverified') }

/** The reader has verified raw Ext/ExtField identity, tenant, state and aliases.
 * Require independent collection agreement, then bind only known Survey fields and their storage slots.
 * Deliberately separate from the existing command codec: this grants no writes. */
export function createSurveyReadOnlyMediaCodec(definition: FormDefinitionRead, collectionName: unknown, rawFields: readonly Readonly<Record<string, unknown>>[]): SurveyReadOnlyMediaCodec | undefined {
  if (definition.purpose !== 'survey') return undefined
  const fields = definition.fields ?? []
  if (!fields.length || fields.length > 200) return undefined
  const keys = new Set(fields.filter(field => isSurveyReadOnlyMediaField(definition, field)).map(field => field.valueKey))
  if (!keys.size) return undefined
  if (typeof collectionName !== 'string' || collectionName.toLowerCase() !== 'survey') return fail()
  const slots = new Map<string, 'root' | 'exts'>()
  for (const key of keys) {
    const field = fields.find(candidate => candidate.valueKey === key)!
    const matches = rawFields.filter(raw => raw._id === field.fieldId)
    const raw = matches[0], root = key === 'surveyDrawing' || key === 'infraredImageList'
    if (matches.length !== 1 || !raw || raw.name !== key || raw.type !== 'file'
      || raw.extId !== definition.id || raw.state !== 1
      || typeof raw.colName !== 'string' || raw.colName.toLowerCase() !== 'survey'
      || (raw.preset !== (root ? 1 : 0) && raw.preset !== (root ? '1' : '0'))) return fail()
    slots.set(key, root ? 'root' : 'exts')
  }
  const decodedKeys = new WeakMap<object, string>()
  return {
    validateSlots(record) {
      const exts = record.exts
      if (exts !== undefined && exts !== null && (typeof exts !== 'object' || Array.isArray(exts))) return fail()
      // No proven precedence for two saved Survey media copies. Do not silently
      // choose EXTS over typed root data, even if both happen to compare equal.
      for (const [key, slot] of slots) {
        // Offline STORAGE_59 + Survey.java: only surveyDrawing/infrared are
        // typed root lists. preset=0 photo/mold fields are extension values.
        const rootPresent = Object.hasOwn(record, key), extPresent = Boolean(exts && Object.hasOwn(exts, key))
        if (slot === 'root' ? extPresent : rootPresent) return fail()
      }
    },
    cloneValues(values) {
      const copy = structuredClone(values)
      for (const key of keys) {
        const source = values[key], target = copy[key]
        if (Array.isArray(source) && decodedKeys.get(source) === key
          && Array.isArray(target) && target.every(isSurveyReadOnlyMediaRef)) {
          decodedKeys.set(target, key)
          markSurveyReadOnlyMediaList(target)
        }
      }
      return copy
    },
    decode(value, context) {
      if (!keys.has(context.valueKey)) return undefined
      if (!Array.isArray(value) || value.length > SURVEY_READ_ONLY_MEDIA_SAFETY_LIMIT
        || Object.keys(value).length !== value.length) return fail()
      const list = value.map(raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail()
        const wire = raw as Record<string, unknown>
        // Only the documented wire shape, not key/fileKey/fileName aliases,
        // nested data, local tasks, provider payloads or normalized edit values.
        if (!Object.keys(wire).every(key => ['url', 'name', 'extname'].includes(key))
          || ['name', 'extname'].some(key => Object.hasOwn(wire, key) && typeof wire[key] !== 'string')) return fail()
        const ref = { url: wire.url, ...(Object.hasOwn(wire, 'name') ? { objectKey: wire.name } : {}),
          ...(Object.hasOwn(wire, 'extname') ? { extension: wire.extname } : {}) }
        if (!isSurveyReadOnlyMediaRef(ref)) return fail()
        return ref
      })
      decodedKeys.set(list, context.valueKey)
      return markSurveyReadOnlyMediaList(list)
    },
    encode() { return fail() },
  }
}
