import { describe, expect, it } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { mockSyntheticDynamicFormDefinitionId,
  mockSyntheticStage2BFormDefinitionResponse } from '@adapters/api/mock/fixtures'
import { asOpaqueId } from '@shared/types'
import { validateR1SpecialMockFields, type R1SpecialMockFields } from '@features/work-orders/r1-special-mock-form-fields'

const definition = formDefinition(mockSyntheticStage2BFormDefinitionResponse,
  asOpaqueId<'FormDefinitionId'>(mockSyntheticDynamicFormDefinitionId))
const valid: R1SpecialMockFields = {
  inspectionSummary: '屋面复核完成', inspectionResult: 'safe',
  inspectionContactPhone: '0013800100200',
  inspectionIdentityNumber: '000100200300400500',
  inspectionPointCount: '12', inspectionMeasuredArea: '12.50',
  inspectionConfirmed: '0', inspectionCategory: 'roof',
}

describe('Stage 2B R1 source-shaped primitive FormDef write contract', () => {
  it('normalizes only the verified scalar types, preserving leading zeros and R1 switch wire strings', () => {
    expect(definition.fields).toHaveLength(10)
    expect(validateR1SpecialMockFields(definition, valid)).toEqual({ ok: true, fields: {
      inspectionSummary: '屋面复核完成', inspectionResult: 'safe',
      inspectionContactPhone: '0013800100200',
      inspectionIdentityNumber: '000100200300400500',
      inspectionPointCount: 12, inspectionMeasuredArea: 12.5,
      inspectionConfirmed: '0', inspectionCategory: 'roof',
    } })
  })

  it('blocks unsafe numbers, high precision loss and invalid R1 switch encodings', () => {
    for (const [key, value] of [
      ['inspectionPointCount', '1.2'], ['inspectionPointCount', '9007199254740993'],
      ['inspectionMeasuredArea', 'NaN'], ['inspectionMeasuredArea', '1.234567890123456789'],
      ['inspectionConfirmed', true], ['inspectionConfirmed', 'true'],
    ] as const) {
      expect(validateR1SpecialMockFields(definition, { ...valid, [key]: value }).ok).toBe(false)
    }
  })

  it('rejects numeric phone/ID coercion, unknown select options and presentation image submissions', () => {
    for (const [key, value] of [
      ['inspectionContactPhone', 13800100200],
      ['inspectionIdentityNumber', 100200300400500],
      ['inspectionCategory', 'unknown-code'],
      ['inspectionPhoto', 'unverified-local-file.jpg'],
    ] as const) {
      expect(validateR1SpecialMockFields(definition, { ...valid, [key]: value }).ok).toBe(false)
    }
  })

  it('fails closed for required options sourced from an unverified provider or read-only inputs', () => {
    const withProvider = { ...definition, fields: definition.fields?.map(field =>
      field.valueKey === 'inspectionCategory'
        ? { ...field, required: true, valueOption: 'unverified-provider' } : field) }
    expect(validateR1SpecialMockFields(withProvider, valid).ok).toBe(false)
    const withReadOnly = { ...definition, fields: definition.fields?.map(field =>
      field.valueKey === 'inspectionContactPhone' ? { ...field, readOnly: true } : field) }
    expect(validateR1SpecialMockFields(withReadOnly, valid).ok).toBe(false)
    const withRequired = { ...definition, fields: definition.fields?.map(field =>
      field.valueKey === 'inspectionPointCount' ? { ...field, required: true } : field) }
    const { inspectionPointCount: _omitted, ...withoutCount } = valid
    expect(validateR1SpecialMockFields(withRequired, withoutCount).ok).toBe(false)
  })

  it('does not submit a conditionally hidden value or a field from outside the definition', () => {
    const conditional = { ...definition, fields: definition.fields?.map(field =>
      field.valueKey === 'inspectionContactPhone'
        ? { ...field, visibility: { kind: 'equals' as const,
          path: 'inspectionResult', value: 'follow_up' } } : field) }
    expect(validateR1SpecialMockFields(conditional, valid).ok).toBe(false)
    const { inspectionContactPhone: _omitted, ...withoutPhone } = valid
    expect(validateR1SpecialMockFields(conditional, withoutPhone).ok).toBe(true)
    expect(validateR1SpecialMockFields(definition, { ...valid, injectedField: 'untrusted' }).ok).toBe(false)
  })
  it('validates visible dependencies against the entire submission regardless of field row order', () => {
    const conditional = { ...definition, fields: definition.fields?.map(field =>
      field.valueKey === 'inspectionContactPhone'
        ? { ...field, required: true, visibility: { kind: 'equals' as const,
          path: 'inspectionResult', value: 'safe' } } : field) }
    const reordered = { ...conditional, fields: [...conditional.fields!].reverse() }
    expect(validateR1SpecialMockFields(conditional, valid).ok).toBe(true)
    expect(validateR1SpecialMockFields(reordered, valid)).toEqual(
      validateR1SpecialMockFields(conditional, valid))
    const { inspectionContactPhone: _phone, ...missing } = valid
    expect(validateR1SpecialMockFields(reordered, missing).ok).toBe(false)
    expect(validateR1SpecialMockFields(reordered, { ...valid, inspectionResult: 'follow_up' }).ok).toBe(false)
  })

  it('uses resolved business-record choices in special submissions without a code-provider fallback', () => {
    const resolved = { ...definition, fields: definition.fields!.map(field =>
      field.valueKey === 'inspectionCategory' ? { ...field, type: 'bizSelect',
        valueOption: 'projPackage', multiple: true,
        options: [{ value: 'package-a', label: '套餐一' }, { value: 'package-b', label: '套餐二' }] } : field) }
    expect(validateR1SpecialMockFields(resolved, { ...valid, inspectionCategory: ['package-b', 'package-a'] }))
      .toMatchObject({ ok: true, fields: { inspectionCategory: ['package-b', 'package-a'] } })
    for (const value of [['forged'], ['package-a', 'package-a'], 'package-a']) {
      expect(validateR1SpecialMockFields(resolved, { ...valid, inspectionCategory: value }).ok).toBe(false)
    }
    for (const change of [{ options: undefined }, { valueOption: 'unverified' }]) {
      const denied = { ...resolved, fields: resolved.fields.map(field =>
        field.type === 'bizSelect' ? { ...field, ...change } : field) }
      expect(validateR1SpecialMockFields(denied, { ...valid, inspectionCategory: ['package-a'] }).ok).toBe(false)
    }
  })

})
