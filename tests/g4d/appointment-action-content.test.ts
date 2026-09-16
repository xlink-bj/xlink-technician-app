import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

import {
  appointmentDisplayFor,
  appointmentTimeSlots,
  dateLabelFor,
  dateShortcutsFor,
} from '@features/work-orders/appointment-time'

describe('Appointment Action Content presentation boundary', () => {
  it('formats backend datetime values without adding availability semantics', () => {
    expect(appointmentDisplayFor('2026-04-15 14:00')).toEqual({
      date: '2026-04-15',
      dateLabel: '4月15日 周三',
      time: '14:00',
      timeLabel: '14:00–16:00',
    })
    expect(appointmentDisplayFor('not-a-datetime')).toBeUndefined()
    expect(appointmentTimeSlots.map((slot) => slot.label)).toEqual([
      '09:00–11:00',
      '11:00–13:00',
      '14:00–16:00',
      '16:00–18:00',
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
    expect(time).toMatch(/<picker[^>]+mode="date"/)
    expect(confirmation).toContain('预约成功')
    expect(confirmation).toContain('查看工单详情')
    expect(confirmation).toContain('返回工单列表')
    expect(confirmation).not.toContain('下一步任务')
    expect(confirmation).not.toContain('服务方式')
    expect([action, time, confirmation].join('\n')).not.toContain('biz/extForm')
  })
})
