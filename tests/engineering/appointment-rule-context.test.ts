import { describe, expect, it, vi } from 'vitest'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { TechnicianApiCommandAdapter, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { appointmentRuntimeFieldsFor, appointmentVisitIntentFor, normalizeAppointmentFieldValue, normalizeAppointmentFieldValueForForm, normalizeAppointmentForm } from '@features/work-orders/appointment-form-runtime'
import { dynamicActionFieldsFor, normalizeDynamicFieldValue, normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { actionFormConditionValues } from '@features/work-orders/action-form-condition-context'
import { draftRecordFor, dynamicDraftRecordFor } from '@features/work-orders/action-workspace-draft-utils'
import { actionDraftIdentityFor } from '@runtimes/action'
import { evaluateVisibility, normalizeSubmission } from '@runtimes/dynamic-form'
import type { AppointmentFormRead, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

// Synthetic minimal contract, not production records. The verified provider uses
// string 1/2; ROOT _id/$exist is mapped by the real adapter, not hand injected.
const definitionId = asOpaqueId<'FormDefinitionId'>('appointment-rule-definition')
const dataId = asOpaqueId<'FormDataId'>('appointment-rule-record')
const options = [{ value: '1', label: '需要上门' }, { value: '2', label: '不需要上门' }]
const rows = [
  { _id: 'need-row', name: 'need', type: 'radio', valueOption: 'need', required: '1', showList: [4], frontEndConfig: '{}' },
  { _id: 'modify-row', name: 'modifyReason', type: 'text', required: '1', showList: [4, 2], frontEndConfig: '{"showField":"_id","showValue":"$exist"}' },
]
const identity = actionDraftIdentityFor({
  userId: asOpaqueId<'UserId'>('rule-user'), workOrderId: asOpaqueId<'WorkOrderId'>('rule-work-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('rule-node'), actionIntent: 'set_appointment', contentKind: 'dynamic_form',
})
const draft = (values: Record<string, unknown>) => ({ version: 1, status: 'unfinished', updatedAt: '2026-11-07T00:00:00Z', identity, values })
async function load(existing = true, method: 'readAppointmentForm' | 'readDynamicForm' = 'readAppointmentForm') {
  const execute = vi.fn(async () => { throw new Error('Business commands prohibited') })
  const readPort = {
    getFormDefinition: vi.fn(async (id: typeof definitionId) => ({ state: 'succeeded', data: formDefinition({ data: rows }, id) })),
    getDynamicCodeOptions: vi.fn(async () => ({ state: 'succeeded', data: { items: options } })),
    getFormData: vi.fn(async ({ definitionId: id }: { definitionId: typeof definitionId }) => ({ state: 'succeeded', data: { items: [formData({ _id: dataId, need: '2', exts: { _id: 'untrusted-exts' } }, undefined, id)] } })),
  }
  const adapter = new TechnicianApiCommandAdapter({ execute } as ApiCommandTransport, readPort as unknown as TechnicianApiReadPort)
  const result = await adapter[method]({ definitionId, ...(existing ? { formDataId: dataId } : {}) })
  expect(result.state).toBe('succeeded')
  expect(execute).not.toHaveBeenCalled()
  expect(readPort.getDynamicCodeOptions).toHaveBeenCalled()
  return { ...result.data!, values: { ...result.data!.values, need: '2' } } as AppointmentFormRead
}

describe('Appointment verified rules and condition-only record identity', () => {
  it('recognizes verified string 2 and retains verified legacy 0 only', async () => {
    const form = await load(false)
    expect(appointmentVisitIntentFor(form)).toBe('visit_deferred')
    for (const value of ['0', 'unknown', '', null]) expect(appointmentVisitIntentFor({ ...form, values: { need: value } })).toBe('unknown')
    expect(appointmentVisitIntentFor({ ...form, fields: form.fields.map(f => ({ ...f, options: undefined })) })).toBe('unknown')
    const legacy = { ...form, fields: form.fields.map(f => f.valueKey === 'need' ? { ...f, options: [{ value: '0', label: '旧选项' }] } : f), values: { need: '0' } }
    expect(appointmentVisitIntentFor(legacy)).toBe('visit_deferred')
  })

  for (const method of ['readAppointmentForm', 'readDynamicForm'] as const) {
    it(`${method}: mapper, hydration, selector, field edit and submission share trusted identity`, async () => {
      const form = await load(true, method)
      const field = form.fields.find(f => f.valueKey === 'modifyReason')!
      expect(form.dataId).toBe(dataId)
      expect(appointmentRuntimeFieldsFor(form).some(f => f.valueKey === 'modifyReason')).toBe(true)
      expect(dynamicActionFieldsFor(form).find(f => f.valueKey === 'modifyReason')!.runtime.visible).toBe(true)
      expect(normalizeAppointmentForm(form).state).toBe('failed_terminal')
      expect(normalizeDynamicForm(form).state).toBe('failed_terminal')
      expect(normalizeAppointmentFieldValueForForm(form, field, ' change ')).toMatchObject({ state: 'succeeded', data: 'change' })
      expect(normalizeDynamicFieldValue(form, field, ' change ')).toMatchObject({ state: 'succeeded', data: 'change' })
      const filled = { ...form, values: { ...form.values, modifyReason: 'change', _id: 'spoof' } }
      expect(normalizeAppointmentForm(filled).state).toBe('failed_terminal') // raw exts._id is unsafe replacement state
      expect(normalizeDynamicForm(filled)).toEqual({ state: 'succeeded', data: { need: '2', modifyReason: 'change' } }) // unclassified generic form unchanged
      expect(actionFormConditionValues(filled)._id).toBe(dataId)
      expect(filled.values._id).toBe('spoof')
      expect(Object.isFrozen(actionFormConditionValues(filled))).toBe(true)
    })
    it(`${method}: new record and value spoof cannot enable editing`, async () => {
      const form = await load(false, method)
      const spoofed = { ...form, values: { need: '2', _id: 'spoof', modifyReason: 'must not submit' } }
      const field = form.fields.find(f => f.valueKey === 'modifyReason')!
      expect(appointmentRuntimeFieldsFor(spoofed).some(f => f.valueKey === 'modifyReason')).toBe(false)
      expect(normalizeAppointmentFieldValueForForm(spoofed, field, 'change').state).toBe('failed_terminal')
      expect(normalizeDynamicFieldValue(spoofed, field, 'change').state).toBe('failed_terminal')
      expect(normalizeAppointmentFieldValue(field, 'change', spoofed.values).state).toBe('failed_terminal')
      for (const normalize of [normalizeAppointmentForm, normalizeDynamicForm]) expect(normalize(spoofed)).toEqual({ state: 'succeeded', data: { need: '2' } })
    })
  }

  it('restores edit drafts against metadata and rejects spoofed identities without changing metadata', async () => {
    const form = await load()
    for (const restore of [draftRecordFor, dynamicDraftRecordFor]) {
      const restored = restore(draft({ need: '2', modifyReason: 'changed' }), identity, form)
      expect(restored?.values).toEqual({ need: '2', modifyReason: 'changed' })
      expect(restored?.values).not.toHaveProperty('_id')
      expect(restore(draft({ need: '2', _id: 'spoof' }), identity, form)).toBeNull()
      expect(form.dataId).toBe(dataId)
    }
  })

  it('fails closed for missing, malformed or inherited metadata identity', async () => {
    const form = await load(false)
    for (const id of [undefined, null, '', ' ', ' padded ', 1, false, [], {}]) {
      const invalid = { ...form, dataId: id, values: { need: '2', _id: 'spoof' } } as unknown as AppointmentFormRead
      expect(actionFormConditionValues(invalid)).not.toHaveProperty('_id')
      expect(appointmentRuntimeFieldsFor(invalid).some(f => f.valueKey === 'modifyReason')).toBe(false)
    }
    expect(actionFormConditionValues({ ...form, dataId, definitionId: undefined })).not.toHaveProperty('_id')
    const inherited = Object.assign(Object.create({ dataId }), form)
    expect(actionFormConditionValues(inherited)).not.toHaveProperty('_id')
  })

  it('keeps field and workflow readonly and unsupported visibility fail-closed', async () => {
    const form = await load()
    const field = { ...form.fields.find(f => f.valueKey === 'modifyReason')!, readOnly: true }
    expect(normalizeAppointmentFieldValueForForm(form, field, 'change').state).toBe('failed_terminal')
    const workflowForm = { ...form, workflowReadOnlyFieldIds: [field.fieldId] }
    expect(normalizeDynamicFieldValue(workflowForm, { ...field, readOnly: false }, 'change').state).toBe('failed_terminal')
    const unsupported = { ...form, fields: [{ ...field, readOnly: false, unsupportedReason: 'unverified' }] }
    expect(normalizeAppointmentForm(unsupported).error?.category).toBe('unsupported_capability')
    expect(normalizeDynamicForm(unsupported).error?.category).toBe('unsupported_capability')
  })

  it('leaves generic existence/equality unchanged and never serializes condition-only values', () => {
    expect(evaluateVisibility({ kind: 'exists', path: '_id', expected: true }, { _id: null }).visible).toBe(true)
    expect(evaluateVisibility({ kind: 'exists', path: '_id', expected: true }, { _id: '' }).visible).toBe(true)
    expect(evaluateVisibility({ kind: 'equals', path: 'need', value: '2' }, { need: 2 }).visible).toBe(false)
    expect(normalizeSubmission({ fields: [{ fieldId: 'modify', valueKey: 'modifyReason', type: 'text', visibility: { kind: 'exists', path: '_id', expected: true } }], values: { modifyReason: 'reason' }, conditionValues: { _id: dataId } })).toEqual({ ok: true, value: { values: { modifyReason: 'reason' } } })
  })
})
