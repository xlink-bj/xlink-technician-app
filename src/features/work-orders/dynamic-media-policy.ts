import type { FormFieldRead, FormPurpose } from '@shared/ports'
import type { DynamicMediaFieldPolicy } from '@runtimes/media/field-policy'
import { surveyMediaDescriptorFor } from './survey-media'
import { verifiedMediaMaxFor } from './media-presentation'

/**
 * Form-family Adapter supplies optional verified exceptions, while every
 * Dynamic Form uses the same Shared Media Runtime. Missing policy is not a
 * reason to route ordinary file/image fields through Survey logic.
 *
 * ExtField presentation.max is a field-level verified cap. If a domain
 * descriptor also limits the same field, the stricter cap wins; neither
 * value is derived from form purpose or the multiple flag.
 */
export function dynamicMediaPolicyFor(
  purpose: FormPurpose | undefined,
  field: Pick<FormFieldRead, 'valueKey' | 'type' | 'presentation'>,
): DynamicMediaFieldPolicy {
  if (field.type !== 'file' && field.type !== 'image') return {}
  const domain = surveyMediaDescriptorFor(purpose, field)
  const fieldLimit = verifiedMediaMaxFor(field)
  const domainLimit = domain?.maxCount
  const maxCount = fieldLimit === undefined ? domainLimit
    : domainLimit === undefined ? fieldLimit : Math.min(fieldLimit, domainLimit)
  return {
    ...(domain?.selectionMode ? { selectionMode: domain.selectionMode } : {}),
    ...(domain?.persistedShape ? { persistedShape: domain.persistedShape } : {}),
    ...(domain?.blocker ? { blocker: domain.blocker } : {}),
    ...(maxCount !== undefined ? { maxCount } : {}),
  }
}
