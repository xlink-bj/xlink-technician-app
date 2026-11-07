import { describe, expect, it, vi } from 'vitest'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { formDataUpsertCommand } from '@adapters/api/action-command-wires'
import { TechnicianApiCommandAdapter, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { appointmentRuntimeFieldsFor, appointmentVisitIntentFor, normalizeAppointmentFieldValueForForm, normalizeAppointmentForm } from '@features/work-orders/appointment-form-runtime'
import { normalizeDynamicFieldValue, normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { actionFormConditionValues } from '@features/work-orders/action-form-condition-context'
import type { AppointmentFormRead, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

// Synthetic identities and values, mirroring the six independently captured
// A13 conditions. This is protocol coverage, not effective production scope.
const definitionId = asOpaqueId<'FormDefinitionId'>('submission-context-definition')
const dataId = asOpaqueId<'FormDataId'>('submission-context-record')
const needOptions = [{ value: '1', label: 'Visit' }, { value: '2', label: 'No visit' }]
const rows = [
  { name: 'need', type: 'radio', valueOption: 'need', required: '1', frontEndConfig: '{}' },
  { name: 'reasons1', type: 'select', valueOption: 'reasons1', required: '1', frontEndConfig: '{"showField":"need","showValue":"2"}' },
  { name: 'otherReason', type: 'text', required: '1', frontEndConfig: '{"showField":"reasons1","showValue":"other"}' },
  { name: 'datetime', type: 'datetime', required: '1', frontEndConfig: '{"showField":"need","showValue":"1"}' },
  { name: 'note', type: 'text', required: '0', frontEndConfig: '{}' },
  { name: 'modifyReason', type: 'text', required: '1', frontEndConfig: '{"showField":"_id","showValue":"$exist"}' },
].map(row => ({ ...row, _id: `${row.name}-row`, colName: 'appointment', showList: ['2', '4'], showType: '1' }))

async function load(values: AppointmentFormRead['values'], existing = false, wrapper = false): Promise<AppointmentFormRead> {
  const execute = vi.fn(async () => { throw new Error('No business commands permitted') })
  const readPort = {
    getFormDefinition: vi.fn(async (id: typeof definitionId) => ({ state: 'succeeded', data: formDefinition({ data: rows }, id) })),
    getDynamicCodeOptions: vi.fn(async ({ valueOption }: { valueOption: string }) => ({ state: 'succeeded', data: { items: valueOption === 'need' ? needOptions : [{ value: 'other', label: 'Other' }, { value: '1', label: 'Reason' }] } })),
    getFormData: vi.fn(async ({ definitionId: id }: { definitionId: typeof definitionId }) => ({ state: 'succeeded', data: { items: [formData({ _id: dataId, ...(wrapper ? { exts: values } : values) }, undefined, id)] } })),
  }
  const adapter = new TechnicianApiCommandAdapter({ execute } as ApiCommandTransport, readPort as unknown as TechnicianApiReadPort)
  const result = await adapter.readAppointmentForm(existing ? { formDataId: dataId } : {})
  expect(result.state).toBe('succeeded')
  expect(execute).not.toHaveBeenCalled()
  return existing ? result.data! : { ...result.data!, values }
}
const complete = { need: '1', reasons1: 'other', otherReason: ' details ', datetime: '2026-11-10 10:00:00', note: 'note', modifyReason: 'changed' }
const visible = (form: AppointmentFormRead) => appointmentRuntimeFieldsFor(form).map(f => f.valueKey)

describe('Appointment condition snapshot and effective payload', () => {
  for (const existing of [false, true]) for (const wrapper of [false, true]) {
    it(`retains independently visible otherReason and validated hidden controller for replacement; existing=${existing}, exts=${wrapper}`, async () => {
      const form = await load(complete, existing, wrapper)
      const before = JSON.stringify(form)
      expect(visible(form)).toContain('otherReason')
      expect(visible(form)).not.toContain('reasons1')
      for (const normalize of [normalizeAppointmentForm, normalizeDynamicForm]) {
        const result = normalize(form)
        expect(result.state).toBe('succeeded')
        expect(result.data?.otherReason).toBe('details')
        expect(result.data?.reasons1).toBe('other')
        expect(result.data).not.toHaveProperty('_id')
        expect(Object.hasOwn(result.data!, 'modifyReason')).toBe(existing)
      }
      expect(JSON.stringify(form)).toBe(before)
    })
  }

  for (const otherReason of [undefined, '', null]) it(`requires visible otherReason when controller is hidden: ${otherReason}`, async () => {
    const values = { ...complete } as Record<string, string | null>
    if (otherReason === undefined) delete values.otherReason
    else values.otherReason = otherReason
    const form = await load(values)
    expect(visible(form)).toContain('otherReason')
    expect(normalizeAppointmentForm(form)).toMatchObject({ state: 'failed_terminal', error: { category: 'validation', reason: 'otherReason-row' } })
  })

  it('recomputes on 2 → 1 → 2 transitions without clearing hidden controllers from replacement', async () => {
    const form = await load(complete)
    for (const need of ['2', '1', '2']) {
      const next = { ...form, values: { ...form.values, need } }
      const result = normalizeAppointmentForm(next)
      expect(result.state).toBe('succeeded')
      expect(result.data?.otherReason).toBe('details')
      expect(result.data?.datetime).toBe(complete.datetime)
      expect(result.data?.reasons1).toBe('other')
      expect(visible(next).includes('datetime')).toBe(need === '1')
    }
    expect(form.values.reasons1).toBe('other')
  })

  for (const need of ['0', '2']) it(`preserves specialized deferred datetime exclusion with unconditional field: ${need}`, async () => {
    const loaded = await load({ need })
    const form = { ...loaded, fields: loaded.fields.filter(f => ['need', 'datetime'].includes(f.valueKey)).map(f => f.valueKey === 'need'
      ? { ...f, options: [...needOptions, { value: '0', label: 'Legacy' }] }
      : { ...f, visibility: undefined }) }
    expect(appointmentVisitIntentFor(form)).toBe('visit_deferred')
    expect(visible(form)).not.toContain('datetime')
    expect(normalizeAppointmentForm(form)).toEqual({ state: 'succeeded', data: { need } })
  })

  it('keeps hidden/surface/presentation rows excluded and visible unsupported rules blocked', async () => {
    const base = await load(complete)
    const field = base.fields.find(f => f.valueKey === 'otherReason')!
    for (const patch of [{ mobileDetailHidden: true }, { presentationOnly: true }, { visibility: { kind: 'equals' as const, path: 'need', value: '2' } }]) {
      const form = { ...base, fields: base.fields.map(f => f === field ? { ...f, ...patch } : f) }
      if ('visibility' in patch) expect(normalizeAppointmentForm(form).data?.otherReason).toBe(complete.otherReason)
      else expect(normalizeAppointmentForm(form).state).toBe('failed_terminal')
    }
    for (const patch of [{ unsupportedReason: 'malformed condition' }, { type: 'unknown-widget' }]) {
      const form = { ...base, fields: base.fields.map(f => f === field ? { ...f, ...patch } : f) }
      expect(normalizeAppointmentForm(form).error?.category).toBe('unsupported_capability')
    }
    expect(normalizeAppointmentFieldValueForForm(base, { ...field, readOnly: true }, 'edit').state).toBe('failed_terminal')
    const unknown = { ...base, fields: base.fields.map(f => f.valueKey === 'need' ? { ...f, options: undefined, unsupportedReason: 'provider unresolved' } : f) }
    expect(appointmentVisitIntentFor(unknown)).toBe('unknown')
    expect(normalizeAppointmentForm(unknown).error?.category).toBe('unsupported_capability')
  })

  it('does not promote editable identity or controller values into the payload', async () => {
    const form = await load({ ...complete, _id: 'spoof' })
    expect(actionFormConditionValues(form)).not.toHaveProperty('_id')
    const result = normalizeAppointmentForm(form)
    expect(result.data).not.toHaveProperty('_id')
    expect(result.data).not.toHaveProperty('modifyReason')
    expect(result.data?.reasons1).toBe('other')
  })
})

describe('Protocol reachability observations, not coercion policy', () => {
  for (const need of [1, 2]) for (const wrapper of [false, true]) it(`numeric historical value ${need} survives read but is blocked before submission; exts=${wrapper}`, async () => {
    const form = await load({ need, modifyReason: 'changed' }, true, wrapper)
    expect(form.values.need).toBe(need)
    expect(appointmentVisitIntentFor(form)).toBe('unknown')
    expect(visible(form)).not.toContain('reasons1')
    expect(visible(form)).not.toContain('datetime')
    const normalized = normalizeAppointmentForm(form)
    expect(normalized).toMatchObject({ state: 'failed_terminal', error: { category: 'validation', reason: 'need' } })
    expect(normalizeDynamicForm(form).error?.category).toBe('validation')
    const wire = formDataUpsertCommand({ definitionId, workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-order'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'), values: form.values })
    expect(JSON.parse(String(wire.body?.dataStr)).need).toBe(need)
    const stringForm = { ...form, values: { ...form.values, need: String(need) } }
    expect(normalizeAppointmentForm(stringForm).error?.category).toBe('validation')
  })

  it('a normal provider string selection restores dependent validation without coercing stored data', async () => {
    const form = await load({ need: 2, modifyReason: 'changed' }, true)
    const need = form.fields.find(f => f.valueKey === 'need')!
    const choice = normalizeAppointmentFieldValueForForm(form, need, '2')
    expect(choice).toEqual({ state: 'succeeded', data: '2' })
    const reselected = { ...form, values: { ...form.values, need: choice.data! } }
    expect(visible(reselected)).toContain('reasons1')
    expect(normalizeAppointmentForm(reselected).error?.category).toBe('validation')
    expect(form.values.need).toBe(2)
  })

  for (const need of [0, 1, 2, true, false]) it(`blocks non-string need ${need} edits, normalization and command dispatch`, async () => {
    const form = await load({ ...complete, need })
    const field = form.fields.find(f => f.valueKey === 'need')!
    expect(normalizeAppointmentFieldValueForForm(form, field, need).error?.category).toBe('validation')
    expect(normalizeDynamicFieldValue(form, field, need).error?.category).toBe('validation')
    expect(normalizeAppointmentForm(form).error?.message).toContain('请重新选择上门选项')
    expect(normalizeDynamicForm(form).error?.message).toContain('请重新选择上门选项')
    const execute = vi.fn(async () => { throw new Error('Dispatch forbidden') })
    const beforeFormDispatch = vi.fn(async () => ({ state: 'succeeded' as const }))
    const adapter = new TechnicianApiCommandAdapter({ execute }, {} as TechnicianApiReadPort)
    const result = await adapter.submitAppointment({ workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-order'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'), visitIntent: need === 1 ? 'visit_required' : 'visit_deferred', values: { need }, mutation: {
      beforeFormDispatch, afterFormSaved: async () => ({ state: 'succeeded' }), beforeWorkflowDispatch: async () => ({ state: 'succeeded' }), afterWorkflowCompleted: async () => ({ state: 'succeeded' }),
    } })
    expect(result.error?.category).toBe('validation')
    expect(execute).not.toHaveBeenCalled()
    expect(beforeFormDispatch).not.toHaveBeenCalled()
  })

  it('does not reinterpret unrelated generic need fields or absent appointment need schemas', async () => {
    const base = await load({ need: 2 })
    const unrelated = { ...base, purpose: undefined, fields: base.fields.filter(f => f.valueKey === 'need') }
    expect(normalizeDynamicForm(unrelated)).toEqual({ state: 'succeeded', data: { need: 2 } })
    expect(normalizeDynamicFieldValue(unrelated, unrelated.fields[0]!, 2)).toEqual({ state: 'succeeded', data: 2 })
    expect(normalizeDynamicForm({ ...base, fields: [] }).state).toBe('failed_terminal')
  })

  it('requires canonical string reselection without making readonly need editable', async () => {
    const base = await load({ need: 2 })
    const field = { ...base.fields.find(f => f.valueKey === 'need')!, readOnly: true }
    const form = { ...base, fields: base.fields.map(f => f.valueKey === 'need' ? field : f) }
    expect(normalizeAppointmentForm(form).state).toBe('failed_terminal')
    expect(normalizeDynamicForm(form).state).toBe('failed_terminal')
    expect(normalizeAppointmentFieldValueForForm(form, field, '2').state).toBe('failed_terminal')
    expect(normalizeDynamicFieldValue(form, field, '2').state).toBe('failed_terminal')
  })

  for (const need of [undefined, null, '']) it(`retains existing missing-value required behavior: ${need}`, async () => {
    const form = await load(need === undefined ? {} : { need })
    expect(appointmentVisitIntentFor(form)).toBe('unknown')
    for (const normalize of [normalizeAppointmentForm, normalizeDynamicForm]) {
      expect(normalize(form)).toMatchObject({ state: 'failed_terminal', error: { category: 'validation', reason: 'need-row' } })
      const optional = { ...form, fields: form.fields.map(f => ({ ...f, required: false })) }
      if (need === undefined) expect(normalize(optional)).toEqual({ state: 'succeeded', data: {} })
      else expect(normalize(optional).state).toBe('failed_terminal')
    }
  })

  it('does not silently trim a noncanonical option into a visit intent', async () => {
    const form = await load({ need: ' 2 ' })
    expect(appointmentVisitIntentFor(form)).toBe('unknown')
    expect(normalizeAppointmentForm(form).error?.category).toBe('validation')
    expect(normalizeDynamicForm(form).error?.category).toBe('validation')
  })

  for (const id of [null, '', undefined]) it(`rejects absent/empty sole wire identity ${id}`, () => {
    expect(() => formData({ _id: id, need: '2' }, undefined, definitionId)).toThrow('form data id is missing')
  })

  it('valid aliases establish metadata identity; null root and exts spoof never supply it', async () => {
    const mapped = formData({ _id: null, id: dataId, need: '2', exts: { _id: 'spoof' } }, undefined, definitionId)
    expect(mapped.id).toBe(dataId)
    const form = await load({ ...complete, _id: '' }, true, true)
    expect(actionFormConditionValues(form)._id).toBe(dataId)
    expect(normalizeAppointmentForm(form).state).toBe('failed_terminal') // nested unknown identity cannot be silently dropped by replace
  })
})
