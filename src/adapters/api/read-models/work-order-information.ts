import type { FormFieldRead, FormFieldValue, WorkOrderInformationFieldRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { evaluateVisibility, isFieldApplicable } from '@runtimes/dynamic-form'
import { AdapterMappingError } from '../../common/operations'
import { asRecord, optionalRecord, optionalSignedInteger } from '../../common/records'
import { formDefinition } from './form'

/** A counted single-page configuration read; no all-record or ACL bypass flags. */
export const workOrderInformationRequest = Object.freeze({
  method: 'POST' as const, path: 'biz/extField/query', body: Object.freeze({
    colName: 'serviceAppointment', 'is:state|integer#and': 1,
    sortField: 'order', sortOrder: 'asc', page: 1, size: 200,
  }),
})

const supportedTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'switch', 'rate', 'select', 'radio', 'checkbox', 'cascade'])
const readConfigKeys = new Set(['mpDetailHide', 'showField', 'showValue', 'showType', 'roleIds', 'exts',
  'placeholder', 'width', 'minlength', 'maxlength', 'minLength', 'maxLength', 'group', 'max', 'min', 'componentType'])
const has = (record: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(record, key)
const keyAllowed = (key: unknown): key is string => typeof key === 'string' && key.length > 0 && key.trim() === key
  && !['__proto__', 'prototype', 'constructor'].includes(key)

export function workOrderInformationFields(raw: unknown, tenantId: string): readonly FormFieldRead[] {
  const envelope = asRecord(raw, 'Work Order information configuration')
  if (envelope.success === false || !Array.isArray(envelope.data) || envelope.data.length > 200
    || optionalSignedInteger(envelope, ['total']) !== envelope.data.length || optionalSignedInteger(envelope, ['page']) !== 1
    || envelope.all === true || envelope.needTotal === false) throw new AdapterMappingError('Incomplete Work Order information configuration')
  const ids = new Set<string>()
  const rows = envelope.data.map(item => {
    const row = asRecord(item, 'Work Order information field')
    if (row.colName !== 'serviceAppointment' || row.tenantId !== tenantId || !keyAllowed(row.name)
      || ![0, 1, false, true].includes(row.preset as number)
      || ![1, '1'].includes(row.state as number)
      || typeof row._id !== 'string' || !row._id) throw new AdapterMappingError('Unverified Work Order information field scope')
    if (ids.has(row._id)) throw new AdapterMappingError('Duplicate Work Order information field identity')
    ids.add(row._id)
    return row
  })
  // Reuse the existing ExtField mapper for labels, scalar/choice types,
  // frontend configuration, conditions and inline dictionary options.
  return rows.flatMap(row => {
    // Role predicates are not proven by ordinary field edit modes. Unknown
    // modes stay closed; known edit modes grant no writing in this reader.
    const config = typeof row.frontEndConfig === 'string' ? (() => { try { return optionalRecord(JSON.parse(row.frontEndConfig)) } catch { return undefined } })() : optionalRecord(row.frontEndConfig)
    // Custom provider/script/permission configuration needs its own evidence;
    // a recognized scalar type alone cannot authorize those extra rules.
    if (config && Object.keys(config).some(key => !readConfigKeys.has(key))) return []
    if (config?.exts !== undefined && (!optionalRecord(config.exts)
      || Object.keys(config.exts as Record<string, unknown>).some(key => key !== 'showValue'))) return []
    if ((config?.roleIds !== undefined && (!Array.isArray(config.roleIds) || config.roleIds.length > 0))
      || (row.roleIds !== undefined && (!Array.isArray(row.roleIds) || row.roleIds.length > 0))
      || (row.operationType !== undefined && row.operationType !== null && !['', 'editable', 'readonly', 'creatable'].includes(String(row.operationType)))) return []
    const definition = formDefinition({ data: [row] }, asOpaqueId<'FormDefinitionId'>(typeof row.extId === 'string' ? row.extId : 'serviceAppointment-information'))
    const field = definition.fields?.[0]
    if (!field || !field.showList || !isFieldApplicable(field, 'mobile_detail') || field.presentationOnly
      || field.unsupportedReason) return []
    // Conditions select root or EXTS precisely. Never flatten colliding keys.
    if (field.visibility) {
      const conditionKey = config?.showField ?? row.showField
      if (!keyAllowed(conditionKey) || ![0, 1, false, true].includes(row.showFieldPreset as number)) return []
      return [{ ...field, visibility: { ...field.visibility,
        path: row.showFieldPreset === 1 || row.showFieldPreset === true ? [conditionKey] : ['exts', conditionKey] } }]
    }
    return [field]
  })
}

export function projectWorkOrderInformation(
  record: Record<string, unknown>, fields: readonly FormFieldRead[], includePhone: boolean,
): readonly WorkOrderInformationFieldRead[] {
  const exts = optionalRecord(record.exts)
  const result: WorkOrderInformationFieldRead[] = []
  const ids = new Set<string>()
  for (const field of fields) {
    if (ids.has(field.fieldId)) throw new AdapterMappingError('Duplicate Work Order information field identity')
    ids.add(field.fieldId)
    if (evaluateVisibility(field.visibility, record).state !== 'visible') continue
    if (!supportedTypes.has(field.type)) {
      result.push({ field: { ...field, unsupportedReason: 'Unsupported read type' } }); continue
    }
    if (!field.preset && record.exts !== undefined && record.exts !== null && !exts) {
      result.push({ field: { ...field, unsupportedReason: 'Malformed extension value container' } }); continue
    }
    const container = field.preset ? record : exts
    const value = container && has(container, field.valueKey) ? container[field.valueKey] : undefined
    if (field.type === 'phone' || field.valueKey === 'phone') {
      const status = Number(String(record.status).split(',')[0])
      const accepted = Number.isFinite(status) && status > 103
      if (!includePhone || !accepted) continue
      const mask = typeof value === 'string' ? /^(\d{3})\d{4}(\d{4})$/.exec(value.trim()) : null
      if (mask) result.push({ field, value: `${mask[1]}****${mask[2]}` })
      else if (value === undefined || value === null || value === '') result.push({ field, ...(value !== undefined ? { value } : {}) })
      else result.push({ field: { ...field, unsupportedReason: 'Phone display mask is unavailable' } })
      continue
    }
    const scalar = (v: unknown): v is string | boolean | number => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)
    if (value === undefined || value === null || scalar(value) || Array.isArray(value) && value.every(scalar)) {
      result.push({ field, ...(value !== undefined ? { value: value as FormFieldValue } : {}) })
    } else result.push({ field: { ...field, unsupportedReason: 'Unsupported saved read value' } })
  }
  // Preserve server response order, including Customize user/org/role ordering.
  return result
}
