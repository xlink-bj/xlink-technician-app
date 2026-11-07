/** Appointment providers emit string choices. Missing values retain their
 * existing required-field handling; non-string historical values require an
 * explicit reselection, never coercion into a different condition branch. */
export function hasNonStringAppointmentNeed(value: unknown): boolean {
  return value !== undefined && value !== null && typeof value !== 'string'
}

export const appointmentNeedReselectionMessage = '上门选项数据格式待确认，请重新选择上门选项；不可编辑时请联系管理员核对。'
