import { describe, expect, it } from 'vitest'
import { appointmentDisplayFor, parseAppointmentDateTime } from '@features/work-orders/appointment-time'
import { normalizeAppointmentForm } from '@features/work-orders/appointment-form-runtime'
import { formDataUpsertCommand } from '@adapters/api/action-command-wires'
import { validLocalDateTime } from '@shared/form/local-temporal'
import { asOpaqueId } from '@shared/types'
import type { AppointmentFormRead } from '@shared/ports'

const definitionId = asOpaqueId<'FormDefinitionId'>('synthetic-appointment-recovery-definition')
function form(datetime: string, need = '1'): AppointmentFormRead {
  return { definitionId, values: { need, datetime }, fields: [
    { fieldId: 'need', valueKey: 'need', label: '是否上门', type: 'radio', required: true, readOnly: false,
      options: [{ value: '1', label: '需要上门' }, { value: '0', label: '暂不上门' }] },
    { fieldId: 'datetime', valueKey: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false,
      visibility: { kind: 'equals', path: 'need', value: '1' } },
  ] }
}

describe('Appointment recovered local-clock display and literal wire boundaries', () => {
  it.each(['2026-11-09 09:00:00', '2026-11-09 09:17:59', '2028-02-29 23:59:59'])(
    'shows a runtime-valid R1 second-precision value without changing its clock: %s', datetime => {
      expect(validLocalDateTime(datetime)).toBe(true)
      expect(appointmentDisplayFor(datetime)).toMatchObject({
        date: datetime.slice(0, 10), time: datetime.slice(11), timeLabel: datetime.slice(11),
      })
      for (const need of ['1', '0']) {
        const current = form(datetime, need)
        const normalized = normalizeAppointmentForm(current)
        expect(normalized).toMatchObject({ state: 'succeeded', data: { need, datetime } })
        const wire = formDataUpsertCommand({ definitionId, purpose: 'appointment',
          workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work'),
          workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'),
          workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-run'), values: normalized.data! })
        expect(JSON.parse(String(wire.body?.dataStr)).datetime).toBe(datetime)
        expect(current.values.datetime).toBe(datetime)
      }
    },
  )
  it.each(['2026-11-09 24:00', '2026-11-09 09:60', '2026-11-09 99:99',
    '2026-11-09 09:00:60', '2026-02-29 09:00', '2026-11-09T09:00:00Z',
    '2026-11-09 09:00+08:00', '2026-11-09\t09:00'])(
    'does not present a rejected runtime clock as a selected appointment: %s', value => {
      expect(validLocalDateTime(value)).toBe(false)
      expect(parseAppointmentDateTime(value)).toBeUndefined()
    },
  )
  it('retains minute precision and remains timezone-independent at the literal boundary', () => {
    expect(appointmentDisplayFor('2026-11-09 09:00')).toMatchObject({
      date: '2026-11-09', time: '09:00', timeLabel: '09:00',
    })
    expect(appointmentDisplayFor(' 2026-11-09 09:00:00 ')).toMatchObject({
      date: '2026-11-09', time: '09:00:00', timeLabel: '09:00:00',
    })
  })
})
