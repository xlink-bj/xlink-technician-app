import type { FormFieldRead, FormPurpose } from '@shared/ports'
import { mediaCapacityError } from '@runtimes/media/field-policy'

export type SurveyMediaKind = 'survey_drawing' | 'survey_photo' | 'infrared_photo' | 'mold_photo'
export type SurveyMediaSelectionMode = 'special_tool' | 'camera_or_album' | 'album_only'

export interface SurveyMediaFieldDescriptor {
  readonly kind: SurveyMediaKind
  readonly selectionMode: SurveyMediaSelectionMode
  readonly maxCount?: number
  readonly blocker?: string
  /** R1/Backend persist a list of media objects, even when ExtField.multiple=false. */
  readonly persistedShape: 'media_object_list'
}

export type SurveyMediaPostUploadPolicy = 'none' | 'remote_location_watermark'

const ordinarySurveyPhotoKeys = new Set([
  ...Array.from({ length: 20 }, (_, index) => `images${index + 1}`),
])

/**
 * Single Survey media registry. Field-specific exceptions belong here so the
 * generic Dynamic Form Runtime does not accumulate Survey key conditionals.
 */
const SURVEY_MEDIA_REGISTRY: Record<string, SurveyMediaFieldDescriptor> = {
  surveyDrawing: {
    kind: 'survey_drawing',
    selectionMode: 'special_tool',
    maxCount: 1,
    blocker: 'Survey 测绘工具尚未接入，不能将普通照片上传冒充测绘图',
    persistedShape: 'media_object_list',
  },
  infraredImageList: {
    kind: 'infrared_photo',
    selectionMode: 'album_only',
    maxCount: 4,
    persistedShape: 'media_object_list',
  },
  beforeMoldRemoval: {
    kind: 'mold_photo',
    selectionMode: 'camera_or_album',
    persistedShape: 'media_object_list',
  },
  afterMoldRemoval: {
    kind: 'mold_photo',
    selectionMode: 'camera_or_album',
    persistedShape: 'media_object_list',
  },
}

for (const key of ordinarySurveyPhotoKeys) {
  SURVEY_MEDIA_REGISTRY[key] = {
    kind: 'survey_photo',
    selectionMode: 'camera_or_album',
    persistedShape: 'media_object_list',
  }
}

export function surveyMediaDescriptorFor(
  purpose: FormPurpose | undefined,
  field: Pick<FormFieldRead, 'valueKey' | 'type'>,
): SurveyMediaFieldDescriptor | undefined {
  if (purpose !== 'survey' || (field.type !== 'file' && field.type !== 'image')) return undefined
  return SURVEY_MEDIA_REGISTRY[field.valueKey]
}

export function surveyMediaRegistryKeys(): readonly string[] {
  return Object.keys(SURVEY_MEDIA_REGISTRY)
}

/** Camera watermarking is evidenced only on the R1 camera branch. Album uploads stay unwatermarked. */
export function surveyMediaPostUploadPolicyFor(
  purpose: FormPurpose | undefined,
  field: Pick<FormFieldRead, 'valueKey' | 'type'>,
  source: 'camera' | 'library' | 'file',
): SurveyMediaPostUploadPolicy {
  const descriptor = surveyMediaDescriptorFor(purpose, field)
  if (!descriptor || source !== 'camera') return 'none'
  return descriptor.kind === 'survey_photo' || descriptor.kind === 'mold_photo'
    ? 'remote_location_watermark'
    : 'none'
}

/**
 * Verified R1 media selection limits apply to the ENTIRE field, not just
 * the number of files chosen in one picker invocation. R1 file fields
 * persist object lists even when ExtField.multiple=false.
 *
 * No inferred limit is applied to ordinary Survey photos: the historical
 * source reports UNKNOWN limits there. Only explicit field descriptors
 * (e.g. infraredImageList) participate in this safety check.
 */
/** Compatibility for existing R1 tests/callers. The logic is shared;
 * Survey only contributes the verified descriptor. Do not add queue,
 * persistence or form-field normalization logic at this boundary. */
export function surveyMediaCapacityError(
  descriptor: SurveyMediaFieldDescriptor | undefined,
  persisted: unknown,
  selectedCount: number,
): string | undefined {
  return mediaCapacityError(descriptor, persisted, selectedCount)
}
