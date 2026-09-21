import type { FormFieldRead, FormPurpose } from '@shared/ports'

import { surveyMediaDescriptorFor } from './survey-media'

export interface MediaPresentationField {
  readonly presentation?: {
    readonly max?: number
  }
}

/**
 * Return only a verified media maximum. In particular, zero is a real
 * contract value and must not be collapsed into "not provided".
 */
export function verifiedMediaMaxFor(field: MediaPresentationField): number | undefined {
  const max = field.presentation?.max
  return typeof max === 'number' && Number.isFinite(max) && max >= 0 ? max : undefined
}

const photoMediaKinds = new Set(['survey_photo', 'infrared_photo', 'mold_photo'])

/**
 * Picker copy is presentation policy. Survey photo semantics come from the
 * verified descriptor rather than the raw ExtField type, because R1 photo
 * rows are commonly typed as `file`.
 */
export function mediaPickerLabelFor(
  purpose: FormPurpose | undefined,
  field: Pick<FormFieldRead, 'valueKey' | 'type'>,
): '选择图片' | '选择文件' {
  const descriptor = surveyMediaDescriptorFor(purpose, field)
  if (descriptor && photoMediaKinds.has(descriptor.kind)) return '选择图片'
  return field.type === 'image' ? '选择图片' : '选择文件'
}
