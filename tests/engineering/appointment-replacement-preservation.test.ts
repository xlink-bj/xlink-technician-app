import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { formDataUpsertCommand } from '@adapters/api/action-command-wires'
import { TechnicianApiCommandAdapter } from '@adapters/api/technician-api-commands'
import { normalizeAppointmentForm, normalizeAppointmentFieldValueForForm, appointmentRuntimeFieldsFor } from '@features/work-orders/appointment-form-runtime'
import { normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { draftRecordFor } from '@features/work-orders/action-workspace-draft-utils'
import { actionDraftIdentityFor } from '@runtimes/action'
import { asOpaqueId } from '@shared/types'
import type { AppointmentFormRead, TechnicianApiReadPort } from '@shared/ports'

// Self-contained synthetic protocol fixture. Metadata key/types mirror an existing
// local API readback; six-field rules mirror the verified definition. This combined
// record is NOT an observed six-field production record. Dates remain API strings.
const definitionId = asOpaqueId<'FormDefinitionId'>('replacement-definition')
const dataId = asOpaqueId<'FormDataId'>('replacement-record')
const workOrderId = asOpaqueId<'WorkOrderId'>('replacement-order')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('replacement-node')
const workflowRunId = asOpaqueId<'WorkflowRunId'>('replacement-run')
const rows = [
  { name: 'need', type: 'radio', valueOption: 'need', required: '1', frontEndConfig: '{}' },
  { name: 'reasons1', type: 'select', valueOption: 'reasons1', required: '1', frontEndConfig: '{"showField":"need","showValue":"2"}' },
  { name: 'otherReason', type: 'text', required: '1', frontEndConfig: '{"showField":"reasons1","showValue":"other"}' },
  { name: 'datetime', type: 'datetime', required: '1', frontEndConfig: '{"showField":"need","showValue":"1"}' },
  { name: 'note', type: 'text', required: '0', frontEndConfig: '{}' },
  { name: 'modifyReason', type: 'text', required: '1', frontEndConfig: '{"showField":"_id","showValue":"$exist"}' },
].map(row => ({ ...row, _id: `${row.name}-row`, colName: 'appointment', showList: ['2', '4'], showType: '1' }))
const initial = {
  _id: dataId, need: '2', reasons1: 'other', otherReason: 'details', datetime: '2026-11-10 10:00:00', note: 'original', modifyReason: 'edited',
  sid: workOrderId, smodule: 'serviceAppointment', nodeId: workflowNodeId, workflowId: workflowRunId, state: 1,
  tenantId: 'original-tenant', createTime: '2026-11-01 08:00:00', createDateTime: '2026-11-01 08:00:00',
  updateTime: '2026-11-02 08:00:00', updateDateTime: '2026-11-02 08:00:00', createUser: 'creator', updateUser: 'editor',
  orgId: 'original-org', belongTo: 'original-owner', updateUserName: 'Editor',
}
async function load(record: Record<string, unknown> | null = initial, fields = rows): Promise<AppointmentFormRead> {
  const execute = vi.fn(async () => { throw new Error('No business command permitted') })
  const read = {
    getFormDefinition: vi.fn(async () => ({ state: 'succeeded', data: formDefinition({ data: fields }, definitionId) })),
    getDynamicCodeOptions: vi.fn(async ({ valueOption }: { valueOption: string }) => ({ state: 'succeeded', data: { items: (valueOption === 'need' ? ['1', '2'] : ['1', '2', '3', '4', '5', '6', 'other']).map(value => ({ value, label: value })) } })),
    getFormData: vi.fn(async () => ({ state: 'succeeded', data: { items: [formData(record!, undefined, definitionId)] } })),
  }
  const result = await new TechnicianApiCommandAdapter({ execute }, read as unknown as TechnicianApiReadPort).readDynamicForm({ definitionId, ...(record ? { formDataId: dataId, expectedWorkflowRunId: workflowRunId } : {}) })
  expect(result.state).toBe('succeeded')
  expect(execute).not.toHaveBeenCalled()
  return result.data as AppointmentFormRead
}
function edit(form: AppointmentFormRead, key: string, value: string): AppointmentFormRead {
  const result = normalizeAppointmentFieldValueForForm(form, form.fields.find(f => f.valueKey === key)!, value)
  expect(result.state).toBe('succeeded')
  return { ...form, values: { ...form.values, [key]: result.data! } }
}
function wire(form: AppointmentFormRead) {
  const normalized = normalizeAppointmentForm(form)
  expect(normalized.state).toBe('succeeded')
  expect(normalizeDynamicForm(form)).toEqual(normalized)
  return JSON.parse(String(formDataUpsertCommand({ definitionId, workOrderId, workflowNodeId, workflowRunId, purpose: 'appointment', formDataId: form.dataId, appointmentReplacement: form.appointmentReplacement, values: normalized.data! }).body?.dataStr)) as Record<string, unknown>
}
const visible = (form: AppointmentFormRead) => appointmentRuntimeFieldsFor(form).map(f => f.valueKey)

describe('Appointment literal replacement and verified readback', () => {
  it('runs six-field 2 → 1 → 2 user edits through final dataStr, replacement (not merge), and real read adapter', async () => {
    let form = await load()
    expect(form.values).not.toHaveProperty('orgId')
    expect(Object.isFrozen(form.appointmentReplacement)).toBe(true)
    expect(ref(form).value.appointmentReplacement).toBe(form.appointmentReplacement)
    for (const need of ['1', '2', '1', '2']) {
      form = edit(form, 'need', need)
      const replacement = wire(form)
      expect(replacement.reasons1).toBe('other')
      expect(replacement.otherReason).toBe('details')
      expect(replacement.datetime).toBe(initial.datetime)
      expect(replacement.orgId).toBe(initial.orgId)
      expect(replacement.belongTo).toBe(initial.belongTo)
      expect(replacement.createDateTime).toBe(initial.createDateTime)
      expect(replacement).not.toHaveProperty('tenantId') // server-owned, not forwarded
      expect(replacement).not.toHaveProperty('updateUserName')
      form = await load(replacement) // no {...oldRecord, ...replacement} merge
      expect(visible(form)).toContain('otherReason')
      expect(visible(form).includes('datetime')).toBe(need === '1')
      expect(visible(form).includes('reasons1')).toBe(need === '2')
    }
  })
  it('normal reason hides but retains other text; explicit optional text clear remains empty on wire/readback', async () => {
    let form = edit(await load(), 'reasons1', '1')
    form = edit(form, 'note', '')
    expect(visible(form)).not.toContain('otherReason')
    const replacement = wire(form)
    expect(replacement.otherReason).toBe('details')
    expect(replacement.note).toBe('')
    const reopened = await load(replacement)
    expect(reopened.values.note).toBe('')
    expect(visible(edit(reopened, 'reasons1', 'other'))).toContain('otherReason')
    const clearedRequired = edit(edit(reopened, 'reasons1', 'other'), 'otherReason', '')
    expect(normalizeAppointmentForm(clearedRequired).error?.category).toBe('validation')
  })
  it('supports new record then authoritative reopen; save ACK alone cannot manufacture edit provenance', async () => {
    let form = await load(null)
    form = edit(form, 'need', '2')
    form = edit(form, 'reasons1', '1')
    const replacement = wire(form)
    expect(replacement).not.toHaveProperty('_id')
    expect(replacement).not.toHaveProperty('datetime')
    expect(replacement).not.toHaveProperty('modifyReason')
    expect(normalizeAppointmentForm({ ...form, dataId, values: { ...form.values, modifyReason: 'changed' } }).state).toBe('failed_terminal')
    const reopened = await load({ ...replacement, _id: dataId })
    expect(visible(reopened)).toContain('modifyReason')
    const edited = edit(reopened, 'modifyReason', 'changed')
    expect(wire(edited).modifyReason).toBe('changed')
    expect(wire(await load(wire(edited))).modifyReason).toBe('changed')
  })
  for (const extra of [{ unknown: { nested: true } }, { unknown: 'scalar' }, { _version: 2 }, { exts: { naturalCaseCode: 'synthetic' } }, { exts: { _id: 'spoof' } }, { exts: { reasons1: '1' } }, { orgId: { unexpected: true } }]) {
    it(`fails before lossy mapper state can disappear: ${JSON.stringify(extra)}`, async () => {
      const form = await load({ ...initial, ...extra })
      expect(normalizeAppointmentForm(form).state).toBe('failed_terminal')
    })
  }
  it('keeps exact API metadata strings and never accepts draft metadata or forged cloned context', async () => {
    const form = await load({ ...initial, orgName: 'Original org', createUserName: 'Creator' })
    expect(wire(form)).toMatchObject({ orgName: 'Original org', createUserName: 'Creator' })
    for (const changed of [{ dataId: asOpaqueId<'FormDataId'>('wrong') }, { definitionId: asOpaqueId<'FormDefinitionId'>('wrong') }, { appointmentReplacement: { ...form.appointmentReplacement! } }, { appointmentReplacement: undefined }]) expect(normalizeAppointmentForm({ ...form, ...changed }).state).toBe('failed_terminal')
    const identity = actionDraftIdentityFor({ userId: asOpaqueId<'UserId'>('synthetic-user'), workOrderId, workflowNodeId, actionIntent: 'set_appointment', contentKind: 'dynamic_form' })
    for (const values of [{ _id: 'spoof' }, { orgId: 'spoof' }, { appointmentReplacement: { ...form.appointmentReplacement! } }]) {
      expect(draftRecordFor({ version: 1, status: 'unfinished', updatedAt: '2026-11-07', identity, values }, identity, form)).toBeNull()
    }
    expect(form.appointmentReplacement?.metadata.orgId).toBe(initial.orgId)
  })
  for (const patch of [{ readOnly: true }, { mobileDetailHidden: true }, { presentationOnly: true }, { unsupportedReason: 'unknown config' }, { options: undefined }]) it(`does not preserve unauthorized hidden reasons: ${JSON.stringify(patch)}`, async () => {
    const base = edit(await load(), 'need', '1')
    const form = { ...base, fields: base.fields.map(f => f.valueKey === 'reasons1' ? { ...f, ...patch } : f) }
    expect(normalizeAppointmentForm(form).state).toBe('failed_terminal')
  })
  it('validates hidden text without trimming original values and blocks visible readonly mutations', async () => {
    const form = await load({ ...initial, reasons1: '1', otherReason: '  untouched  ' })
    expect(wire(form).otherReason).toBe('  untouched  ')
    const readonly = { ...form, values: { ...form.values, note: 'forged' }, fields: form.fields.map(f => f.valueKey === 'note' ? { ...f, readOnly: true } : f) }
    expect(normalizeAppointmentForm(readonly).state).toBe('failed_terminal')
  })
  for (const key of ['sid', 'nodeId', 'workflowId']) it(`blocks missing trusted command scope ${key}`, async () => {
    const raw: Record<string, unknown> = { ...initial }
    delete raw[key]
    // Real mapper still permits read-only display of old incomplete records.
    const mapped = formData(raw, undefined, definitionId)
    expect(() => formDataUpsertCommand({ definitionId, workOrderId, workflowNodeId, workflowRunId, purpose: 'appointment', formDataId: dataId, appointmentReplacement: mapped.appointmentReplacement, values: { need: '2' } })).toThrow()
  })
  for (const need of [1, 2, true, false]) it(`rejects nonstring need ${need}`, async () => {
    const form = await load({ ...initial, need })
    expect(normalizeAppointmentForm(form).error?.category).toBe('validation')
    expect(() => formDataUpsertCommand({ definitionId, workOrderId, workflowNodeId, purpose: 'appointment', values: { need } })).toThrow()
  })
  it('rejects null business values and mismatched envelope before any command checkpoint', async () => {
    const form = await load()
    const execute = vi.fn()
    const beforeFormDispatch = vi.fn()
    const adapter = new TechnicianApiCommandAdapter({ execute }, {} as TechnicianApiReadPort)
    for (const values of [{ need: '2', note: null }, { need: '2', datetime: null }] as AppointmentFormRead['values'][]) {
      const result = await adapter.submitAppointment({ workOrderId, workflowNodeId, workflowRunId, visitIntent: 'visit_deferred', values, mutation: { beforeFormDispatch, afterFormSaved: vi.fn(), beforeWorkflowDispatch: vi.fn(), afterWorkflowCompleted: vi.fn() } })
      expect(result.state).toBe('failed_terminal')
    }
    for (const mismatch of [{ workOrderId: asOpaqueId<'WorkOrderId'>('wrong') }, { workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('wrong') }, { workflowRunId: asOpaqueId<'WorkflowRunId'>('wrong') }]) {
      const result = await adapter.saveDynamicForm({ definitionId, workOrderId, workflowNodeId, workflowRunId, ...mismatch, purpose: 'appointment', formDataId: dataId, appointmentReplacement: form.appointmentReplacement, values: form.values, mutation: { beforeFormDispatch, afterFormSaved: vi.fn() } })
      expect(result.state).toBe('failed_terminal')
    }
    expect(execute).not.toHaveBeenCalled()
    expect(beforeFormDispatch).not.toHaveBeenCalled()
  })
})
