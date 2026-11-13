/** Literal defaults from R1 extForm: van-switch 1/0 and default five-star rate.
 * Raw-value checks run BEFORE the more permissive shared normalizer. */
export const isR1DefaultSwitchValue = (value: unknown): value is '1' | '0' => value === '1' || value === '0'
export const isR1DefaultRateValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 5

/** Raw metadata aliases already guarded by normal first-create. JSON
 * frontEndConfig is separately decoded/allowlisted by each source strategy. */
export const hasR1DefaultControlOverrides = (field: Readonly<Record<string, unknown>>): boolean =>
  ['count','allowHalf','half','step','activeValue','inactiveValue','max','min','options'].some(key=>Object.hasOwn(field,key))
