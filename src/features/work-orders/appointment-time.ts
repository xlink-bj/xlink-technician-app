export interface AppointmentTimeOption {
  readonly key: string
  readonly value: string
  readonly label: string
}

export interface AppointmentDateShortcut {
  readonly key: string
  readonly label: string
  readonly date: string
}

export interface AppointmentDisplay {
  readonly date: string
  readonly dateLabel: string
  readonly time: string
  readonly timeLabel: string
}

/** Presentation shortcuts for one datetime value; they do not claim availability. */
export const appointmentTimeOptions: readonly AppointmentTimeOption[] = [
  { key: '09', value: '09:00', label: '09:00' },
  { key: '11', value: '11:00', label: '11:00' },
  { key: '14', value: '14:00', label: '14:00' },
  { key: '16', value: '16:00', label: '16:00' },
]

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function dateAtStart(value: Date): Date {
  const result = new Date(value.getTime())
  result.setHours(0, 0, 0, 0)
  return result
}

function dateFromInput(value: Date | string): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const result = new Date(year, month - 1, day)
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day
    ? result
    : undefined
}

export function dateStringFor(value: Date | string = new Date()): string {
  const date = dateFromInput(value) ?? dateAtStart(new Date())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateLabelFor(value: Date | string): string {
  const date = dateFromInput(value)
  if (!date) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}

export function dateShortcutsFor(now: Date = new Date()): readonly AppointmentDateShortcut[] {
  const base = dateAtStart(now)
  return [0, 1, 2, 3].map((offset, index) => {
    const date = new Date(base.getTime())
    date.setDate(base.getDate() + offset)
    return {
      key: index === 0 ? 'today' : index === 1 ? 'tomorrow' : `day-${offset}`,
      label: index === 0 ? '今天' : index === 1 ? '明天' : weekdays[date.getDay()],
      date: dateStringFor(date),
    }
  })
}

export function parseAppointmentDateTime(value: unknown): AppointmentDisplay | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(value.trim())
  if (!match || !dateFromInput(match[1])) return undefined
  const time = match[2]
  return {
    date: match[1],
    dateLabel: dateLabelFor(match[1]),
    time,
    timeLabel: time,
  }
}

export function appointmentDisplayFor(value: unknown): AppointmentDisplay | undefined {
  return parseAppointmentDateTime(value)
}
