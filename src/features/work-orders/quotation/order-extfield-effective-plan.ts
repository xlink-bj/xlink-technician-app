import { classifyFieldType, selectOptionProvider } from '@runtimes/dynamic-form'
import type {
  FormFieldSchema,
  OptionProviderDescriptor,
  VisibilityExpression,
} from '@runtimes/dynamic-form'

export type OrderExtFieldStage = 'placeOrder' | 'submitOrder'
export type OrderExtFieldRowDisposition = 'eligible' | 'filtered' | 'blocked'
export type OrderExtFieldRequiredness = 'required' | 'optional' | 'unknown' | 'not_applicable'
export type OrderExtFieldFinalSubmitState = 'required' | 'optional' | 'blocked' | 'not_applicable'

export interface OrderExtFieldFinalSubmitRule {
  /** Requiredness obligation only; this pure plan does not validate or submit a value. */
  readonly state: OrderExtFieldFinalSubmitState
  readonly reason?: string
}

export interface OrderExtFieldRawRow {
  /** Stable row identity supplied by the caller; never infer this from valueKey. */
  readonly rowId?: unknown
  /** ExtField.name / Order.exts key. Duplicate keys are intentionally retained. */
  readonly valueKey?: unknown
  readonly colName?: unknown
  readonly state?: unknown
  readonly showList?: unknown
  readonly type?: unknown
  readonly required?: unknown
  readonly valueOption?: unknown
  readonly multiple?: unknown
  readonly operationType?: unknown
  readonly frontEndConfig?: unknown
}

export interface OrderExtFieldEffectiveContext {
  readonly stage: OrderExtFieldStage
  readonly serviceType?: string
  readonly personType?: string
  readonly values?: Readonly<Record<string, unknown>>
}

export type OrderExtFieldSpecialControl =
  | { readonly kind: 'area'; readonly state: 'blocked'; readonly reason: 'province_city_county_provider_unverified' }
  | { readonly kind: 'button'; readonly state: 'blocked'; readonly reason: 'special_action_not_allowlisted' }
  | { readonly kind: 'media'; readonly state: 'blocked'; readonly reason: 'order_media_persistence_unverified' }
  | { readonly kind: 'presentation'; readonly state: 'display_only' }

export interface OrderExtFieldProviderDiagnostic {
  readonly state: 'not_required' | 'configured_not_fetched' | 'missing' | 'unsupported'
  readonly provider?: OptionProviderDescriptor
  readonly blocksRuntimeUse: boolean
  readonly reason?: string
}

export interface OrderExtFieldPlanRow {
  readonly rowId?: string
  readonly valueKey?: string
  /** Raw control kind retained even when the row has no safe generic schema. */
  readonly controlType?: string
  readonly disposition: OrderExtFieldRowDisposition
  readonly mappingEvidence: 'SOURCE_VERIFIED' | 'RUNTIME_INFERRED' | 'BLOCKED'
  readonly stage?: OrderExtFieldStage
  readonly requiredness: OrderExtFieldRequiredness
  /** R1 final placeOrder() requiredness, evaluated independently of showField visibility. */
  readonly finalSubmit: OrderExtFieldFinalSubmitRule
  readonly reason?: string
  readonly schema?: FormFieldSchema
  readonly specialControl?: OrderExtFieldSpecialControl
  readonly provider: OrderExtFieldProviderDiagnostic
}

export interface OrderExtFieldEffectivePlan {
  readonly execution: 'PURE_SOURCE_PLAN_ONLY'
  readonly stage: OrderExtFieldStage
  readonly rows: readonly OrderExtFieldPlanRow[]
  /** Only finite, ordinary editable controls. Never includes area, button, or media. */
  readonly fields: readonly FormFieldSchema[]
  readonly diagnostics: {
    /** Required mapping/runtime blockers for the visible field / catalog-entry phase. */
    readonly requiredBlockerRowIds: readonly string[]
    /** R1 final-submit requiredness obligations, including conditionally hidden rows. */
    readonly finalSubmitRequiredRowIds: readonly string[]
    /** Final-submit rules that cannot be resolved safely from the supplied context. */
    readonly finalSubmitBlockedRowIds: readonly string[]
    readonly providerPendingRowIds: readonly string[]
    readonly blockedRowIds: readonly string[]
    readonly filteredRowIds: readonly string[]
    readonly liveRuntimeReady: false
  }
}

