import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  actionFormSchemaFor,
  ACTION_FORM_SURFACE,
} from '@features/work-orders/action-form-schema'
import {
  appointmentRuntimeFieldsFor,
  normalizeAppointmentForm,
} from '@features/work-orders/appointment-form-runtime'
import {
  dynamicActionFieldsFor,
  normalizeDynamicForm,
} from '@features/work-orders/dynamic-form-action'
import {
  formDataUpsertCommand,
  workflowAcceptCommand,
  workflowCompleteCommand,
} from '@adapters/api/action-command-wires'
import type { AppointmentFormRead, DynamicFormRead, FormFieldRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const need: FormFieldRead = {
  fieldId: 'need', valueKey: 'need', label: '上门', type: 'radio',
  required: true, readOnly: false,
  options: [{ value: '1', label: '需要' }, { value: '0', label: '延后' }],
}
const conditional: FormFieldRead = {
  fieldId: 'comment', valueKey: 'comment', label: '上门备注', type: 'text',
  required: true, readOnly: false,
  visibility: { kind: 'equals', path: 'need', value: '1' },
  showList: [4],
}

function appointment(values: AppointmentFormRead['values']): AppointmentFormRead {
  return { fields: [need, conditional], values }
}
function dynamic(values: DynamicFormRead['values']): DynamicFormRead {
  return { fields: [need, conditional], values }
}

describe('EQ08 one Form Runtime schema projection and one Adapter command-wire owner', () => {
  it('carries all verified R1 field metadata without changing identity or defaulting unsupported options', () => {
    const field: FormFieldRead = {
      ...conditional, order: 2, fixed: true, operationType: 'view',
      valueOption: 'REMOTE_CODE', unsupportedReason: 'not verified',
      multiple: true, presentation: { control: 'label' },
    } as FormFieldRead
    const schema = actionFormSchemaFor(field)
    expect(ACTION_FORM_SURFACE).toBe('mobile_detail')
    expect(schema).toMatchObject({
      fieldId: 'comment', valueKey: 'comment', type: 'text',
      required: true, readOnly: false, order: 2,
      showList: [4], multiple: true, valueOption: 'REMOTE_CODE',
      visibility: conditional.visibility,
      unsupportedReason: 'not verified',
    })
    expect(schema.inlineOptions).toBeUndefined()
    expect(actionFormSchemaFor(field, { unsupportedReason: 'verified feature blocker' }).unsupportedReason)
      .toBe('verified feature blocker')
    expect(field.unsupportedReason).toBe('not verified')
  })

  it('aligns Appointment and generic Dynamic action surface on visible conditionals', () => {
    const values = { need: '1', comment: '请提前联系' }
    expect(appointmentRuntimeFieldsFor(appointment(values)).map(x => x.valueKey)).toEqual(['need', 'comment'])
    expect(dynamicActionFieldsFor(dynamic(values)).filter(x => x.runtime.visible).map(x => x.valueKey)).toEqual(['need', 'comment'])
    expect(normalizeAppointmentForm(appointment(values))).toMatchObject({ state: 'succeeded', data: values })
    expect(normalizeDynamicForm(dynamic(values))).toMatchObject({ state: 'succeeded', data: values })
  })

  it('keeps conditionally hidden values locally but excludes them from BOTH submissions', () => {
    const values = { need: '0', comment: '旧草稿私有值' }
    expect(normalizeAppointmentForm(appointment(values))).toEqual({ state: 'succeeded', data: { need: '0' } })
    expect(normalizeDynamicForm(dynamic(values))).toEqual({ state: 'succeeded', data: { need: '0' } })
    expect(appointment(values).values.comment).toBe('旧草稿私有值')
  })

  it('fails closed on unsupported visible field for both specialized and generic runtimes', () => {
    const unresolved = { ...conditional, unsupportedReason: 'provider not verified' }
    const a = { fields: [need, unresolved], values: { need: '1' } }
    expect(normalizeAppointmentForm(a).error?.category).toBe('unsupported_capability')
    expect(normalizeDynamicForm(a).error?.category).toBe('unsupported_capability')
    expect(normalizeAppointmentForm({ ...a, values: { need: '0' } }).state).toBe('succeeded')
    expect(normalizeDynamicForm({ ...a, values: { need: '0' } }).state).toBe('succeeded')
  })

  it('constructs saveOnly exactly once without implicit Workflow Complete or null leakage', () => {
    const input = {
      workOrderId: asOpaqueId<'WorkOrderId'>('eq08-synthetic-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('eq08-node'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('eq08-workflow'),
      definitionId: asOpaqueId<'FormDefinitionId'>('eq08-form'),
      formDataId: asOpaqueId<'FormDataId'>('eq08-previous-form'),
      values: { need: '1', note: null, comment: '现场确认' },
    }
    const copy = JSON.stringify(input)
    const command = formDataUpsertCommand(input)
    expect(command).toMatchObject({
      method: 'POST', path: 'biz/extForm/upsert/eq08-form',
    })
    const wire = JSON.parse((command.body as { dataStr: string }).dataStr)
    expect(wire).toMatchObject({
      need: '1', comment: '现场确认',
      sid: input.workOrderId, nodeId: input.workflowNodeId,
      workflowId: input.workflowRunId, _id: input.formDataId, smodule: 'serviceAppointment', state: 1,
    })
    expect(wire).not.toHaveProperty('note')
    expect(JSON.stringify(input)).toBe(copy)
    expect(command.path).not.toBe('workflow/process')
  })

  it('keeps deferred appointment transport marker internal and never reinterprets it as authorization', () => {
    const command = formDataUpsertCommand({
      workOrderId: asOpaqueId<'WorkOrderId'>('eq08-synthetic-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('eq08-node'),
      definitionId: asOpaqueId<'FormDefinitionId'>('eq08-form'),
      values: { need: '0' },
    }, 'deferred_appointment_datetime_encoding_unknown')
    expect(command.safety).toBe('deferred_appointment_datetime_encoding_unknown')
    expect((command.body as { dataStr: string }).dataStr).not.toContain('safety')
  })

  it('centralizes both R1 Workflow Process variants, never treating FormData upsert as completion', () => {
    const base = {
      workOrderId: asOpaqueId<'WorkOrderId'>('eq08-synthetic-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('eq08-node'),
    }
    expect(workflowAcceptCommand(base)).toMatchObject({
      method: 'POST', path: 'workflow/process',
      body: { sid: base.workOrderId, workflowNodeId: base.workflowNodeId, smodule: 'serviceAppointment' },
    })
    expect(workflowCompleteCommand({
      ...base,
      definitionId: asOpaqueId<'FormDefinitionId'>('eq08-form'),
      formDataId: asOpaqueId<'FormDataId'>('eq08-data'),
    })).toMatchObject({
      method: 'POST', path: 'workflow/process',
      body: { sid: base.workOrderId, workflowNodeId: base.workflowNodeId,
        nodeFormDefId: 'eq08-form', nodeFormDataId: 'eq08-data', smodule: 'serviceAppointment' },
    })
    expect(workflowAcceptCommand(base).body).not.toHaveProperty('nodeFormDataId')
  })

  it('enforces architecture ownership: UI/Workspace cannot encode R1 business transport', () => {
    const command = readFileSync(new URL('../../src/adapters/api/technician-api-commands.ts', import.meta.url), 'utf8')
    const wires = readFileSync(new URL('../../src/adapters/api/action-command-wires.ts', import.meta.url), 'utf8')
    const workspace = readFileSync(new URL('../../src/features/work-orders/action-workspace.ts', import.meta.url), 'utf8')
    const appointmentRuntime = readFileSync(new URL('../../src/features/work-orders/appointment-form-runtime.ts', import.meta.url), 'utf8')
    const dynamicRuntime = readFileSync(new URL('../../src/features/work-orders/dynamic-form-action.ts', import.meta.url), 'utf8')
    expect(command).toContain('formDataUpsertCommand(input, safety)')
    expect(command).toContain('workflowCompleteCommand(input)')
    expect(command).not.toContain("path: 'workflow/process'")
    expect(command).not.toContain('path: `biz/extForm/upsert/')
    expect(wires).toContain("path: 'workflow/process'")
    expect(wires).toContain('biz/extForm/upsert/')
    expect(workspace).not.toMatch(/path:\\s*['"]workflow\\/process/)
    expect(workspace).not.toContain('biz/extForm/upsert/')
    expect(appointmentRuntime).toContain('actionFormSchemaFor(field)')
    expect(dynamicRuntime).toContain('actionFormSchemaFor(field,')
  })
})
