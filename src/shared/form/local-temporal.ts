/**
 * Local wall-clock value validation for R1 ExtField date/time/datetime.
 * Neither UI nor the Dynamic Form Runtime may round-trip through Date.UTC,
 * Date.parse, ISO conversion or the device's timezone. R1 datetimeConfirm
 * stores literal YYYY-MM-DD HH:mm:ss. Reject impossible dates, not just
 * malformed strings (e.g. February 30th).
 */
export function validLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (days[month - 1] ?? 0)
}

export function validLocalTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59
}

export function validLocalDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):(\d{2})$/.exec(value)
  return match !== null && validLocalDate(match[1]!) && validLocalTime(match[2]!)
    && Number(match[3]) <= 59
}
