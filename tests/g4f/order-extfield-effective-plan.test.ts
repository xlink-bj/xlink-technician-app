import { describe, expect, it } from 'vitest'
import { normalizeFieldValue } from '@runtimes/dynamic-form'

import {
  classifyOrderAreaPath,
  createOrderExtFieldEffectivePlan,
  orderAreaPathFromPickerValues,
  projectEligibleOrderExtFieldValues,
  restoreOrderExtFieldValues,
  type OrderExtFieldEffectiveContext,
  type OrderExtFieldRawRow,
} from '../../src/features/work-orders/quotation/order-extfield-effective-plan'

function row(overrides: Partial<OrderExtFieldRawRow> = {}): OrderExtFieldRawRow {
  return {
    rowId: 'fixture-row-1',
    valueKey: 'fixtureValue',
    colName: 'order',
    state: 1,
    showList: [4],
    type: 'text',
    required: '0',
    frontEndConfig: { showType: 'placeOrder' },
    ...overrides,
  }
}

function plan(
  rows: readonly OrderExtFieldRawRow[],
  context: Partial<OrderExtFieldEffectiveContext> = {},
) {
  return createOrderExtFieldEffectivePlan(rows, {
    stage: 'placeOrder',
    ...context,
  })
}

describe('Order ExtField effective plan (synthetic only)', () => {
  it('keeps stage partitions exact and excludes unknown showType values', () => {
    const result = plan([
      row({ rowId: 'place', frontEndConfig: { showType: 'placeOrder' } }),
      row({ rowId: 'submit', required: '1', frontEndConfig: { showType: 'submitOrder' } }),
      row({ rowId: 'unknown', frontEndConfig: { showType: 'quote' } }),
    ])

    expect(result.rows.map(({ rowId, disposition, reason }) => ({ rowId, disposition, reason }))).toEqual([
      { rowId: 'place', disposition: 'eligible', reason: 'source_mappable_ordinary_control' },
      { rowId: 'submit', disposition: 'filtered', reason: 'different_action_stage' },
      { rowId: 'unknown', disposition: 'filtered', reason: 'unknown_stage_excluded' },
    ])
    expect(result.fields.map((field) => field.fieldId)).toEqual(['place'])
    expect(result.rows[0].mappingEvidence).toBe('RUNTIME_INFERRED')
    expect(result.rows[2].mappingEvidence).toBe('SOURCE_VERIFIED')
    expect(result.rows[0].finalSubmit).toEqual({ state: 'optional' })
    expect(result.rows[1].finalSubmit).toEqual({ state: 'not_applicable', reason: 'different_action_stage' })

    const submitResult = plan([
      row({ rowId: 'place', required: '1', frontEndConfig: { showType: 'placeOrder' } }),
      row({ rowId: 'submit', required: '1', frontEndConfig: { showType: 'submitOrder' } }),
    ], { stage: 'submitOrder' })
    expect(submitResult.rows.map((item) => item.finalSubmit.state)).toEqual(['not_applicable', 'required'])
    expect(submitResult.diagnostics.finalSubmitRequiredRowIds).toEqual(['submit'])
  })

  it('applies serviceType restrictions to both stages and does not broaden when context is missing', () => {
    const restrictedPlace = row({
      rowId: 'place-service',
      frontEndConfig: { showType: 'placeOrder', serviceType: ['fixture-service-a'] },
    })
    const restrictedSubmit = row({
      rowId: 'submit-service',
      frontEndConfig: { showType: 'submitOrder', serviceType: ['fixture-service-a'] },
    })

    expect(plan([restrictedPlace], { serviceType: 'fixture-service-a' }).rows[0].disposition).toBe('eligible')
    expect(plan([restrictedPlace], { serviceType: 'fixture-service-b' }).rows[0].reason).toBe('service_type_not_applicable')
    expect(plan([restrictedPlace], { serviceType: 'fixture-service-b' }).rows[0].finalSubmit.state).toBe('not_applicable')
    expect(plan([restrictedPlace]).rows[0]).toMatchObject({ disposition: 'blocked', reason: 'service_type_context_required' })
    expect(plan([restrictedPlace]).rows[0].finalSubmit).toMatchObject({ state: 'blocked', reason: 'service_type_context_required' })
    expect(plan([restrictedSubmit], { stage: 'submitOrder', serviceType: 'fixture-service-a' }).rows[0].disposition).toBe('eligible')
  })

  it('applies personType only to submitOrder and fails closed when restricted submit context is absent', () => {
    const place = row({ frontEndConfig: { showType: 'placeOrder', personType: 'fixture-person-a' } })
    const submit = row({ frontEndConfig: { showType: 'submitOrder', personType: 'fixture-person-a' } })

    expect(plan([place]).rows[0].disposition).toBe('eligible')
    expect(plan([submit], { stage: 'submitOrder', personType: 'fixture-person-a' }).rows[0].disposition).toBe('eligible')
    expect(plan([submit], { stage: 'submitOrder', personType: 'fixture-person-b' }).rows[0].reason).toBe('person_type_not_applicable')
    expect(plan([submit], { stage: 'submitOrder', personType: 'fixture-person-b' }).rows[0].finalSubmit.state).toBe('not_applicable')
    expect(plan([submit], { stage: 'submitOrder' }).rows[0]).toMatchObject({ disposition: 'blocked', reason: 'person_type_context_required' })
    expect(plan([submit], { stage: 'submitOrder' }).rows[0].finalSubmit).toMatchObject({ state: 'blocked', reason: 'person_type_context_required' })
  })

  it('keeps row identity distinct from a shared Order.exts key but blocks duplicate row identity', () => {
    const sharedKey = plan([
      row({ rowId: 'row-one', valueKey: 'sharedValue' }),
      row({ rowId: 'row-two', valueKey: 'sharedValue' }),
    ])
    expect(sharedKey.fields.map((field) => field.fieldId)).toEqual(['row-one', 'row-two'])
    expect(sharedKey.fields.map((field) => field.valueKey)).toEqual(['sharedValue', 'sharedValue'])

    const duplicateIdentity = plan([
      row({ rowId: 'same-row', valueKey: 'firstValue' }),
      row({ rowId: 'same-row', valueKey: 'secondValue' }),
    ])
    expect(duplicateIdentity.fields).toEqual([])
    expect(duplicateIdentity.rows.map((item) => item.reason)).toEqual([
      'duplicate_field_row_identity',
      'duplicate_field_row_identity',
    ])
  })

  it('blocks conflicting controls even when one row is a special control without a generic schema', () => {
    const result = plan([
      row({ rowId: 'text-row', valueKey: 'sharedValue', type: 'text' }),
      row({ rowId: 'area-row', valueKey: 'sharedValue', type: 'area', required: '1' }),
    ])
    expect(result.fields).toEqual([])
    expect(result.rows.map((item) => item.reason)).toContain('shared_value_key_has_conflicting_control_types')
    expect(result.rows.find((item) => item.rowId === 'area-row')?.specialControl).toEqual({
      kind: 'area', state: 'blocked', reason: 'province_city_county_provider_unverified',
    })
  })

  it('keeps hidden required rows out of the selection gate but retains final-submit obligations', () => {
    const conditional = row({
      rowId: 'dependent',
      required: '1',
      frontEndConfig: { showType: 'placeOrder', showField: 'fixtureMode', showValue: 'on' },
    })

    // fixtureValue is deliberately absent: R1 permits entering the catalog while
    // this field is hidden, but still requires its value at final placeOrder().
    const hidden = plan([conditional], { values: { fixtureMode: 'off' } })
    expect(hidden.rows[0]).toMatchObject({ disposition: 'filtered', reason: 'conditional_visibility_hidden' })
    expect(hidden.diagnostics.requiredBlockerRowIds).toEqual([])
    expect(hidden.rows[0].finalSubmit).toEqual({ state: 'required' })
    expect(hidden.diagnostics.finalSubmitRequiredRowIds).toEqual(['dependent'])
    expect(hidden.diagnostics.finalSubmitBlockedRowIds).toEqual([])

    const hiddenUnsupported = plan([row({
      rowId: 'hidden-unsupported',
      type: 'scan',
      required: '1',
      frontEndConfig: { showType: 'placeOrder', showField: 'fixtureMode', showValue: 'on' },
    })], { values: { fixtureMode: 'off' } })
    expect(hiddenUnsupported.rows[0]).toMatchObject({ disposition: 'filtered', reason: 'conditional_visibility_hidden' })
    expect(hiddenUnsupported.diagnostics.requiredBlockerRowIds).toEqual([])
    expect(hiddenUnsupported.rows[0].finalSubmit).toEqual({ state: 'required' })

    const visible = plan([conditional], { values: { fixtureMode: 'on' } })
    expect(visible.fields[0].visibility).toEqual({ kind: 'equals', path: ['fixtureMode'], value: 'on' })
    expect(visible.rows[0].requiredness).toBe('required')
    expect(visible.rows[0].finalSubmit).toEqual({ state: 'required' })

    const unsupportedVisibility = plan([conditional], { values: { fixtureMode: 1 } })
    expect(unsupportedVisibility.rows[0]).toMatchObject({
      disposition: 'blocked', reason: 'r1_loose_equality_not_equivalent_to_runtime_equality',
    })
    expect(unsupportedVisibility.diagnostics.requiredBlockerRowIds).toEqual(['dependent'])
    // showField is a selection/render concern in R1, not a final-submit waiver.
    expect(unsupportedVisibility.rows[0].finalSubmit).toEqual({ state: 'required' })
    const missingVisibilityDependency = plan([conditional])
    expect(missingVisibilityDependency.rows[0]).toMatchObject({ disposition: 'blocked', reason: 'showField_dependency_missing' })
    expect(missingVisibilityDependency.rows[0].finalSubmit).toEqual({ state: 'required' })
  })

  it('applies dispensable only to final-submit requiredness and blocks unresolved dispensability', () => {
    const required = row({
      required: '1',
      frontEndConfig: { showType: 'placeOrder', dispensableField: 'fixtureMode', dispensableValue: 'skip' },
    })
    const dispensable = plan([required], { values: { fixtureMode: 'skip' } })
    // The value is absent: R1's catalog-entry gate still treats this visible
    // required field as required even though final submission waives it.
    expect(dispensable.fields[0].required).toBe(true)
    expect(dispensable.rows[0].finalSubmit).toEqual({ state: 'optional', reason: 'dispensable_condition_matched' })

    const stillRequired = plan([required], { values: { fixtureMode: 'keep' } })
    expect(stillRequired.fields[0].required).toBe(true)
    expect(stillRequired.rows[0].finalSubmit).toEqual({ state: 'required' })

    const hiddenButDispensable = plan([row({
      rowId: 'hidden-dispensable',
      required: '1',
      frontEndConfig: {
        showType: 'placeOrder',
        showField: 'fixtureVisibility',
        showValue: 'visible',
        dispensableField: 'fixtureMode',
        dispensableValue: 'skip',
      },
    })], { values: { fixtureVisibility: 'hidden', fixtureMode: 'skip' } })
    expect(hiddenButDispensable.rows[0]).toMatchObject({
      disposition: 'filtered', reason: 'conditional_visibility_hidden',
      finalSubmit: { state: 'optional', reason: 'dispensable_condition_matched' },
    })
    expect(hiddenButDispensable.diagnostics.finalSubmitRequiredRowIds).toEqual([])

    const unresolved = plan([required])
    expect(unresolved.rows[0].disposition).toBe('eligible')
    expect(unresolved.fields[0].required).toBe(true)
    expect(unresolved.rows[0].finalSubmit).toMatchObject({ state: 'blocked', reason: 'dispensableField_dependency_missing' })
    expect(unresolved.diagnostics.finalSubmitBlockedRowIds).toEqual(['fixture-row-1'])

    const coercive = plan([required], { values: { fixtureMode: 1 } })
    expect(coercive.rows[0].disposition).toBe('eligible')
    expect(coercive.fields[0].required).toBe(true)
    expect(coercive.rows[0].finalSubmit).toMatchObject({ state: 'blocked', reason: 'r1_loose_equality_not_equivalent_to_runtime_equality' })

    expect(plan([row({ required: 'sometimes' })]).rows[0]).toMatchObject({
      disposition: 'blocked', reason: 'requiredness_encoding_unverified',
    })
    expect(plan([row({ required: 'sometimes' })]).rows[0].finalSubmit).toMatchObject({
      state: 'blocked', reason: 'requiredness_encoding_unverified',
    })
  })

  it('maps only same-typed primitive equality values and blocks unproven coercion pairs', () => {
    const withNumber = row({
      frontEndConfig: { showType: 'placeOrder', showField: 'fixtureFlag', showValue: 1 },
    })
    expect(plan([withNumber], { values: { fixtureFlag: 1 } }).rows[0].disposition).toBe('eligible')
    expect(plan([withNumber], { values: { fixtureFlag: '1' } }).rows[0].disposition).toBe('blocked')
    expect(plan([row({ required: 'true' })]).rows[0].requiredness).toBe('unknown')
  })

  it('models area as a blank/partial/complete three-code path without inventing values', () => {
    expect(classifyOrderAreaPath(undefined)).toEqual({ state: 'blank', path: [] })
    expect(classifyOrderAreaPath([])).toEqual({ state: 'blank', path: [] })
    expect(classifyOrderAreaPath(['110000', '110100'])).toEqual({
      state: 'partial', path: ['110000', '110100'], missingLevels: 1,
    })
    expect(classifyOrderAreaPath(['110000', '110100', '110101'])).toEqual({
      state: 'complete', path: ['110000', '110100', '110101'],
    })
    expect(classifyOrderAreaPath(['110000', '', '110101'])).toMatchObject({ state: 'invalid', reason: 'invalid_code' })
    expect(orderAreaPathFromPickerValues([
      { code: '110000', label: 'synthetic province' },
      { value: '110100', label: 'synthetic city' },
    ])).toMatchObject({ state: 'partial', path: ['110000', '110100'] })
    expect(orderAreaPathFromPickerValues([{ label: 'no supplied code' }])).toMatchObject({ state: 'invalid' })
  })

  it('keeps button as a blocked action, not a text field or serialized value', () => {
    const result = plan([row({ type: 'button', required: '1' })])
    expect(result.rows[0]).toMatchObject({
      disposition: 'blocked',
      requiredness: 'not_applicable',
      specialControl: { kind: 'button', state: 'blocked', reason: 'special_action_not_allowlisted' },
    })
    expect(result.fields).toEqual([])
    expect(projectEligibleOrderExtFieldValues(result, { fixtureValue: 'must-not-serialize' })).toEqual({})
    expect(result.diagnostics.requiredBlockerRowIds).toEqual([])
  })

  it('blocks required file/media until Order.exts persistence semantics are verified', () => {
    for (const type of ['file', 'image']) {
      const result = plan([row({ rowId: `required-${type}`, type, required: '1' })])
      expect(result.rows[0]).toMatchObject({
        disposition: 'blocked',
        requiredness: 'required',
        specialControl: { kind: 'media', state: 'blocked', reason: 'order_media_persistence_unverified' },
      })
      expect(result.diagnostics.requiredBlockerRowIds).toEqual([`required-${type}`])
      expect(result.fields).toEqual([])
    }
  })

  it('blocks unsupported required controls and missing finite option providers', () => {
    const unsupported = plan([row({ type: 'scan', required: '1' })])
    expect(unsupported.rows[0].disposition).toBe('blocked')
    expect(unsupported.diagnostics.requiredBlockerRowIds).toEqual(['fixture-row-1'])

    const missingProvider = plan([row({ type: 'select', required: '1' })])
    expect(missingProvider.rows[0]).toMatchObject({
      disposition: 'blocked',
      provider: { state: 'missing', blocksRuntimeUse: true },
    })
    expect(missingProvider.diagnostics.requiredBlockerRowIds).toEqual(['fixture-row-1'])
  })

  it('preserves checkbox array semantics in the Runtime and keeps the field blocked until its provider is verified', () => {
    expect(normalizeFieldValue('checkbox', ['fixture-option-a', 'fixture-option-b'], undefined, true)).toEqual({
      ok: true,
      value: ['fixture-option-a', 'fixture-option-b'],
    })
    const result = plan([row({
      type: 'checkbox',
      multiple: true,
      valueOption: 'fixture-checkbox-source',
      required: '1',
    })])
    expect(result.rows[0]).toMatchObject({
      disposition: 'blocked',
      provider: { state: 'configured_not_fetched', blocksRuntimeUse: true },
    })
    expect(result.fields).toEqual([])
  })

  it('blocks unmodeled operation semantics rather than treating them as ordinary fields', () => {
    expect(plan([row({ operationType: 'fixture-operation' })]).rows[0]).toMatchObject({
      disposition: 'blocked', reason: 'operation_type_semantics_unverified',
    })
  })

  it('does not promote configured but unverified code/cascade providers to runtime-ready fields', () => {
    for (const [type, valueOption] of [
      ['radio', 'fixture-code-source'],
      ['cascade', 'fixture-cascade-source'],
    ]) {
      const result = plan([row({ type, valueOption, required: '1' })])
      expect(result.rows[0]).toMatchObject({
        disposition: 'blocked',
        provider: { state: 'configured_not_fetched', blocksRuntimeUse: true },
      })
      expect(result.fields).toEqual([])
      expect(result.diagnostics.providerPendingRowIds).toEqual(['fixture-row-1'])
      expect(result.diagnostics.liveRuntimeReady).toBe(false)
    }
  })

  it('preserves unknown prior Order.exts during pure restore and excludes it from supported projection', () => {
    const result = plan([
      row({ rowId: 'editable', valueKey: 'fixtureEditable' }),
      row({ rowId: 'blocked-file', valueKey: 'fixturePhoto', type: 'file', required: '1' }),
      row({ rowId: 'button', valueKey: 'fixtureAction', type: 'button' }),
    ])
    const restored = restoreOrderExtFieldValues({
      fixtureEditable: 'existing synthetic value',
      fixturePhoto: ['opaque prior media'],
      fixtureAction: 'opaque old value',
      fixtureUnknownLegacyKey: { opaque: true },
    }, result)

    expect(restored.values).toEqual({ fixtureEditable: 'existing synthetic value' })
    expect(restored.preservedUnmappedExts).toEqual({
      fixturePhoto: ['opaque prior media'],
      fixtureAction: 'opaque old value',
      fixtureUnknownLegacyKey: { opaque: true },
    })
    expect(projectEligibleOrderExtFieldValues(result, {
      ...restored.values,
      ...restored.preservedUnmappedExts,
    })).toEqual({ fixtureEditable: 'existing synthetic value' })
  })
})
