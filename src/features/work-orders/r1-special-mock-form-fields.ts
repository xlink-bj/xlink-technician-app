import type { FormDefinitionRead } from '@shared/ports'
import { normalizeR1LocalFieldPatch, projectR1LocalFields } from './r1-local-form-fields'

/** FormDef-governed primitive fields for synthetic 020/021 FormData writes.
 * No media codec, implicit choice, or custom field key is invented here. */
export type R1SpecialMockFields = Readonly<Record<string, string | number | boolean>>
export type R1SpecialMockValidation =
  | { readonly ok: true; readonly fields: R1SpecialMockFields }
  | { readonly ok: false; readonly message: string }

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
  const writableTypes = new Set(['textarea', 'text', 'radio'])
  const fields: Record<string, string | number | boolean> = Object.create(null)
  for (const field of source) {
    const current = projected.find(item => item.fieldId === field.fieldId)!
    const raw = input[field.valueKey]
    // The R1 image is a presentation-only reference, even when the raw
    // ExtField row says required=1. It never becomes a file upload.
    if (field.presentationOnly) {
      if (raw !== undefined) return { ok: false, message: `${field.label}是只读参考内容，不能提交。` }
      continue
    }
    if (!current.supported || !writableTypes.has(field.type)) {
      if (raw !== undefined || (current.required && !current.readOnly
        && current.reason !== '当前字段不可见')) {
        return { ok: false, message: `${field.label}暂不支持安全填写，已阻止提交。` }
      }
      continue
    }
    if (raw === undefined || raw === '') {
      if (current.required) return { ok: false, message: `请填写${field.label}。` }
      continue
    }
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      return { ok: false, message: `${field.label}的字段值无效。` }
    }
    const next = normalizeR1LocalFieldPatch(definition, fields, field.valueKey, raw)
    if (!next || next[field.valueKey] === undefined) {
      return { ok: false, message: `${field.label}不符合当前表单定义。` }
    }
    const normalized = next[field.valueKey]
    if (typeof normalized !== 'string' && typeof normalized !== 'number' && typeof normalized !== 'boolean') {
      return { ok: false, message: `${field.label}目前没有已验证的提交编码。` }
    }
    fields[field.valueKey] = normalized
  }
  return { ok: true, fields }
}
