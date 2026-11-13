/** Fixed R1 work-order checkIDNumber syntax, not identity verification.
 * Preserve its 15/18-character, case, calendar and checksum limitations.
 * Never trim/coerce the submitted string or add stronger national-ID rules. */
export function isR1IdNumber(value: unknown): value is string {
  return typeof value === 'string'
    && /^(^[1-9]\d{7}((0\d)|(1[0-2]))(([0|1|2]\d)|3[0-1])\d{3}$)|(^[1-9]\d{5}[1-9]\d{3}((0\d)|(1[0-2]))(([0|1|2]\d)|3[0-1])((\d{4})|\d{3}[Xx])$)$/.test(value)
}