export type OrderAreaCode = string | number
export type CompleteOrderAreaPath = readonly [OrderAreaCode, OrderAreaCode, OrderAreaCode]

export type OrderAreaValueState =
  | { readonly state: 'blank'; readonly path: readonly [] }
  | { readonly state: 'partial'; readonly path: readonly OrderAreaCode[]; readonly missingLevels: number }
  | { readonly state: 'complete'; readonly path: CompleteOrderAreaPath }
  | { readonly state: 'invalid'; readonly reason: 'not_an_array' | 'too_many_levels' | 'invalid_code' }

export interface RestoredOrderExtFieldValues {
  /** Values editable through the current pure plan. */
  readonly values: Readonly<Record<string, unknown>>
  /** Unknown, filtered, blocked, or otherwise unmapped old exts kept opaque. */
  readonly preservedUnmappedExts: Readonly<Record<string, unknown>>
}

type RecordValue = Record<string, unknown>
type ConditionResult =
  | { readonly state: 'absent' }
  | { readonly state: 'matched' }
  | { readonly state: 'not_matched' }
  | { readonly state: 'blocked'; readonly reason: string }
  | { readonly state: 'mapped'; readonly expression: VisibilityExpression }

const MOBILE_DETAIL_CODE = '4'
const safeFrontEndConfigKeys = new Set([
  'showType',
  'serviceType',
  'personType',
  'showField',
  'showValue',
  'dispensableField',
  'dispensableValue',
])
const forbiddenFrontEndConfigKeys = new Set([
  'requestUrl',
  'evaluate',
  'appId',
  'path',
  'extraData',
  'commonEvent',
  'regular',
  'placeOrderNameValidate',
])
const mediaTypes = new Set(['file', 'image'])
const safeScalarTypes = new Set(['string', 'number', 'boolean'])

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function own(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function parseFrontEndConfig(value: unknown): { readonly config?: RecordValue; readonly malformed: boolean } {
  if (value === undefined || value === null || value === '') return { config: {}, malformed: false }
  if (isRecord(value)) return { config: value, malformed: false }
  if (typeof value !== 'string') return { malformed: true }
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? { config: parsed, malformed: false } : { malformed: true }
  } catch {
    return { malformed: true }
  }
}

function runtimeStage(value: unknown): OrderExtFieldStage | undefined {
  return value === 'placeOrder' || value === 'submitOrder' ? value : undefined
}

function rowResult(
  row: OrderExtFieldRawRow,
  disposition: OrderExtFieldRowDisposition,
  reason: string,
  extra: Partial<OrderExtFieldPlanRow> = {},
): OrderExtFieldPlanRow {
  return {
    ...(nonEmptyString(row.rowId) ? { rowId: row.rowId } : {}),
    ...(nonEmptyString(row.valueKey) ? { valueKey: row.valueKey } : {}),
    ...(typeof row.type === 'string' ? { controlType: row.type } : {}),
    disposition,
    mappingEvidence: disposition === 'blocked'
      ? 'BLOCKED'
      : disposition === 'filtered'
        ? 'SOURCE_VERIFIED'
        : 'RUNTIME_INFERRED',
    requiredness: 'unknown',
    finalSubmit: { state: 'not_applicable' },
    reason,
    provider: { state: 'not_required', blocksRuntimeUse: false },
    ...extra,
  }
}

