export const MEDIA_KEYS = [
  'surveyDrawing',
  ...Array.from({ length: 20 }, (_, index) => `images${index + 1}`),
  'infraredImageList',
  'beforeMoldRemoval',
  'afterMoldRemoval',
]

const mediaKeySet = new Set(MEDIA_KEYS)

function effectiveCondition(field) {
  const config = field.frontEndConfig && typeof field.frontEndConfig === 'object'
    ? field.frontEndConfig
    : undefined
  const showField = field.showField ?? config?.showField
  const values = config?.showField
    ? [config.showValue]
    : [field.showValue, field.extsShowValue, config?.showValue]
  const showValue = values.find((value) => value !== undefined && value !== null && value !== '')
  return showField
    ? { showField, ...(showValue === undefined ? {} : { showValue }) }
    : undefined
}
function descriptorFor(field) {
  if (field.valueKey === 'surveyDrawing') {
    return {
      mediaKind: 'survey_drawing',
      selectionMode: 'SPECIAL_SURVEY_TOOL',
      onlineStatus: 'UNKNOWN_SPECIAL_TOOL',
      maxCount: 1,
      watermarkPolicy: 'UNKNOWN_SPECIAL_TOOL',
      locationPolicy: 'UNKNOWN_SPECIAL_TOOL',
    }
  }
  if (field.valueKey === 'infraredImageList') {
    return {
      mediaKind: 'infrared_photo',
      selectionMode: 'ALBUM_ONLY_UNVERIFIED_DEVICE_SEMANTICS',
      onlineStatus: 'PARTIAL_LIBRARY_UPLOAD',
      maxCount: 4,
      watermarkPolicy: 'UNKNOWN',
      locationPolicy: 'UNKNOWN',
    }
  }
  if (field.valueKey === 'beforeMoldRemoval' || field.valueKey === 'afterMoldRemoval') {
    return {
      mediaKind: 'mold_photo',
      selectionMode: 'CAMERA_OR_ALBUM_EVIDENCED',
      onlineStatus: 'PARTIAL_LIBRARY_UPLOAD',
      maxCount: 'UNKNOWN',
      watermarkPolicy: 'CAMERA_SERVER_WATERMARK_EVIDENCED_NOT_IMPLEMENTED',
      locationPolicy: 'REQUIRED_FOR_CAMERA_WATERMARK',
    }
  }
  return {
    mediaKind: 'survey_photo',
    selectionMode: 'CAMERA_OR_ALBUM_EVIDENCED',
    onlineStatus: 'PARTIAL_LIBRARY_UPLOAD',
    maxCount: 'UNKNOWN',
    watermarkPolicy: 'CAMERA_SERVER_WATERMARK_EVIDENCED_NOT_IMPLEMENTED',
    locationPolicy: 'REQUIRED_FOR_CAMERA_WATERMARK',
  }
}

export function buildSurveyMediaContract(contract) {
  const sourceRows = contract.fieldRows.filter((field) => mediaKeySet.has(field.valueKey))
  const rows = sourceRows.map((field) => ({
    fieldId: field.fieldId,
    valueKey: field.valueKey,
    label: field.label,
    backendType: field.type,
    required: field.required,
    mobileApplicable: field.showList.map(String).includes('4'),
    condition: effectiveCondition(field) ?? null,
    persistedShape: 'LIST_OF_MEDIA_OBJECTS_URL_NAME_EXTNAME',
    ...descriptorFor(field),
  }))

  return {
    schemaVersion: 1,
    environment: 'beta',
    lifecycleEvidence: 'historical_inactive',
    domain: 'survey',
    semanticPurpose: 'survey_media',
    semanticIdentity: 'media_rows_derived_only_from_verified_survey_extfields',
    sanitized: true,
    source: {
      contract: 'contracts/beta/survey/historical.json',
      fingerprint: contract.fingerprint,
      authority: 'R1 behavior plus Backend Survey typed persistence',
      noLiveWrite: true,
    },
    fieldRowCount: rows.length,
    rows,
    policies: {
      aggregateMaxCount: 'UNKNOWN',
      offlineSupport: 'NOT_IMPLEMENTED',
      uploadIsSeparateFromFormSave: true,
      formSaveIsSeparateFromWorkflowCompletion: true,
    },
  }
}
