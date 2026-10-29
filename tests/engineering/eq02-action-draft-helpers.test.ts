import { describe, expect, it } from 'vitest'
import { actionDraftIdentityFor } from '@runtimes/action'
import { asOpaqueId } from '@shared/types'
import type { AppointmentFormRead, DynamicFormRead } from '@shared/ports'
import {
  appointmentValue,
  draftRecordFor,
  dynamicDraftRecordFor,
} from '@features/work-orders/action-workspace-draft-utils'

const identity = actionDraftIdentityFor({
  userId: asOpaqueId<'UserId'>('eq02-user'),
  workOrderId: asOpaqueId<'WorkOrderId'>('eq02-work-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('eq02-node'),
  actionIntent: 'set_appointment',
  contentKind: 'dynamic_form',
})
const form: AppointmentFormRead = {
  fields: [{
    fieldId: 'note', valueKey: 'note',
    label: '备注', type: 'textarea',
    required: false, readOnly: false,
  }],
  values: {},
}
const record = {
  version: 1, identity, status: 'unfinished',
  updatedAt: '2026-10-18T10:00:00.000Z',
  values: { note: ' first value ' },
}

describe('EQ02 extracted Action Workspace pure draft/identity guard', () => {
  it('normalizes only supported primitive appointment values', () => {
    expect(appointmentValue(null)).toBeNull()
    expect(appointmentValue(false)).toBe(false)
    expect(appointmentValue(2)).toBe(2)
    expect(appointmentValue('note')).toBe('note')
    expect(appointmentValue(['illegal'])).toBeUndefined()
    expect(appointmentValue({ value: 'not a field' })).toBeUndefined()
  })

  it('restores a valid appointment draft through the same normalized read path', () => {
    expect(draftRecordFor(record, identity, form)).toMatchObject({
      version: 1, status: 'unfinished',
      identity, values: { note: 'first value' },
    })
  })

  it('fails closed for a different WorkOrder, corrupt record and unexpected field', () => {
    const other = actionDraftIdentityFor({
      userId: asOpaqueId<'UserId'>('eq02-user'),
      workOrderId: asOpaqueId<'WorkOrderId'>('other-work-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('eq02-node'),
      actionIntent: 'set_appointment', contentKind: 'dynamic_form',
    })
    expect(draftRecordFor(record, other, form)).toBeNull()
    expect(draftRecordFor({ ...record, values: { unknown: 5 } }, identity, form)).toBeNull()
    expect(draftRecordFor({ ...record, status: 'completed' }, identity, form)).toBeNull()
    expect(draftRecordFor({ ...record, values: { note: ['unsupported'] } }, identity, form)).toBeNull()
  })

  it('rejects any persisted appointment change to a read-only backend field', () => {
    const readOnlyForm = {
      ...form,
      fields: form.fields.map(field => ({ ...field, readOnly: true })),
      values: { note: 'backend-value' },
    }
    expect(draftRecordFor(record, identity, readOnlyForm)).toBeNull()
    expect(draftRecordFor({ ...record, values: { note: 'backend-value' } }, identity, readOnlyForm))
      .toMatchObject({ values: {} })
  })

  it('preserves dynamic form identity/read-only validation without a store instance', () => {
    const dynamic: DynamicFormRead = {
      fields: [{
        fieldId: 'note', valueKey: 'note', label: '动态备注', type: 'text',
        required: false, readOnly: false,
      }],
      values: {},
    }
    expect(dynamicDraftRecordFor(record, identity, dynamic)).toMatchObject({
      values: { note: 'first value' },
    })
    expect(dynamicDraftRecordFor(record, identity, {
      ...dynamic, fields: dynamic.fields.map(field => ({ ...field, readOnly: true })),
      values: { note: 'backend-value' },
    })).toBeNull()
  })
})