function candidateDisposition(row: OrderExtFieldRawRow): { readonly result: 'candidate' } | { readonly result: 'filtered' | 'blocked'; readonly reason: string } {
  if (row.colName !== 'order') {
    return row.colName === undefined || row.colName === null
      ? { result: 'blocked', reason: 'missing_collection_identity' }
      : { result: 'filtered', reason: 'not_order_collection' }
  }
  if (row.state === 0 || row.state === '0') return { result: 'filtered', reason: 'disabled_row' }
  if (row.state !== 1 && row.state !== '1') return { result: 'blocked', reason: 'unknown_enabled_state' }
  if (!Array.isArray(row.showList) || row.showList.some((value) => typeof value !== 'string' && typeof value !== 'number')) {
    return { result: 'blocked', reason: 'unknown_mobile_surface_metadata' }
  }
  if (!row.showList.some((value) => String(value) === MOBILE_DETAIL_CODE)) {
    return { result: 'filtered', reason: 'not_mobile_detail_surface' }
  }
  return { result: 'candidate' }
}

function r1Truthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0 || value === '') return false
  if (typeof value === 'number' && Number.isNaN(value)) return false
  return true
}

function compareR1LooseEqualitySafely(actual: unknown, expected: unknown): ConditionResult {
  if (!safeScalarTypes.has(typeof actual) || !safeScalarTypes.has(typeof expected)) {
    return { state: 'blocked', reason: 'condition_operand_not_a_supported_scalar' }
  }
  if (typeof actual !== typeof expected) {
    return { state: 'blocked', reason: 'r1_loose_equality_not_equivalent_to_runtime_equality' }
  }
  return actual === expected ? { state: 'matched' } : { state: 'not_matched' }
}

function conditionFor(
  config: Readonly<Record<string, unknown>>,
  fieldProperty: 'showField' | 'dispensableField',
  valueProperty: 'showValue' | 'dispensableValue',
  values: Readonly<Record<string, unknown>>,
): ConditionResult {
  const rawField = config[fieldProperty]
  const rawExpected = config[valueProperty]
  const configuredField = r1Truthy(rawField)
  const configuredExpected = rawExpected !== undefined

  if (!configuredField && !configuredExpected) return { state: 'absent' }
  if (!configuredField || !configuredExpected || !nonEmptyString(rawField)) {
    return { state: 'blocked', reason: `${fieldProperty}_pair_malformed` }
  }
  if (!own(values, rawField)) return { state: 'blocked', reason: `${fieldProperty}_dependency_missing` }

  const comparison = compareR1LooseEqualitySafely(values[rawField], rawExpected)
  if (comparison.state === 'blocked') return comparison
  if (fieldProperty === 'showField') {
    if (comparison.state === 'not_matched') return comparison
    return {
      state: 'mapped',
      expression: { kind: 'equals', path: [rawField], value: rawExpected as string | number | boolean },
    }
  }
  return comparison
}

function requirednessFor(value: unknown): OrderExtFieldRequiredness {
  // R1 uses `required == '1'`. These explicit JSON scalar encodings preserve
  // that result; other encodings are not silently interpreted as optional.
  if (value === '1' || value === 1 || value === true) return 'required'
  if (value === '0' || value === 0 || value === false) return 'optional'
  return 'unknown'
}

function declaredRequiredness(row: OrderExtFieldRawRow): OrderExtFieldRequiredness {
  return row.type === 'button' || row.type === 'gap'
    ? 'not_applicable'
    : requirednessFor(row.required)
}

