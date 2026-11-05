import { normalizeFieldValue } from '@runtimes/dynamic-form'
import type { FormFieldOptionRead } from '@shared/ports'
import { classifyOrderAreaPath, createOrderExtFieldEffectivePlan, type OrderExtFieldRawRow, type OrderExtFieldEffectiveContext } from './order-extfield-effective-plan'
import { encodeOrderMedia, projectR1OrderExtFieldWire } from './order-extfield-wire'

const reservedKeys = ['serviceAppointmentNum', 'serviceType', 'sourceType', 'coupons', 'couponsVal', 'couponsName', 'isCreateBjdPDF', 'orphanId']
export function hasReservedOrderFieldKeys(values: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(values).some(key => reservedKeys.includes(key))
}

export interface OrderFieldRuntimeInput {
  readonly mediaRowIds?: readonly string[]
  readonly rows: readonly OrderExtFieldRawRow[]
  readonly context: Omit<OrderExtFieldEffectiveContext, 'values'>
  readonly values: Readonly<Record<string, unknown>>
  /** Only options read from this schema's exact providers and current identity. */
  readonly optionsByRowId: Readonly<Record<string, readonly FormFieldOptionRead[]>>
}
export function evaluateOrderExtFields(input: OrderFieldRuntimeInput, phase: 'selection' | 'submit') {
  const plan = createOrderExtFieldEffectivePlan(input.rows, { ...input.context, values: input.values }, input.optionsByRowId, input.mediaRowIds)
  const errors: Record<string, string> = Object.create(null) as Record<string, string>
  const fields = plan.rows.flatMap(row => row.disposition === 'eligible' && row.schema ? [{
    ...row.schema, options: input.optionsByRowId[row.rowId!] ?? [],
  }] : [])
  for (const row of plan.rows) {
    if (row.finalSubmit.state === 'not_applicable') continue
    if (row.disposition === 'blocked' || (phase === 'submit' && row.finalSubmit.state === 'blocked')) {
      errors[row.rowId ?? 'schema'] = row.reason === 'person_type_context_required' ? '请先选择客户类型。' : '字段配置尚未核实，请稍后重试。'
      continue
    }
    const required = phase === 'submit' ? row.finalSubmit.state === 'required' : row.disposition === 'eligible' && row.requiredness === 'required'
    const value = row.valueKey && Object.prototype.hasOwnProperty.call(input.values, row.valueKey) ? input.values[row.valueKey] : undefined
    const present = Boolean(value) || value === 0
    if (required && (!present || (Array.isArray(value) && value.length === 0))) {
      errors[row.rowId!] = '请填写此项。'
      continue
    }
    if (!present || row.specialControl?.kind === 'presentation') continue
    if (row.specialControl?.kind === 'area' && classifyOrderAreaPath(value).state !== 'complete') {
      errors[row.rowId!] = '请选择完整的省、市、区。'
      continue
    }
    if (row.specialControl?.kind === 'media' && row.specialControl.state === 'resolved') {
      if (encodeOrderMedia(value) === null || (required && Array.isArray(value) && !value.length)) errors[row.rowId!] = '请上传有效的附件。'
      continue
    }
    const schema = row.schema
    // Hidden final obligations still require their original type/provider;
    // never treat a hidden value as automatically valid.
    const original = input.rows.find(field => field.rowId === row.rowId)
    const type = schema?.type ?? (typeof original?.type === 'string' ? original.type : '')
    const options = input.optionsByRowId[row.rowId!] ?? []
    if (original?.valueOption && options.length === 0) {
      errors[row.rowId!] = '选项暂不可用，请重新读取。'
      continue
    }
    if (!normalizeFieldValue(type, value, options, schema?.multiple).ok) errors[row.rowId!] = '请检查填写内容或重新选择。'
  }
  const definitions = input.rows.flatMap(row => typeof row.valueKey === 'string' && typeof row.type === 'string'
    ? [{ name: row.valueKey, type: row.type }] : [])
  const wire = projectR1OrderExtFieldWire(definitions, input.values, input.rows.filter(row => input.mediaRowIds?.includes(String(row.rowId))).map(row => String(row.valueKey)))
  if (wire.state === 'blocked') errors.schema = '字段内容暂不能安全保存。'
  return { plan, fields, errors, state: Object.keys(errors).length ? 'blocked' as const : 'ready' as const,
    exts: wire.state === 'projected' ? wire.exts : undefined }
}
