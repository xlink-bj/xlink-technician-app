import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildSurveyCapabilityInventory } from '../../scripts/survey-capabilities.mjs'

const contractFile = fileURLToPath(new URL('../../contracts/beta/survey/historical.json', import.meta.url))
type CapabilityRow = {
  readonly valueKey: string
  readonly capabilityClass: string
  readonly implementationStatus: string
}

describe('G4-E Survey capability matrix', () => {
  it('classifies every mobile-detail row from the historical contract', () => {
    const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
    const inventory = buildSurveyCapabilityInventory(contract)

    expect(contract.fieldRows).toHaveLength(61)
    expect(inventory.mobileDetailFieldCount).toBe(45)
    expect(inventory.classifiedFieldCount).toBe(45)
    expect(inventory.capabilities).toHaveLength(45)
    expect(new Set(inventory.capabilities.map((row: { fieldId: string }) => row.fieldId)).size).toBe(45)
    expect(inventory.capabilities.map((row: { fieldId: string }) => row.fieldId)).toEqual(
      contract.fieldRows
        .filter((row: { showList: string[] }) => row.showList.includes('4'))
        .map((row: { fieldId: string }) => row.fieldId),
    )
  })

  it('keeps unresolved special controls explicit instead of classifying them as generic inputs', () => {
    const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
    const inventory = buildSurveyCapabilityInventory(contract)
    const byValueKey = new Map<string, CapabilityRow>(inventory.capabilities.map((row: CapabilityRow) => [row.valueKey, row]))

    expect(byValueKey.get('leakageCause')?.capabilityClass).toBe('CUSTOM_EXPERIENCE')
    expect(byValueKey.get('leakageCause')?.implementationStatus).toBe('UNKNOWN')
    expect(byValueKey.get('serviceGoods')?.capabilityClass).toBe('CUSTOM_EXPERIENCE')
    expect(byValueKey.get('serviceGoods')?.implementationStatus).toBe('UNKNOWN')
    expect(byValueKey.get('surveyDrawing')?.implementationStatus).toBe('PARTIAL')
  })

  it('uses the effective ext condition when the root showValue is empty', () => {
    const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
    const inventory = buildSurveyCapabilityInventory(contract)
    const sourceField = contract.fieldRows.find((row: { fieldId: string }) => row.fieldId === 'survey-field-018')
    const matrixRow = inventory.capabilities.find((row: { fieldId: string }) => row.fieldId === 'survey-field-018')

    expect(sourceField.showValue).toBe('')
    expect(sourceField.extsShowValue).toEqual(expect.any(Array))
    expect(matrixRow?.conditionalVisibility).toContain(`effectiveShowValue=${JSON.stringify(sourceField.extsShowValue)}`)
    expect(matrixRow?.conditionalVisibility).toContain('来源：extsShowValue')
    expect(matrixRow?.conditionalVisibility).not.toContain('effectiveShowValue=""')
  })

  it('uses frontEndConfig visibility before root or ext conditions', () => {
    const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
    const inventory = buildSurveyCapabilityInventory(contract)
    const sourceField = contract.fieldRows.find((row: { fieldId: string }) => row.fieldId === 'survey-field-054')
    const matrixRow = inventory.capabilities.find((row: { fieldId: string }) => row.fieldId === 'survey-field-054')

    expect(sourceField.frontEndConfig).toMatchObject({ showField: 'isMoldRemoved', showValue: expect.any(String) })
    expect(matrixRow?.conditionalVisibility).toContain(`effectiveShowValue=${JSON.stringify(sourceField.frontEndConfig.showValue)}`)
    expect(matrixRow?.conditionalVisibility).toContain('来源：frontEndConfig.showValue')
  })
})