function finalSubmitRuleForRow(
  row: OrderExtFieldRawRow,
  context: OrderExtFieldEffectiveContext,
): OrderExtFieldFinalSubmitRule {
  const candidate = candidateDisposition(row)
  if (candidate.result === 'filtered') return { state: 'not_applicable', reason: candidate.reason }
  if (candidate.result === 'blocked') return { state: 'blocked', reason: candidate.reason }

  const parsedConfig = parseFrontEndConfig(row.frontEndConfig)
  if (parsedConfig.malformed || !parsedConfig.config) {
    return { state: 'blocked', reason: 'front_end_config_malformed' }
  }
  const config = parsedConfig.config
  const stage = runtimeStage(config.showType)
  if (!stage) return { state: 'not_applicable', reason: 'unknown_stage_excluded' }
  if (stage !== context.stage) return { state: 'not_applicable', reason: 'different_action_stage' }

  const serviceType = serviceTypeResult(config, context)
  if (serviceType.state === 'blocked') return { state: 'blocked', reason: serviceType.reason }
  if (serviceType.state === 'not_matched') return { state: 'not_applicable', reason: 'service_type_not_applicable' }

  if (stage === 'submitOrder') {
    const personType = personTypeResult(config, context)
    if (personType.state === 'blocked') return { state: 'blocked', reason: personType.reason }
    if (personType.state === 'not_matched') return { state: 'not_applicable', reason: 'person_type_not_applicable' }
  }

  const requiredness = declaredRequiredness(row)
  if (requiredness === 'not_applicable') return { state: 'not_applicable', reason: 'control_has_no_required_value' }
  if (requiredness === 'unknown') return { state: 'blocked', reason: 'requiredness_encoding_unverified' }

  // R1's final placeOrder() requiredness loop does not consult showField/showValue.
  // Only its explicit dispensableField/dispensableValue pair can waive a required row.
  const dispensability = conditionFor(config, 'dispensableField', 'dispensableValue', context.values ?? {})
  if (dispensability.state === 'blocked') return { state: 'blocked', reason: dispensability.reason }
  if (dispensability.state === 'matched') return { state: 'optional', reason: 'dispensable_condition_matched' }
  return { state: requiredness }
}

function serviceTypeResult(config: Readonly<Record<string, unknown>>, context: OrderExtFieldEffectiveContext): ConditionResult {
  const restriction = config.serviceType
  if (!r1Truthy(restriction)) return { state: 'absent' }
  if (!nonEmptyString(context.serviceType)) return { state: 'blocked', reason: 'service_type_context_required' }
  if (Array.isArray(restriction)) {
    if (restriction.some((value) => typeof value !== 'string' && typeof value !== 'number')) {
      return { state: 'blocked', reason: 'service_type_restriction_malformed' }
    }
    return restriction.includes(context.serviceType)
      ? { state: 'matched' }
      : { state: 'not_matched' }
  }
  // R1 calls .indexOf() on this value. A string therefore has substring
  // semantics, but no source evidence proves that tenant configuration uses
  // this encoding; do not guess its intended list semantics.
  return { state: 'blocked', reason: 'service_type_restriction_encoding_unverified' }
}

function personTypeResult(config: Readonly<Record<string, unknown>>, context: OrderExtFieldEffectiveContext): ConditionResult {
  const restriction = config.personType
  if (!r1Truthy(restriction)) return { state: 'absent' }
  if (!nonEmptyString(context.personType)) return { state: 'blocked', reason: 'person_type_context_required' }
  return compareR1LooseEqualitySafely(context.personType, restriction)
}

function providerDiagnostic(schema: FormFieldSchema): OrderExtFieldProviderDiagnostic {
  const decision = selectOptionProvider(schema)
  if (decision.state === 'not_required') return { state: 'not_required', blocksRuntimeUse: false }
  if (decision.state === 'unsupported') {
    return { state: 'missing', blocksRuntimeUse: true, reason: decision.reason ?? 'provider_unavailable' }
  }
  if (decision.provider?.kind === 'workTypes') {
    return { state: 'unsupported', blocksRuntimeUse: true, reason: 'business_provider_not_verified_for_order_extfield' }
  }
  return {
    state: 'configured_not_fetched',
    ...(decision.provider ? { provider: decision.provider } : {}),
    blocksRuntimeUse: true,
    reason: 'provider_options_not_fetched_in_this_slice',
  }
}

function blockedEffectiveRow(
  row: OrderExtFieldRawRow,
  stage: OrderExtFieldStage,
  reason: string,
  requiredness: OrderExtFieldRequiredness = 'unknown',
  specialControl?: OrderExtFieldSpecialControl,
  provider: OrderExtFieldProviderDiagnostic = { state: 'not_required', blocksRuntimeUse: false },
): OrderExtFieldPlanRow {
  return rowResult(row, 'blocked', reason, {
    stage,
    requiredness,
    ...(specialControl ? { specialControl } : {}),
    provider,
  })
}

