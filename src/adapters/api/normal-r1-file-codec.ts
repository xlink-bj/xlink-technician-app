import { evaluateVisibility, isFieldApplicable } from '@runtimes/dynamic-form'
import type { FormDefinitionRead, FormFieldValue, FormValueCodec } from '@shared/ports'
import type { R1FileWireValue } from '@shared/types'
import { isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'
import { AdapterMappingError } from '../common/operations'

const reserved = new Set(['id', '_id', 'dataId', 'formDataId', 'formDefId', 'definitionId', 'extId', 'tenantId', 'userId', 'roleId', 'sid', 'smodule', 'state', 'nodeId', 'runtimeNodeId', 'workOrderId', 'workflowId', 'workflowRunId', 'runId', 'workflow', 'formDefinitionId', 'dataStr', 'exts', '__proto__', 'prototype', 'constructor', 'createTime', 'createDateTime', 'createUser', 'createUserName', 'updateTime', 'updateDateTime', 'updateUser', 'updateUserName', 'orgId', 'belongTo', '_version', '_class', 'fieldId', 'sessionRef'])
const valid = (value: unknown): value is string => typeof value === 'string' && Boolean(value) && value.trim() === value && !value.includes(',')
const record = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = (): never => { throw new AdapterMappingError('Normal R1 file value does not match its verified own-slot contract') }
type ReadFile = R1FileWireValue & { readonly path?: string }

function readFiles(raw: unknown): readonly ReadFile[] {
  if (!Array.isArray(raw) || raw.length > 10 || Object.keys(raw).length !== raw.length) return fail()
  const files = raw.map(item => {
    if (!record(item)) return fail()
    const keys = Object.keys(item).sort().join(',')
    if (keys !== 'extname,name,url' && (keys !== 'extname,name,path,url' || typeof item.path !== 'string')) return fail()
    return { url: item.url, name: item.name, extname: item.extname }
  })
  if (!isR1NormalImageWireArray(files)) return fail()
  // Preserve the source common.js historical path key exactly, without turning
  // a four-key read value into a newly writable three-key object.
  return raw.map((item, index) => ({ ...files[index]!, ...(Object.hasOwn(item, 'path') ? { path: item.path as string } : {}) }))
}

/** The caller proves the exact raw generic Ext/type=0/tenant/collection scope.
 * No global mapper changes: bind only selected, independently known file rows.
 * This codec is neither an upload receipt nor a command/edit authorization. */
export function createNormalR1FileCodec(definition: FormDefinitionRead, writableFieldIds: readonly string[]): FormValueCodec | undefined {
  const fields = definition.fields
  if (definition.purpose !== undefined || !valid(definition.id) || !fields?.length || fields.length > 50
    || fields.some(field => !valid(field.fieldId) || !valid(field.valueKey) || field.valueKey.length > 120 || reserved.has(field.valueKey))
    || new Set(fields.map(field => field.fieldId)).size !== fields.length
    || new Set(fields.map(field => field.valueKey)).size !== fields.length
    || !Array.isArray(writableFieldIds) || !writableFieldIds.length || writableFieldIds.length > 50
    || new Set(writableFieldIds).size !== writableFieldIds.length
    || writableFieldIds.some(id => !valid(id) || !fields.some(field => field.fieldId === id && field.readOnly === false))) return undefined
  const selected = fields.filter(field => writableFieldIds.includes(field.fieldId) && field.type === 'file')
  const fieldKeys = new Set(fields.map(field => field.valueKey))
  const knownCondition = (value: unknown): boolean => {
    if (value === undefined) return true
    if (!record(value)) return false
    if (value.kind === 'all') return Array.isArray(value.conditions) && value.conditions.length > 0 && value.conditions.every(knownCondition)
    const path = Array.isArray(value.path) && value.path.length === 1 ? value.path[0] : value.path
    return valid(path) && !path.includes('.') && fieldKeys.has(path) && evaluateVisibility(value as never, {}).state !== 'unsupported'
  }
  if (!selected.length || selected.some(field => typeof field.required !== 'boolean' || field.unsupportedReason || field.presentationOnly
    || field.presentation?.surveyTool || field.valueOption || field.options?.length
    || (field.multiple !== undefined && typeof field.multiple !== 'boolean')
    || (field.showList !== undefined && !Array.isArray(field.showList))
    || !isFieldApplicable(field, 'mobile_detail') || !knownCondition(field.visibility))) return undefined
  const keys = new Set(selected.map(field => field.valueKey))
  return {
    decode(value, context) {
      if (!keys.has(context.valueKey)) return undefined
      if (value === null) return null
      // A known own-slot failure throws. Returning undefined here would allow
      // formData() to substitute an unrelated top-level copy after EXTS loss.
      return readFiles(value) as FormFieldValue
    },
    encode(value, context) {
      if (!keys.has(context.valueKey) || !isR1NormalImageWireArray(value)) return fail()
      return value.map(item => ({ url: item.url, name: item.name, extname: item.extname }))
    },
  }
}
