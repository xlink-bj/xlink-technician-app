/**
 * R1 fixed source: inspectionAppointment.vue datetimeConfirm/formattTime.
 * The wire is local wall time "YYYY-MM-DD HH:mm:ss", with no Z/offset.
 * Never construct a Date or convert through UTC: doing so can shift a
 * technician's appointment or field record when the device zone changes.
 * Partial picker selections stay UI-local until both parts are present.
 */
export function dateTimeParts(value: string): { readonly date: string; readonly time: string } {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}$/.exec(value)
  return { date: m?.[1] ?? '', time: m?.[2] ?? '' }
}
export function dateTimeWire(date: string, time: string, previous = ''): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return undefined
  // A date-only edit must preserve seconds on an authoritative readback.
  // A changed minute comes from a minute-precision native picker => :00.
  const last = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):(\d{2})$/.exec(previous)
  const seconds = last?.[2] === time ? last[3] : '00'
  return date + ' ' + time + ':' + seconds
}