function mapCandidateRow(row: OrderExtFieldRawRow, context: OrderExtFieldEffectiveContext): OrderExtFieldPlanRow {
  const candidate = candidateDisposition(row)
  if (candidate.result !== 'candidate') return rowResult(row, candidate.result, candidate.reason)

  const parsedConfig = parseFrontEndConfig(row.frontEndConfig)
  if (parsedConfig.malformed || !parsedConfig.config) {
    return rowResult(row, 'blocked', 'front_end_config_malformed')
  }
  const config = parsedConfig.config
  const stage = runtimeStage(config.showType)
  if (!stage) return rowResult(row, 'filtered', 'unknown_stage_excluded')
  if (stage !== context.stage) return rowResult(row, 'filtered', 'different_action_stage', { stage })

  if (!nonEmptyString(row.rowId) || !nonEmptyString(row.valueKey)) {
    return blockedEffectiveRow(row, stage, 'field_row_identity_or_value_key_missing')
  }

  const type = typeof row.type === 'string' ? row.type : ''
  const requiredness = declaredRequiredness(row)
  const serviceResult = serviceTypeResult(config, context)
  if (serviceResult.state === 'blocked') return blockedEffectiveRow(row, stage, serviceResult.reason, requiredness)
  if (serviceResult.state === 'not_matched') return rowResult(row, 'filtered', 'service_type_not_applicable', { stage })

  if (stage === 'submitOrder') {
    const personResult = personTypeResult(config, context)
    if (personResult.state === 'blocked') return blockedEffectiveRow(row, stage, personResult.reason, requiredness)
    if (personResult.state === 'not_matched') return rowResult(row, 'filtered', 'person_type_not_applicable', { stage })
  }

  const values = context.values ?? {}
  const visibilityResult = conditionFor(config, 'showField', 'showValue', values)
  if (visibilityResult.state === 'blocked') return blockedEffectiveRow(row, stage, visibilityResult.reason, requiredness)
  if (visibilityResult.state === 'not_matched') return rowResult(row, 'filtered', 'conditional_visibility_hidden', { stage })

  if (type === 'button') {
    return blockedEffectiveRow(
      row,
      stage,
      'special_action_not_allowlisted',
      'not_applicable',
      { kind: 'button', state: 'blocked', reason: 'special_action_not_allowlisted' },
    )
  }
  if (type === 'area') {
    return blockedEffectiveRow(
      row,
      stage,
      'province_city_county_provider_unverified',
      requiredness,
      { kind: 'area', state: 'blocked', reason: 'province_city_county_provider_unverified' },
    )
  }
  if (mediaTypes.has(type)) {
    return blockedEffectiveRow(
      row,
      stage,
      'order_media_persistence_unverified',
      requiredness,
      { kind: 'media', state: 'blocked', reason: 'order_media_persistence_unverified' },
    )
  }
  if (type === 'gap') {
    return rowResult(row, 'eligible', 'presentation_only', {
      stage,
      requiredness: 'not_applicable',
      specialControl: { kind: 'presentation', state: 'display_only' },
    })
  }
  if (requiredness === 'unknown') return blockedEffectiveRow(row, stage, 'requiredness_encoding_unverified')
  if (type === 'switch') {
    return blockedEffectiveRow(row, stage, 'switch_value_and_default_parity_unverified', requiredness)
  }

  if (row.operationType !== undefined && row.operationType !== null && row.operationType !== '') {
    return blockedEffectiveRow(row, stage, 'operation_type_semantics_unverified', requiredness)
  }
  const configKeys = Object.keys(config)
  if (configKeys.some((key) => forbiddenFrontEndConfigKeys.has(key))) {
    return blockedEffectiveRow(row, stage, 'executable_or_special_front_end_config_blocked', requiredness)
  }
  if (configKeys.some((key) => !safeFrontEndConfigKeys.has(key))) {
    return blockedEffectiveRow(row, stage, 'unmodeled_front_end_config_blocked', requiredness)
  }

  const dispensability = conditionFor(config, 'dispensableField', 'dispensableValue', values)
  if (dispensability.state === 'blocked') return blockedEffectiveRow(row, stage, dispensability.reason, requiredness)
  const effectiveRequired = requiredness === 'required' && dispensability.state !== 'matched'

  const multiple = row.type === 'checkbox' ? true : row.multiple
  if (row.multiple !== undefined && typeof row.multiple !== 'boolean') {
    return blockedEffectiveRow(row, stage, 'multiple_value_semantics_unverified', requiredness)
  }
  if (row.type === 'checkbox' && row.multiple === false) {
    return blockedEffectiveRow(row, stage, 'checkbox_must_preserve_multi_value_semantics', requiredness)
  }
  if (row.type !== 'checkbox' && row.multiple === true && row.type !== 'select') {
    return blockedEffectiveRow(row, stage, 'multiple_value_semantics_unverified', requiredness)
  }

  const schema: FormFieldSchema = {
    fieldId: row.rowId,
    valueKey: row.valueKey,
    type,
    required: effectiveRequired,
    ...(typeof row.multiple === 'boolean' || type === 'checkbox' ? { multiple: Boolean(multiple) } : {}),
    ...(nonEmptyString(row.valueOption) ? { valueOption: row.valueOption } : {}),
    ...(visibilityResult.state === 'mapped' ? { visibility: visibilityResult.expression } : {}),
    ...(Array.isArray(row.showList) ? { showList: row.showList as readonly (string | number)[] } : {}),
  }
  const capability = classifyFieldType(schema.type)
  if (capability.capability !== 'SUPPORTED_GENERIC') {
    return blockedEffectiveRow(row, stage, capability.reason ?? 'runtime_field_capability_unavailable', requiredness)
  }
  const provider = providerDiagnostic(schema)
  if (provider.blocksRuntimeUse) {
    return blockedEffectiveRow(row, stage, provider.reason ?? 'provider_unavailable', requiredness, undefined, provider)
  }
  return rowResult(row, 'eligible', 'source_mappable_ordinary_control', {
    stage,
    requiredness: effectiveRequired ? 'required' : 'optional',
    schema,
    provider,
  })
}

