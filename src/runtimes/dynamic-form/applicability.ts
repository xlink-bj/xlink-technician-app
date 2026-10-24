import type { FormFieldSchema, FormRuntimeSurface } from './types'

/** R1 ExtField.showList: 4 means the mobile detail surface. */
const MOBILE_DETAIL_SHOW_LIST = '4'

export function isFieldApplicable(
  field: Pick<FormFieldSchema, 'showList' | 'mobileDetailHidden'>,
  surface?: FormRuntimeSurface,
): boolean {
  if (surface === 'mobile_detail' && field.mobileDetailHidden) return false
  if (surface !== 'mobile_detail' || field.showList === undefined) return true
  return field.showList.map(String).includes(MOBILE_DETAIL_SHOW_LIST)
}
