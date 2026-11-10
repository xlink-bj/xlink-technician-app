import type { FormDataRead, FormDefinitionRead, FormFieldOptionRead, FormFieldRead, FormFieldValue } from '@shared/ports'
import { isSurveyReadOnlyMediaField, surveyReadOnlyMediaText } from '@shared/form/survey-readonly-media'
import { evaluateVisibility, isFieldApplicable } from '@runtimes/dynamic-form'
import { actionFormConditionValues } from './action-form-condition-context'
import { ACTION_FORM_SURFACE, actionFormSchemaFor } from './action-form-schema'
import { surveyLeakageCauseExperienceFor, surveyLeakageCauseReadIds, surveyLeakageCauseLabels } from './survey-leakage-cause'

export interface R1RecordReadField {
  readonly fieldId: string
  readonly valueKey: string
  readonly label: string
  readonly text: string
  readonly unavailable: boolean
}

const scalarTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'switch', 'rate'])
const choiceTypes = new Set(['select', 'radio', 'checkbox', 'cascade'])
const scalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))

function displayValue(field: FormFieldRead, value: FormFieldValue | undefined): string {
  if (value === undefined) return '未保存'
  if (value === null || value === '') return '空值'
  const values = Array.isArray(value) ? value : [value]
  if (!values.every(scalar)) return '该内容暂不支持展示'
  if (values.length === 0) return '空值'
  const codes = values.map(String)
  if (!choiceTypes.has(field.type)) return codes.join(' / ')
  const unverified = () => `${codes.join(' / ')}（选项未核实）`
  if (field.type === 'cascade' && !Array.isArray(value)) return unverified()
  let options: readonly FormFieldOptionRead[] | undefined = field.options
  const labels: string[] = []
  for (const code of codes) {
    const matches: readonly FormFieldOptionRead[] = (options ?? []).filter(option => option.value === code)
    if (matches.length !== 1 || !matches[0]!.label) return unverified()
    labels.push(matches[0]!.label)
    // Follow only this parent. Never flatten the tree or match a prefix of a
    // different saved path; labels require an unambiguous complete code path.
    if (field.type === 'cascade') options = matches[0]!.children
  }
  return labels.join(' / ')
}

/** Read display only, after the reader has verified identity and ownership.
 * Applicability/conditions are not write permission. Missing codecs and
 * incomplete conditions never become a claim that a saved value is absent.
 * Controlled leakage data also requires the reader's lossless-original guard;
 * a standalone lossy mapper result is not authoritative absence evidence.
 */
export function projectR1RecordReadFields(definition: FormDefinitionRead, record: FormDataRead): readonly R1RecordReadField[] {
  const fields = definition.fields
  if (record.definitionId !== definition.id || !fields || fields.length > 200
    || fields.some(field => !field.fieldId || !field.valueKey)
    || new Set(fields.map(field => field.fieldId)).size !== fields.length) return []
  const values = actionFormConditionValues({ definitionId: record.definitionId, dataId: record.id, values: record.values ?? {} })
  const leakage = surveyLeakageCauseExperienceFor({ purpose: definition.purpose, fields })
  const result: R1RecordReadField[] = []
  for (const field of fields) {
    const schema = actionFormSchemaFor(field)
    if (!isFieldApplicable(schema, ACTION_FORM_SURFACE) || field.presentationOnly) continue
    const visibility = evaluateVisibility(field.visibility, values)
    if (visibility.state === 'hidden') continue
    const unsupported = Boolean(field.unsupportedReason) || visibility.state === 'unsupported'
    if (leakage?.triggerField.fieldId === field.fieldId) continue
    if (!unsupported && leakage?.valueField.fieldId === field.fieldId) {
      const value = record.values?.[field.valueKey]
      const empty = value === undefined || value === null
      const ids = surveyLeakageCauseReadIds(value)
      result.push({ fieldId: field.fieldId, valueKey: field.valueKey, label: field.label,
        unavailable: !empty && ids === null,
        text: value === undefined ? '未保存' : value === null ? '空值' : ids === null ? '已保存的渗漏原因格式无效'
          : ids.length ? surveyLeakageCauseLabels(ids, []).join(' / ') : '空值' })
      continue
    }
    const mediaText = !unsupported && isSurveyReadOnlyMediaField(definition, field)
      ? surveyReadOnlyMediaText(record.values?.[field.valueKey]) : undefined
    const noCodec = mediaText === undefined && !scalarTypes.has(field.type) && !choiceTypes.has(field.type)
    const unavailable = unsupported || noCodec
    result.push({ fieldId: field.fieldId, valueKey: field.valueKey, label: field.label,
      unavailable,
      text: unsupported ? '字段规则尚未完整核实，暂不展示内容'
        : noCodec ? (field.type === 'file' ? '附件内容暂不支持在此查看' : '该字段类型暂不支持在此查看')
          : mediaText ?? displayValue(field, record.values?.[field.valueKey]),
    })
  }
  return result
}