function blockDuplicateRowIdentities(rows: readonly OrderExtFieldPlanRow[]): readonly OrderExtFieldPlanRow[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.rowId) counts.set(row.rowId, (counts.get(row.rowId) ?? 0) + 1)
  }
  return rows.map((row) => row.rowId && counts.get(row.rowId)! > 1 && row.disposition !== 'filtered'
    ? {
        ...row,
        disposition: 'blocked',
        mappingEvidence: 'BLOCKED',
        schema: undefined,
        reason: 'duplicate_field_row_identity',
      }
    : row)
}

function blockConflictingValueKeyTypes(rows: readonly OrderExtFieldPlanRow[]): readonly OrderExtFieldPlanRow[] {
  const typesByKey = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.disposition !== 'filtered' && row.valueKey && row.controlType) {
      const types = typesByKey.get(row.valueKey) ?? new Set<string>()
      types.add(row.controlType)
      typesByKey.set(row.valueKey, types)
    }
  }
  return rows.map((row) => {
    if (row.disposition === 'filtered' || !row.valueKey || (typesByKey.get(row.valueKey)?.size ?? 0) <= 1) return row
    return {
      ...row,
      disposition: 'blocked',
      mappingEvidence: 'BLOCKED',
      schema: undefined,
      reason: 'shared_value_key_has_conflicting_control_types',
    }
  })
}

