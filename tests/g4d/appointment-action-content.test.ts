import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

import {
  appointmentDisplayFor,
  appointmentTimeOptions,
  dateLabelFor,
  dateShortcutsFor,
} from '@features/work-orders/appointment-time'
import {
  appointmentDatetimeApplicableFor,
  appointmentFieldRolesFor,
  appointmentVisitIntentFor,
  normalizeAppointmentFieldValue,
  normalizeAppointmentForm,
} from '@features/work-orders/appointment-form-runtime'
import type { AppointmentFormRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

describe('Appointment Action Content presentation boundary', () => {
  it('formats backend datetime values without adding availability semantics', () => {
    expect(appointmentDisplayFor('2026-04-15 14:00')).toEqual({
      date: '2026-04-15',
      dateLabel: '4月15日 周三',
      time: '14:00',
      timeLabel: '14:00',
    })
    expect(appointmentDisplayFor('not-a-datetime')).toBeUndefined()
    expect(appointmentDisplayFor('2026-04-15 14:00')?.time).toBe('14:00')
    expect(appointmentDisplayFor('2026-04-15 14:00')?.timeLabel).not.toContain('–')
    expect(appointmentDisplayFor('2026-04-15 14:00–16:00')).toBeUndefined()
    expect(appointmentTimeOptions.map((option) => option.value)).toEqual([
      '09:00',
      '11:00',
      '14:00',
      '16:00',
    ])
  })

  it('keeps date shortcuts deterministic and local to the presentation layer', () => {
    expect(dateLabelFor('2026-04-15')).toBe('4月15日 周三')
    expect(dateShortcutsFor(new Date(2026, 3, 13)).map((item) => item.label)).toEqual([
      '今天',
      '明天',
      '周三',
      '周四',
    ])
  })

  it('assigns Appointment roles by semantic field keys rather than shape or order', () => {
    const form: AppointmentFormRead = {
      definitionId: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
      fields: [
        {
          key: 'other-choice',
          label: '其他选项',
          type: 'radio',
          required: false,
          readOnly: false,
          options: [{ value: 'yes', label: '是' }],
        },
        { key: 'other-note', label: '其他说明', type: 'textarea', required: false, readOnly: false },
        { key: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false },
        { key: 'note', label: '备注', type: 'textarea', required: true, readOnly: false },
        {
          key: 'need',
          label: '是否需要上门',
          type: 'radio',
          required: true,
          readOnly: false,
          options: [{ value: '1', label: '需要上门' }],
        },
      ],
      values: {},
    }

    const roles = appointmentFieldRolesFor(form)
    expect(roles.need?.key).toBe('need')
    expect(roles.datetime?.key).toBe('datetime')
    expect(roles.note?.key).toBe('note')
    expect(roles.extras.map((field) => field.key)).toEqual(['other-choice', 'other-note'])

    const missingKnownRole = appointmentFieldRolesFor({
      ...form,
      fields: form.fields.filter((field) => field.key !== 'need' && field.key !== 'note'),
    })
    expect(missingKnownRole.need).toBeUndefined()
    expect(missingKnownRole.note).toBeUndefined()
    expect(missingKnownRole.extras.map((field) => field.key)).toEqual(['other-choice', 'other-note'])

    const note = form.fields.find((field) => field.key === 'note')!
    const longValue = '说明'.repeat(250)
    expect(normalizeAppointmentFieldValue(note, longValue, {}).data).toBe(longValue)
  })

  it('projects the visit branch from verified option values, never from labels', () => {
    const form: AppointmentFormRead = {
      definitionId: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
      fields: [
        {
          key: 'need',
          label: '任意展示文案',
          type: 'radio',
          required: true,
          readOnly: false,
          options: [
            { value: '1', label: '任意文案 A' },
            { value: '0', label: '任意文案 B' },
          ],
        },
        { key: 'datetime', label: '任意时间文案', type: 'datetime', required: true, readOnly: false },
      ],
      values: { need: '1', datetime: '2026-04-20 10:00' },
    }

    const deferred = { ...form, values: { ...form.values, need: '0' } }
    expect(appointmentVisitIntentFor(form)).toBe('visit_required')
    expect(appointmentDatetimeApplicableFor(form)).toBe(true)
    expect(appointmentVisitIntentFor(deferred)).toBe('visit_deferred')
    expect(appointmentDatetimeApplicableFor(deferred)).toBe(false)
    expect(appointmentVisitIntentFor({ ...form, values: { ...form.values, need: 'unexpected' } })).toBe('unknown')
  })

  it('keeps deferred datetime in editing state but excludes it from effective submission', () => {
    const form: AppointmentFormRead = {
      definitionId: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
      fields: [
        {
          key: 'need',
          label: '是否需要上门',
          type: 'radio',
          required: true,
          readOnly: false,
          options: [{ value: '1', label: '需要上门' }, { value: '0', label: '暂不上门' }],
        },
        { key: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false },
        { key: 'note', label: '备注', type: 'textarea', required: false, readOnly: false },
      ],
      values: { need: '0', datetime: '2026-04-20 10:00', note: '保留备注' },
    }

    expect(normalizeAppointmentForm(form)).toEqual({
      state: 'succeeded',
      data: { need: '0', note: '保留备注' },
    })
  })

  it('uses native page navigation and keeps confirmation/success copy bounded', async () => {
    const pages = await readFile(new URL('../../src/pages.json', import.meta.url), 'utf8')
    const action = await readFile(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8')
    const time = await readFile(new URL('../../src/pages/work-orders/action-time.vue', import.meta.url), 'utf8')
    const confirmation = await readFile(new URL('../../src/pages/work-orders/action-confirmation.vue', import.meta.url), 'utf8')

    expect(pages).toContain('"navigationBarTitleText": "预约上门"')
    expect(pages).toContain('"navigationBarTitleText": "选择时间"')
    expect(pages).toContain('"navigationBarTitleText": "确认预约"')
    expect(action).toContain('继续确认')
    expect(action).toContain('openTimeSelection')
    expect(time).toContain('确认选择')
    expect(time).toContain('预约时间')
    expect(time).not.toContain('可预约')
    expect(time).not.toContain('14:00–16:00')
    expect(time).toMatch(/<picker[^>]+mode="date"/)
    expect(action).toContain('appointmentDatetimeApplicable')
    expect(time).toContain('appointmentDatetimeApplicable')
    expect(confirmation).toContain('workspace.appointmentDatetimeApplicable')
    expect(action).not.toContain('maxlength="100"')
    expect(action).toContain('maxlength="-1"')
    expect(action).toContain('runtime.required')
    expect(confirmation).toContain('预约成功')
    expect(confirmation).toContain('isVisitDeferred')
    expect(confirmation).toContain('visitIntentLabel')
    expect(confirmation).toContain('已确认暂不上门')
    expect(confirmation).toContain('操作已完成')
    expect(confirmation).toContain('查看工单详情')
    expect(confirmation).toContain('返回工单列表')
    expect(confirmation).not.toContain('下一步任务')
    expect(confirmation).not.toContain('服务方式')
    const pagesSource = [action, time, confirmation].join('\n')
    expect(pagesSource).not.toContain('biz/extForm')
    expect(pagesSource).not.toContain("label === '暂不上门'")
  })

  it('collapses the conditional datetime field without destroying its layout region', async () => {
    const action = await readFile(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8')

    expect(action).toContain('v-if="workspace.appointmentTimeField"')
    expect(action).toContain('class="action-content-field-shell"')
    expect(action).toContain("'action-content-field-shell--collapsed': !workspace.appointmentDatetimeApplicable")
    expect(action).toContain(":aria-hidden=\"workspace.appointmentDatetimeApplicable ? 'false' : 'true'\"")
    expect(action).not.toContain('v-if="workspace.appointmentTimeField && workspace.appointmentDatetimeApplicable"')
    expect(action).toContain('max-height: 360rpx')
    expect(action).toContain('overflow: hidden')
    expect(action).toContain('pointer-events: none')
    expect(action).toContain('max-height var(--app-motion-collapse-duration) var(--app-motion-collapse-easing)')
    expect(action).toContain('opacity var(--app-motion-collapse-duration) var(--app-motion-collapse-easing)')
  })
})
