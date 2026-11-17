import { describe, expect, it } from 'vitest'
import { normalizeFieldValue } from '@runtimes/dynamic-form'
import { dateTimeParts, dateTimeWire } from '@shared/ui/date-time-wire'
import { validLocalDate, validLocalTime, validLocalDateTime } from '@shared/form/local-temporal'
import { mockDynamicScalarQaFormDefinitionResponse, mockSurveyFormDefinitionResponse } from '@adapters/api/mock/survey-contract'

describe('R1 calendar correctness across UI and Dynamic Form Runtime', () => {
  it('accepts leap-year dates and rejects impossible calendar days', () => {
    for (const date of ['2024-02-29', '2026-11-03', '2000-02-29', '2026-12-31']) {
      expect(validLocalDate(date)).toBe(true)
      expect(normalizeFieldValue('date', date)).toEqual({ ok: true, value: date })
    }
    for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01',
      '2026-00-01', '2026-01-00', '0000-01-01', '2026/11/03', '2026-11-03Z']) {
      expect(validLocalDate(date)).toBe(false)
      expect(normalizeFieldValue('date', date)).toMatchObject({ ok: false, reason: 'invalid_value' })
    }
  })

  it('rejects invalid clock ranges and UTC/ISO conversion on all form surfaces', () => {
    for (const time of ['00:00', '14:30', '23:59']) {
      expect(validLocalTime(time)).toBe(true)
      expect(normalizeFieldValue('time', time)).toEqual({ ok: true, value: time })
    }
    for (const time of ['24:00', '12:60', '1:00', '09:30:00', '09:30Z', '']) {
      expect(validLocalTime(time)).toBe(false)
      expect(normalizeFieldValue('time', time)).toMatchObject({ ok: false, reason: 'invalid_value' })
    }
    expect(normalizeFieldValue('datetime', '2024-02-29 23:59:59')).toEqual({
      ok: true, value: '2024-02-29 23:59:59',
    })
    // R1 Appointment data is minute-precision. Do not break its previously
    // verified FormData/draft contract while supporting Survey seconds.
    expect(normalizeFieldValue('datetime', '2026-04-20 11:00')).toEqual({
      ok: true, value: '2026-04-20 11:00',
    })
    expect(dateTimeParts('2026-04-20 11:00')).toEqual({ date: '2026-04-20', time: '11:00' })
    for (const value of ['2026-02-30 14:30:00', '2026-11-03 24:00:00',
      '2026-11-03 14:30:60', '2026-11-03T14:30:00Z', '2026-11-03 14:30Z']) {
      expect(validLocalDateTime(value)).toBe(false)
      expect(normalizeFieldValue('datetime', value))
        .toMatchObject({ ok: false, reason: 'invalid_value' })
      expect(dateTimeParts(value)).toEqual({ date: '', time: '' })
    }
    expect(normalizeFieldValue('datetime', 1_783_175_400_000))
      .toMatchObject({ ok: false, reason: 'invalid_value' })
  })

  it('UI and Runtime use one canonical validation rule while retaining readback seconds', () => {
    expect(dateTimeWire('2024-02-29', '23:59')).toBe('2024-02-29 23:59:00')
    expect(dateTimeWire('2026-04-21', '11:00', '2026-04-20 11:00')).toBe('2026-04-21 11:00')
    expect(dateTimeWire('2026-02-29', '14:30')).toBeUndefined()
    expect(dateTimeWire('2026-11-03', '24:00')).toBeUndefined()
    expect(dateTimeWire('2026-11-04', '14:30', '2026-11-03 14:30:24')).toBe('2026-11-04 14:30:24')
    expect(dateTimeWire('2026-11-03', '16:00', '2026-11-03 14:30:24')).toBe('2026-11-03 16:00:00')
    expect(dateTimeWire('2026-11-03', '14:30', '2026-02-30 14:30:24')).toBe('2026-11-03 14:30:00')
  })

  it('DEV scalar QA FormDef is isolated from the 61-row historical Survey baseline', () => {
    expect(mockSurveyFormDefinitionResponse.data.length).toBe(61)
    expect(mockDynamicScalarQaFormDefinitionResponse.data.map(f => f.type)).toEqual([
      'switch', 'rate', 'date', 'time', 'datetime', 'number', 'digit', 'phone', 'text',
    ])
    expect(mockDynamicScalarQaFormDefinitionResponse.data.every(f => f.colName === 'survey')).toBe(true)
    expect(mockDynamicScalarQaFormDefinitionResponse.data.at(-1)).toMatchObject({
      showField: 'qaConfirmed', showValue: '1',
    })
  })
})
