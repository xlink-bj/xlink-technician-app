import historicalSurvey from '../../../../contracts/beta/survey/historical.json'

type SurveyOption = {
  readonly value: string
  readonly label: string
  readonly children?: readonly SurveyOption[]
}

type SurveyFieldRow = {
  readonly fieldId: string
  readonly valueKey: string
  readonly label: string
  readonly type: string
  readonly required: boolean
  readonly multiple: boolean
  readonly order: number
  readonly state: number | string
  readonly readOnly: boolean
  readonly showList: readonly string[]
  readonly fixed?: unknown
  readonly operationType?: string | number
  readonly valueOption?: string
  readonly inlineOptions?: readonly SurveyOption[]
  readonly showType?: string
  readonly showField?: string
  readonly showFieldPreset?: number | string | boolean
  readonly showValue?: unknown
  readonly extsShowValue?: unknown
  readonly frontEndConfig?: Readonly<Record<string, unknown>>
  readonly minlength?: string | number | boolean
  readonly maxlength?: string | number | boolean
  readonly minLength?: string | number | boolean
  readonly maxLength?: string | number | boolean
  readonly group?: string | number | boolean
  readonly placeholder?: string | number | boolean
  readonly width?: string | number | boolean
  readonly customizeFlag?: string | number | boolean
}

type SurveyProvider = {
  readonly id: string
  readonly verification: string
  readonly options: readonly SurveyOption[]
}

type SurveyContract = {
  readonly domain: string
  readonly semanticPurpose: string
  readonly semanticIdentity: string
  readonly fieldRowCount: number
  readonly fieldRows: readonly SurveyFieldRow[]
  readonly providers: readonly SurveyProvider[]
}

const surveyContract = historicalSurvey as SurveyContract
if (
  surveyContract.domain !== 'survey'
  || surveyContract.semanticPurpose !== 'survey'
  || surveyContract.semanticIdentity !== 'all_extfield_rows_colName_survey'
  || surveyContract.fieldRows.length !== surveyContract.fieldRowCount
) {
  throw new Error('Sanitized historical Survey contract is invalid')
}

/**
 * This is a sanitized structural Survey contract, not a production schema
 * registry. The generated response deliberately retains the raw backend
 * field-row shape so the Mock crosses the same Adapter boundary as Beta.
 */
export const mockSurveyFormDefinitionId = 'mock-form-definition-survey'

function providerFor(id: string): SurveyProvider | undefined {
  return surveyContract.providers.find((provider) => provider.id === id)
}

function rawOption(option: SurveyOption): Record<string, unknown> {
  return {
    value: option.value,
    name: option.label,
    ...(option.children?.length ? { children: option.children.map(rawOption) } : {}),
  }
}

function rawField(field: SurveyFieldRow): Record<string, unknown> {
  return {
    _id: field.fieldId,
    colName: surveyContract.semanticPurpose,
    name: field.valueKey,
    nameDisp: field.label,
    type: field.type,
    required: field.required ? '1' : '0',
    readOnly: field.readOnly ? '1' : '0',
    multiple: field.multiple,
    order: field.order,
    state: field.state,
    ...(field.fixed !== undefined ? { fixed: field.fixed } : {}),
    showList: field.showList,
    ...(field.operationType !== undefined ? { operationType: field.operationType } : {}),
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
    ...(field.inlineOptions?.length ? { options: field.inlineOptions.map(rawOption) } : {}),
    ...(field.showType !== undefined ? { showType: field.showType } : {}),
    ...(field.showField !== undefined ? { showField: field.showField } : {}),
    ...(field.showFieldPreset !== undefined ? { showFieldPreset: field.showFieldPreset } : {}),
    ...(field.showValue !== undefined ? { showValue: field.showValue } : {}),
    ...(field.extsShowValue !== undefined ? { exts: { showValue: field.extsShowValue } } : {}),
    ...(field.frontEndConfig ? { frontEndConfig: field.frontEndConfig } : {}),
    ...Object.fromEntries(
      ['minlength', 'maxlength', 'minLength', 'maxLength', 'group', 'placeholder', 'width', 'customizeFlag']
        .filter((key) => field[key as keyof SurveyFieldRow] !== undefined)
        .map((key) => [key, field[key as keyof SurveyFieldRow]]),
    ),
  }
}

export const mockSurveyFormDefinitionResponse = {
  data: surveyContract.fieldRows
    .slice()
    .sort((left, right) => left.order - right.order)
    .map(rawField),
  page: 1,
  rows: surveyContract.fieldRows.length,
  total: surveyContract.fieldRows.length,
} as const

/** R1's multistage provider, mechanically derived from the captured contract. */
export const mockSurveyPartsCascadeResponse = [
  {
    type: 'parts',
    children: (providerFor('parts')?.options ?? []).map(rawOption),
  },
] as const

/** Synthetic visual-review rows. Production leakageCause option values are not asserted here. */
export const mockSurveyLeakageCauseResponse = [
  {
    part: 'survey-option-6b86b273ff34',
    leakageCause: 'mock-leakage-cause-roof-1',
    label: '演示原因：屋面节点',
  },
  {
    part: 'survey-option-6b86b273ff34',
    leakageCause: 'mock-leakage-cause-roof-2',
    label: '演示原因：屋面排水',
  },
  {
    part: 'survey-option-d4735e3a265e',
    leakageCause: 'mock-leakage-cause-bath-1',
    label: '演示原因：卫生间节点',
  },
] as const

/** R1's batch code provider, mechanically derived from the captured contract. */
export function mockSurveyCodeOptionsResponse(valueOption: string): readonly Record<string, unknown>[] {
  const provider = providerFor(valueOption)
  if (!provider || provider.verification !== 'VERIFIED') return []
  return [{
    eleid: valueOption,
    options: Object.fromEntries(provider.options.map((option) => [option.value, option.label])),
  }]
}

export { surveyContract }
