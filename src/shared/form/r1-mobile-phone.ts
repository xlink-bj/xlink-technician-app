/** Pure R1 mobile syntax only. Callers retain their own required/trim policy;
 * this must not dispatch login/SMS or infer a business authorization. */
export function isR1MobilePhone(value: unknown): value is string {
  return typeof value === 'string' && /^1[3-9]\d{9}$/.test(value)
}