export function createOrderExtFieldEffectivePlan(
  rows: readonly OrderExtFieldRawRow[],
  context: OrderExtFieldEffectiveContext,
): OrderExtFieldEffectivePlan {
  const mappedRows = rows.map((row) => mapCandidateRow(row, context))
  const phaseAwareRows = mappedRows.map((mapped, index) => ({
    ...mapped,
    finalSubmit: finalSubmitRuleForRow(rows[index], context),
  }))
  const plannedRows = blockConflictingValueKeyTypes(blockDuplicateRowIdentities(phaseAwareRows))
  const fields = plannedRows.flatMap((row) => row.disposition === 'eligible' && row.schema ? [row.schema] : [])
  const requiredBlockerRowIds = plannedRows
    .filter((row) => row.disposition === 'blocked' && row.requiredness === 'required' && row.rowId)
    .map((row) => row.rowId!)
  const providerPendingRowIds = plannedRows
    .filter((row) => row.provider.state === 'configured_not_fetched' && row.rowId)
    .map((row) => row.rowId!)
  return {
    execution: 'PURE_SOURCE_PLAN_ONLY',
    stage: context.stage,
    rows: plannedRows,
    fields,
    diagnostics: {
      requiredBlockerRowIds,
      finalSubmitRequiredRowIds: plannedRows
        .filter((row) => row.finalSubmit.state === 'required' && row.rowId)
        .map((row) => row.rowId!),
      finalSubmitBlockedRowIds: plannedRows
        .filter((row) => row.finalSubmit.state === 'blocked' && row.rowId)
        .map((row) => row.rowId!),
      providerPendingRowIds,
      blockedRowIds: plannedRows.filter((row) => row.disposition === 'blocked' && row.rowId).map((row) => row.rowId!),
      filteredRowIds: plannedRows.filter((row) => row.disposition === 'filtered' && row.rowId).map((row) => row.rowId!),
      liveRuntimeReady: false,
    },
  }
}

function validAreaCode(value: unknown): value is OrderAreaCode {
  if (typeof value === 'string') return value.length > 0 && value.trim() === value && /^\d+$/.test(value)
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function classifyOrderAreaPath(value: unknown): OrderAreaValueState {
  if (value === undefined || value === null || value === '') return { state: 'blank', path: [] }
  if (!Array.isArray(value)) return { state: 'invalid', reason: 'not_an_array' }
  if (value.length === 0) return { state: 'blank', path: [] }
  if (value.length > 3) return { state: 'invalid', reason: 'too_many_levels' }
  if (!value.every(validAreaCode)) return { state: 'invalid', reason: 'invalid_code' }
  if (value.length < 3) return { state: 'partial', path: value, missingLevels: 3 - value.length }
  return {
    state: 'complete',
    path: [value[0] as OrderAreaCode, value[1] as OrderAreaCode, value[2] as OrderAreaCode],
  }
}

/** Converts only supplied R1 picker codes; it never looks up or fabricates a missing level. */
export function orderAreaPathFromPickerValues(value: unknown): OrderAreaValueState {
  if (!Array.isArray(value)) return classifyOrderAreaPath(value)
  const path = value.map((item) => {
    if (!isRecord(item)) return undefined
    // R1 uses `node.code || node.value` from the picker event.
    return item.code || item.value
  })
  return classifyOrderAreaPath(path)
}

export function restoreOrderExtFieldValues(
  existingExts: unknown,
  plan: OrderExtFieldEffectivePlan,
): RestoredOrderExtFieldValues {
  if (!isRecord(existingExts)) return { values: {}, preservedUnmappedExts: {} }
  const editableKeys = new Set(plan.fields.map((field) => field.valueKey))
  const values: Record<string, unknown> = {}
  const preservedUnmappedExts: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(existingExts)) {
    if (editableKeys.has(key)) values[key] = value
    else preservedUnmappedExts[key] = value
  }
  return { values, preservedUnmappedExts }
}

/** A pure supported-field projection for tests/planning; it is not wired to any command or serializer. */
export function projectEligibleOrderExtFieldValues(
  plan: OrderExtFieldEffectivePlan,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {}
  for (const field of plan.fields) {
    if (own(values, field.valueKey)) output[field.valueKey] = values[field.valueKey]
  }
  return output
}
