import formFamilies from '../../../../contracts/beta/form-families/observed.json'

interface SurveyFieldRow {
  readonly key: string
  readonly type: string
  readonly required: boolean
  readonly multiple: boolean
  readonly valueOption?: string
}

interface SurveyFamily {
  readonly classification: string
  readonly fieldRows?: readonly SurveyFieldRow[]
}

const surveyFamily = formFamilies.families.find(
  (family) => family.classification === 'SURVEY',
) as SurveyFamily | undefined

if (!surveyFamily || !surveyFamily.fieldRows) {
  throw new Error('Sanitized Survey field-row inventory is missing')
}

/**
 * This is a sanitized structural Survey contract, not a production schema
 * registry. Row IDs are deterministic Mock identities; value keys are the
 * observed FormData names and are deliberately allowed to repeat.
 */
export const mockSurveyFormDefinitionId = 'mock-form-definition-survey'

export const mockSurveyFormDefinitionResponse = {
  data: surveyFamily.fieldRows.map((field, index) => ({
    _id: `survey-field-${String(index + 1).padStart(3, '0')}`,
    name: field.key,
    // The inventory is structural and does not claim production display text.
    nameDisp: field.key,
    type: field.type,
    required: field.required ? '1' : '0',
    readOnly: '0',
    multiple: field.multiple,
    order: index + 1,
    state: 1,
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
  })),
  page: 1,
  rows: surveyFamily.fieldRows.length,
  total: surveyFamily.fieldRows.length,
} as const

/**
 * `parts` is independently evidenced as an R1 multistage provider. The
 * option values remain synthetic aliases; this response does not promote a
 * production code dictionary. The Survey field still reaches this provider
 * through the same Adapter path as a real response.
 */
export const mockSurveyPartsCascadeResponse = [
  {
    type: 'parts',
    children: [
      { value: 'repair-part-code-001', name: '屋面' },
      { value: 'repair-part-code-002', name: '外墙' },
      { value: 'repair-part-code-003', name: '卫生间' },
    ],
  },
] as const

export { surveyFamily }
