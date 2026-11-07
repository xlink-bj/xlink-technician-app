import type { AppointmentFormRead, FormFieldValue } from '@shared/ports'

type RecordIdentity = Pick<AppointmentFormRead, 'definitionId' | 'dataId'>

/** Metadata identity is adapter-validated, never recovered from editable values.
 * This projection is condition-only: do not persist it as draft or submission data.
 */
export function actionFormConditionValues(
  form: RecordIdentity & { readonly values: Readonly<Record<string, FormFieldValue>> },
): Readonly<Record<string, FormFieldValue>> {
  const values = actionFormEditableValues(form.values)
  const validOwnId = (key: keyof RecordIdentity): boolean =>
    Object.prototype.hasOwnProperty.call(form, key)
    && typeof form[key] === 'string'
    && form[key]!.trim().length > 0
    && form[key] === form[key]!.trim()
  if (validOwnId('definitionId') && validOwnId('dataId')) values._id = form.dataId!
  return Object.freeze(values)
}

/** Root record identity is not an editable business field, including in exts. */
export function actionFormEditableValues<T>(values: Readonly<Record<string, T>>): Record<string, T> {
  const result = { ...values }
  delete result._id
  return result
}
