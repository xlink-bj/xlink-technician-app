import type { FormDefinitionRead } from '@shared/ports'
import { isR1FileWireArray, type R1FileWireValue } from '@shared/types'
import { normalizeR1LocalFieldPatch, projectR1LocalFields } from './r1-local-form-fields'

/** FormDef-governed fields for synthetic 020/021 FormData writes.
 * File lists follow the R1 generic extForm type=file wire; type=image is reference-only. */
export type R1SpecialMockFields = Readonly<Record<string, string | number | boolean | readonly string[] | readonly R1FileWireValue[]>>
export type R1SpecialMockValidation =
  | { readonly ok: true; readonly fields: R1SpecialMockFields }
  | { readonly ok: false; readonly message: string }

/** R1 legacy extForm persists checkbox IDs, a cascade path and generic file lists.
 * Unknown fields, unverified providers and image references stay fenced. */
export const r1SpecialMockWritableTypes: ReadonlySet<string> = new Set([
  'textarea', 'text', 'radio', 'phone', 'IDNumber', 'number', 'digit', 'switch', 'select',
  'checkbox', 'cascade', 'bizSelect', 'date', 'time', 'datetime', 'rate', 'file',
])

function finiteDecimalWithoutRounding(raw: R1SpecialMockFields[string]): boolean {
  if (Array.isArray(raw)) return false
  if (typeof raw === 'boolean') return false
  const input = String(raw).trim()
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(input)) return false
  // JS Number uses IEEE754. Reject source decimal strings that could be
  // silently rounded on their way into the numeric FormData wire payload.
  const significant = input.replace(/^-?/, '').replace('.', '')
    .replace(/^0+/, '').replace(/0+$/, '')
  return significant.length <= 15
}

export function validateR1SpecialMockFields(
  definition: FormDefinitionRead,
  input: R1SpecialMockFields,
): R1SpecialMockValidation {
  const source = definition.fields
  if (!source?.length || source.length > 50) return { ok: false, message: '当前表单定义无法核验。' }
  if (Object.keys(input).length > 50) return { ok: false, message: '表单字段数量超出可核验范围。' }
  const seen = new Set<string>()
  for (const field of source) {
    if (!field.valueKey || seen.has(field.valueKey)
      || ['__proto__', 'constructor', 'prototype'].includes(field.valueKey)) {
      return { ok: false, message: '表单定义存在重复或无效字段，已阻止提交。' }
    }
    seen.add(field.valueKey)
  }
  if (Object.keys(input).some(key => !seen.has(key))) {
    return { ok: false, message: '提交内容包含不属于当前表单定义的字段。' }
  }
  const projected = projectR1LocalFields(definition, input)
  const fields: Record<string, R1SpecialMockFields[string]> = Object.create(null)
  for (const field of source) {
    const current = projected.find(item => item.fieldId === field.fieldId)!
    const raw = input[field.valueKey]
    // The R1 image is a presentation-only reference, even when the raw
    // ExtField row says required=1. It never becomes a file upload.
    if (field.presentationOnly) {
      if (raw !== undefined) return { ok: false, message: `${field.label}是只读参考内容，不能提交。` }
      continue
    }
    if (!current.supported || !r1SpecialMockWritableTypes.has(field.type)) {
      if (raw !== undefined || (current.required && !current.readOnly
        && current.reason !== '当前字段不可见')) {
        return { ok: false, message: `${field.label}暂不支持安全填写，已阻止提交。` }
      }
      continue
    }
    if (raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
      if (current.required) return { ok: false, message: `请填写${field.label}。` }
      continue
    }
    if (field.type === 'file') {
      if (!isR1FileWireArray(raw) || raw.length === 0) {
        return { ok: false, message: `${field.label}的媒体列表不符合原始表单契约。` }
      }
      fields[field.valueKey] = raw
      continue
    }
    const arrayField = field.type === 'checkbox' || field.type === 'cascade'
      || (field.type === 'bizSelect' && field.multiple === true)
    if (Array.isArray(raw)) {
      if (!arrayField || raw.length > 30 || raw.some(value => typeof value !== 'string' || value.length > 256)
        || ((field.type === 'checkbox' || field.type === 'bizSelect') && new Set(raw).size !== raw.length)) {
        return { ok: false, message: `${field.label}的数组值无效。` }
      }
    } else if (arrayField || (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean')) {
      return { ok: false, message: `${field.label}的字段值无效。` }
    }
    if ((field.type === 'phone' || field.type === 'IDNumber') && typeof raw !== 'string') {
      return { ok: false, message: `${field.label}必须保留为文字值，不能转换成数字。` }
    }
    if (field.type === 'switch' && raw !== '1' && raw !== '0') {
      return { ok: false, message: `${field.label}必须使用原始表单的“是/否”值。` }
    }
    if (field.type === 'digit' && !finiteDecimalWithoutRounding(raw)) {
      return { ok: false, message: `${field.label}的小数精度无法安全写回。` }
    }
    // A FormData submission is a complete candidate, unlike an interactive
    // patch. Visibility must not depend on ExtField row iteration order.
    const next = normalizeR1LocalFieldPatch(definition, input, field.valueKey, raw)
    if (!next || next[field.valueKey] === undefined) {
      return { ok: false, message: `${field.label}不符合当前表单定义。` }
    }
    const normalized = next[field.valueKey]
    if (typeof normalized !== 'string' && typeof normalized !== 'number' && typeof normalized !== 'boolean'
      && !(Array.isArray(normalized) && normalized.every(value => typeof value === 'string'))) {
      return { ok: false, message: `${field.label}目前没有已验证的提交编码。` }
    }
    fields[field.valueKey] = normalized
  }
  return { ok: true, fields }
}
