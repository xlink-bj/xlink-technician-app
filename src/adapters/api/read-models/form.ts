import type {
  FormDataRead,
  FormDefinitionRead,
  FormFieldOptionRead,
  FormFieldPresentation,
  FormFieldRead,
  FormFieldValue,
  FormFieldVisibility,
  FormPurpose,
  FormValueCodec,
} from '@shared/ports'
import type { FormDefinitionId } from '@shared/types'
import { asOpaqueId } from '@shared/types'
import { AdapterMappingError } from '../../common/operations'
import {
  asRecord,
  assertMatchingWireIdentity,
  consistentWireIdentity,
  nestedRecord,
  optionalRecord,
  optionalString,
  type AdapterRecord,
} from '../../common/records'
import { appointmentFormDefinitionWireId } from '../appointment-contract'
import { optionalOpaqueId, requiredOpaqueId } from './ids'

// R1 form read mappings stay pure and fail-closed; the caller owns transport, scope and authorization.

export function verifiedFormPurpose(record: AdapterRecord | undefined): FormPurpose | undefined {
  if (!record) return undefined
  const candidates = ['colName', 'collectionName', 'formPurpose', 'purpose']
    .map((key) => optionalString(record, [key])?.toLocaleLowerCase())
    .filter((value): value is string => Boolean(value))
  const purposes = new Set(candidates.filter((value): value is FormPurpose => value === 'survey' || value === 'appointment'))
  if (purposes.size === 1) return [...purposes][0]
  return undefined
}

export function fieldRowsFormPurpose(fieldRows: readonly unknown[]): FormPurpose | undefined {
  if (fieldRows.length === 0) return undefined

  // Every raw ExtField row must independently prove the same known semantic
  // collection. Dropping missing/unknown values before building the set would
  // allow a partially unclassified response to masquerade as a Survey or
  // Appointment form.
  const purposes = fieldRows.map((field) => {
    const row = optionalRecord(field)
    const colName = optionalString(row ?? {}, ['colName'])?.toLocaleLowerCase()
    return colName === 'survey' || colName === 'appointment' ? colName : undefined
  })
  if (purposes.some((purpose): purpose is undefined => purpose === undefined)) return undefined
  const distinctPurposes = new Set(purposes)
  return distinctPurposes.size === 1 ? [...distinctPurposes][0] : undefined
}

function parsedRecord(value: unknown): AdapterRecord | undefined {
  const direct = optionalRecord(value)
  if (direct) return direct
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    return optionalRecord(JSON.parse(value))
  } catch {
    return undefined
  }
}

function conditionValue(value: unknown): FormFieldValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value) && value.every((item) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
  )) {
    return value as readonly (string | number | boolean)[]
  }
  return undefined
}

function structuralNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function structuralString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function fieldPresentation(record: AdapterRecord, config: AdapterRecord | undefined): FormFieldPresentation | undefined {
  const read = (keys: readonly string[]) => record[keys[0]] ?? config?.[keys[0]]
  const placeholder = structuralString(read(['placeholder']))
  const width = structuralString(read(['width'])) ?? structuralNumber(read(['width']))
  const minlength = structuralNumber(record.minlength ?? record.minLength ?? config?.minlength ?? config?.minLength)
  const maxlength = structuralNumber(record.maxlength ?? record.maxLength ?? config?.maxlength ?? config?.maxLength)
  const group = structuralString(read(['group']))
  const max = structuralNumber(read(['max']))
  const min = structuralNumber(read(['min']))
  const componentType = structuralString(read(['componentType']))
  const surveyTool = record.surveyTool ?? config?.surveyTool
  const url = config?.url
  const params = config?.params
  const customizeFlag = record.customizeFlag
  const result: FormFieldPresentation = {
    ...(componentType ? { componentType } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(minlength !== undefined ? { minlength } : {}),
    ...(maxlength !== undefined ? { maxlength } : {}),
    ...(group ? { group } : {}),
    ...(typeof customizeFlag === 'boolean' || typeof customizeFlag === 'number' || typeof customizeFlag === 'string'
      ? { customizeFlag: customizeFlag === true || customizeFlag === 1 || customizeFlag === '1' || customizeFlag === 'true' }
      : {}),
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(typeof surveyTool === 'boolean' ? { surveyTool } : {}),
    ...(url !== undefined ? { urlShape: Array.isArray(url) ? 'array' : typeof url } : {}),
    ...(params !== undefined ? { paramsShape: Array.isArray(params) ? 'array' : typeof params } : {}),
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function formFieldVisibility(record: AdapterRecord): {
  readonly visibility?: FormFieldVisibility
  readonly unsupportedReason?: string
} {
  const rawConfig = record.frontEndConfig
  const config = parsedRecord(rawConfig)
  const malformedConfig = typeof rawConfig === 'string'
    && rawConfig.trim().length > 0
    && !config
    && /showField|showValue|showType/.test(rawConfig)
  if (malformedConfig) return { unsupportedReason: 'Conditional field visibility metadata is malformed' }

  const directShowField = optionalString(record, ['showField'])
  const configShowField = optionalString(config ?? {}, ['showField'])
  const showField = directShowField ?? configShowField
  const rawShowType = record.showType ?? config?.showType
  // R1 Survey rows can carry the generic root showType=1 together with a
  // more specific frontEndConfig.showField/showValue condition. The
  // field-level expression is the effective contract in that shape.
  const showType = configShowField
    && config?.showType === undefined
    && String(rawShowType ?? '') === '1'
    ? undefined
    : rawShowType === undefined || rawShowType === null ? undefined : String(rawShowType)
  const configExts = optionalRecord(config?.exts)
  const recordExts = optionalRecord(record.exts)
  // R1's modern branch uses `field.showValue || field.exts.showValue`.
  // Preserve that fallback: development responses commonly carry an empty
  // root showValue together with the effective list under record.exts.
  const showValueCandidates = configShowField
    ? [config?.showValue]
    : [record.showValue, recordExts?.showValue, config?.showValue, configExts?.showValue]
  const selectedShowValue = showValueCandidates.find((value) =>
    value !== undefined
    && value !== null
    && !(typeof value === 'string' && value.trim().length === 0),
  )
  const hasShowValue = selectedShowValue !== undefined
  const showValue = selectedShowValue
  const hasConditionalMetadata = Boolean(showField) || (showType !== undefined && showType !== '1') || hasShowValue
  if (!hasConditionalMetadata) return {}
  // R1 treats showType=1 as unconditionally visible when no legacy
  // frontEndConfig.showField expression is present. Do not reinterpret an
  // unrelated showValue as a condition in that mode.
  if (showType === '1' && !configShowField && !directShowField) return {}
  if (!showField) return { unsupportedReason: 'Conditional field visibility is missing its source field' }
  if (showType === '4' || showType === '5') {
    return { unsupportedReason: 'Role-based field visibility is unavailable in this Action Content' }
  }
  if (showType !== undefined && showType !== '2' && showType !== '3' && showValue !== '$exist') {
    return { unsupportedReason: `Unsupported field visibility mode: ${showType}` }
  }
  if (showValue === '$exist' || showType === '2') {
    return { visibility: { kind: 'exists', path: showField, expected: true } }
  }
  if (!hasShowValue) return { unsupportedReason: 'Conditional field visibility is missing its match value' }
  if (Array.isArray(showValue) && showValue.some((value) => Array.isArray(value))) {
    const alternatives = showValue.map(conditionValue)
    if (alternatives.some((value) => value === undefined)) {
      return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
    }
    return {
      visibility: {
        kind: 'oneOf',
        path: showField,
        values: alternatives as FormFieldValue[],
      },
    }
  }
  if (Array.isArray(showValue)) {
    const values = showValue.map(conditionValue)
    if (values.some((value) => value === undefined)) {
      return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
    }
    return {
      visibility: {
        kind: 'oneOf',
        path: showField,
        values: values as FormFieldValue[],
      },
    }
  }
  const normalizedValue = conditionValue(showValue)
  if (normalizedValue === undefined) {
    return { unsupportedReason: 'Conditional field visibility uses an unsupported match value' }
  }
  return { visibility: { kind: 'equals', path: showField, value: normalizedValue } }
}

function formField(raw: unknown, rowIndex: number): FormFieldRead | null {
  const record = asRecord(raw, 'FormDefinition field row')
  const valueKey = optionalString(record, ['name', 'key', 'fieldName'])?.trim()
  if (!valueKey) throw new AdapterMappingError('FormDefinition field row is missing its value key')
  consistentWireIdentity(record, ['_id', 'id', 'fieldId'], 'FormDefinition field row')
  const rawFieldId = optionalString(record, ['_id', 'id', 'fieldId'])?.trim()
  const fieldId = rawFieldId ?? `unidentified-field-row-${rowIndex + 1}`
  const label = optionalString(record, ['nameDisp', 'label', 'displayName', 'name'])?.trim() ?? valueKey
  const type = optionalString(record, ['type', 'fieldType'])?.trim() ?? 'unknown'
  const requiredValue = record.required
  const readOnlyValue = record.readOnly ?? record.readonly
  const multipleValue = record.multiple
  const required = requiredValue === true || requiredValue === 1 || requiredValue === '1'
  const readOnly = readOnlyValue === true || readOnlyValue === 1 || readOnlyValue === '1'
  const multiple = multipleValue === true || multipleValue === 1 || multipleValue === '1' || multipleValue === 'true'
  const rawOptions = Array.isArray(record.options) ? record.options : Array.isArray(record.items) ? record.items : undefined
  function option(value: unknown): FormFieldOptionRead | null {
    const record = optionalRecord(value)
    const optionValue = record ? optionalString(record, ['value', 'code', 'id']) : undefined
    const optionLabel = record ? optionalString(record, ['label', 'name', 'text', 'codelabel']) : undefined
    if (!record || !optionValue || !optionLabel) return null
    const rawChildren = Array.isArray(record.children) ? record.children : undefined
    const children = rawChildren?.map(option)
    if (children?.some((child): child is null => child === null)) return null
    return {
      value: optionValue,
      label: optionLabel,
      ...(children && children.length > 0 ? { children: children as FormFieldOptionRead[] } : {}),
    }
  }
  const options = rawOptions?.map(option).filter((value): value is FormFieldOptionRead => Boolean(value))
  const malformedOptions = Boolean(rawOptions && options && options.length !== rawOptions.length)
  const conditional = formFieldVisibility(record)
  const valueOption = optionalString(record, ['valueOption'])
  const config = parsedRecord(record.frontEndConfig)
  const order = structuralNumber(record.order ?? record.sort)
  const state = typeof record.state === 'number' || typeof record.state === 'string' ? record.state : undefined
  const fixed = typeof record.fixed === 'string' || typeof record.fixed === 'number' || typeof record.fixed === 'boolean'
    ? record.fixed
    : undefined
  const operationType = typeof record.operationType === 'string' || typeof record.operationType === 'number'
    ? record.operationType
    : undefined
  const showList = Array.isArray(record.showList)
    ? record.showList.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    : undefined
  const malformedShowList = record.showList !== undefined
    && (!Array.isArray(record.showList) || showList?.length !== record.showList.length)
  // In R1 serviceAppointment.getFields, image is a list of reference pictures,
  // not a file uploader. Mock-created image controls retain their separate behavior.
  const presentationOnly = type === 'image' || type === 'title' || type === 'gap'
  const malformedFrontEndConfig = record.frontEndConfig !== undefined
    && record.frontEndConfig !== null
    && record.frontEndConfig !== ''
    && !config
  const invalidDetailHide = config?.mpDetailHide !== undefined
    && typeof config.mpDetailHide !== 'boolean'
  const presentation = fieldPresentation(record, config)

  return {
    fieldId,
    valueKey,
    label,
    type,
    required,
    readOnly,
    ...(order !== undefined ? { order } : {}),
    ...(state !== undefined ? { state } : {}),
    ...(fixed !== undefined ? { fixed } : {}),
    ...(operationType !== undefined ? { operationType } : {}),
    ...(showList ? { showList } : {}),
    ...(config?.mpDetailHide === true ? { mobileDetailHidden: true } : {}),
    ...(presentationOnly ? { presentationOnly: true } : {}),
    ...(multiple ? { multiple } : {}),
    ...(options && options.length > 0 ? { options } : {}),
    ...(conditional.visibility ? { visibility: conditional.visibility } : {}),
    ...(valueOption ? { valueOption } : {}),
    ...(presentation ? { presentation } : {}),
    ...(!rawFieldId
      ? { unsupportedReason: 'Field row identity is unavailable' }
      : conditional.unsupportedReason
        ? { unsupportedReason: conditional.unsupportedReason }
        : malformedOptions
          ? { unsupportedReason: 'Field option metadata is malformed' }
          : malformedShowList
            ? { unsupportedReason: 'Mobile field applicability metadata is malformed' }
            : malformedFrontEndConfig || invalidDetailHide
              ? { unsupportedReason: 'Field frontend configuration is malformed' }
          : {}),
  }
}

export function formDefinition(raw: unknown, requestedId: FormDefinitionId): FormDefinitionRead {
  const envelope = asRecord(raw, 'form definition response')
  const fieldRows = Array.isArray(envelope.data) ? envelope.data : undefined
  const first = fieldRows ? optionalRecord(fieldRows[0]) : undefined
  const record = nestedRecord(envelope, ['entity', 'definition']) ?? first
  if (fieldRows) {
    // `extField.query` returns FIELD rows: their `_id` identifies a field row,
    // but their `extId`, when present, identifies the FormDefinition.
    for (const field of fieldRows) {
      const row = optionalRecord(field)
      if (row) {
        assertMatchingWireIdentity(row, ['extId', 'formDefId', 'definitionId'], String(requestedId), 'Form field definition')
      }
    }
  } else {
    assertMatchingWireIdentity(record ?? envelope, ['id', '_id', 'extId', 'definitionId', 'formDefId'], String(requestedId), 'Form definition')
  }
  const id = fieldRows
    ? requestedId
    : record
      ? optionalOpaqueId<'FormDefinitionId'>(record, ['id', '_id', 'extId', 'definitionId'])
      : optionalOpaqueId<'FormDefinitionId'>(envelope, ['id', '_id', 'extId', 'definitionId'])
  const rawFields = fieldRows
    ? fieldRows
    : record && Array.isArray(record.fields)
      ? record.fields
      : []
  const fields = rawFields
    .map((field, index) => formField(field, index))
    .filter((value): value is FormFieldRead => Boolean(value))
  const fieldRowIds = new Set<string>()
  for (const field of fields) {
    if (fieldRowIds.has(field.fieldId)) {
      throw new AdapterMappingError('Form definition contains duplicate field-row identities')
    }
    fieldRowIds.add(field.fieldId)
  }
  const purpose = fieldRows
    // `colName` is the Ext identity on field rows. Do not interpret an
    // arbitrary field-level `purpose` value as the form's semantic identity;
    // contradictory Ext identities fail closed as unclassified.
    ? fieldRowsFormPurpose(fieldRows)
    : verifiedFormPurpose(record)
      ?? (String(requestedId) === appointmentFormDefinitionWireId ? ('appointment' as const) : undefined)
  return {
    id: id ?? requestedId,
    ...(purpose ? { purpose } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  }
}

function formFieldValue(value: unknown, codec: FormValueCodec | undefined, valueKey: string): FormFieldValue | undefined {
  if (codec) {
    const decoded = codec.decode(value, { valueKey })
    if (decoded !== undefined) return decoded
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    if (value.every((item) =>
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    )) return value as readonly (string | number | boolean)[]
  }
  return undefined
}

function formValues(record: AdapterRecord, codec?: FormValueCodec): Readonly<Record<string, FormFieldValue>> | undefined {
  const values: Record<string, FormFieldValue> = {}
  const extensions = optionalRecord(record.exts)
  if (extensions) {
    for (const [key, value] of Object.entries(extensions)) {
      const normalized = formFieldValue(value, codec, key)
      if (normalized !== undefined) values[key] = normalized
    }
  }
  const metadata = new Set([
    '_id',
    'id',
    'dataId',
    'extId',
    'formDefId',
    'definitionId',
    'workflowRunId',
    'runId',
    'workflowId',
    'exts',
  ])
  for (const [key, value] of Object.entries(record)) {
    if (metadata.has(key) || key in values) continue
    const normalized = formFieldValue(value, codec, key)
    if (normalized !== undefined) values[key] = normalized
  }
  return Object.keys(values).length > 0 ? values : undefined
}

export function formData(raw: unknown, codec?: FormValueCodec, expectedDefinitionId?: FormDefinitionId): FormDataRead {
  const record = asRecord(raw, 'form data')
  const workflow = nestedRecord(record, ['workflow'])
  const values = formValues(record, codec)
  const dataId = requiredOpaqueId<'FormDataId'>(record, ['id', '_id', 'dataId'], 'form data id')
  // R1 responses may expose several aliases of the same saved row. Never let
  // the first alias conceal a contradictory persisted FormData identity.
  assertMatchingWireIdentity(record, ['id', '_id', 'dataId'], String(dataId), 'FormData record')
  const workflowRunIds = ['workflowRunId', 'runId', 'workflowId']
    .map((key) => optionalString(record, [key]))
    .filter((id): id is string => Boolean(id))
  if (new Set(workflowRunIds).size > 1) {
    throw new AdapterMappingError('FormData workflow run identity is contradictory')
  }
  const nestedWorkflowRun = workflow
    ? consistentWireIdentity(workflow, ['workflowRunId', 'runId', 'workflowId'], 'FormData nested Workflow run')
    : undefined
  if (nestedWorkflowRun && workflowRunIds.length > 0 && nestedWorkflowRun !== workflowRunIds[0]) {
    throw new AdapterMappingError('FormData nested Workflow run contradicts saved record')
  }
  // Real R1 dynamic FormData rows may not repeat their FormDefinition ID.
  // The definition is already fixed by the query URL; never invent it from
  // arbitrary data or silently override contradictory response metadata.
  const wireDefinitionIds = ['definitionId', 'extId', 'formDefId']
    .map((key) => optionalString(record, [key]))
    .filter((id): id is string => Boolean(id))
  if (new Set(wireDefinitionIds).size > 1) {
    throw new AdapterMappingError('FormData definition identity is contradictory')
  }
  if (expectedDefinitionId) {
    assertMatchingWireIdentity(record, ['definitionId', 'extId', 'formDefId'], String(expectedDefinitionId), 'FormData definition')
  }
  const definitionId = expectedDefinitionId
    ?? requiredOpaqueId<'FormDefinitionId'>(record, ['definitionId', 'extId', 'formDefId'], 'form definition id')
  return {
    id: dataId,
    definitionId,
    ...(workflowRunIds[0] || nestedWorkflowRun
      ? { workflowRunId: asOpaqueId<'WorkflowRunId'>((workflowRunIds[0] ?? nestedWorkflowRun)!) }
      : {}),
    ...(values ? { values } : {}),
  }
}

