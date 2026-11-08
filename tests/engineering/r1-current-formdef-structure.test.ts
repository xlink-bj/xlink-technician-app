import { describe, expect, it } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'
import receipt from '../../contracts/production/technician-role-readonly-20261105/current-formdef-two-pages.json'
import historical from '../../contracts/production/technician-role-readonly-20261105/coverage-f01-f21.json'
import current from '../../contracts/r1-mock-current-evidence.json'
import fixture from '../../contracts/synthetic/r1-current-formdef-59-structure.json'
import { projectCurrentFormDefStructure, validateCurrentFormDefEvidence } from '../../scripts/lib/r1-current-formdef-synthetic.mjs'

// Saved evidence only. No API/Code request, app gate or production value is used.
describe('F04 retained 59-field structure, not complete R1 model equivalence', () => {
  it('reproduces the synthetic fixture from both retained pages instead of generating 59 empty rows', () => {
    expect(projectCurrentFormDefStructure(receipt)).toEqual(fixture)
    expect(fixture).toMatchObject({ total: 59, sourcePageLengths: [50, 9],
      syntheticOnly: true, notForProductionRequests: true,
      classification: 'COMPLETE_FIELD_STRUCTURE_NOT_COMPLETE_MODEL', formPurpose: 'UNKNOWN' })
    expect(fixture.rows).toHaveLength(59)
    expect(new Set(fixture.rows.map(row => row.wire._id)).size).toBe(59)
    // Three repeated value keys represent distinct fields, not duplicate rows.
    expect(new Set(fixture.rows.map(row => row.wire.name)).size).toBe(56)
    expect(fixture.rows.filter(row => row.wire.type === 'file')).toHaveLength(24)
  })

  it('drives the real field mapper without inventing a Survey purpose, type or provider response', () => {
    const definition = formDefinition({ data: fixture.rows.map(row => row.wire), total: 59 },
      asOpaqueId<'FormDefinitionId'>(fixture.definitionId))
    expect(definition.purpose).toBeUndefined()
    expect(definition.fields).toHaveLength(59)
    for (const [index, field] of (definition.fields ?? []).entries()) {
      const row = receipt.evidence.fields.rows[index]
      expect(field).toMatchObject({ fieldId: `synthetic-current-${row.fieldId}`,
        valueKey: row.valueKey, type: row.type, required: row.required === '1', showList: row.showList })
      expect(Boolean(field.multiple)).toBe(row.multiple)
      expect(field.options).toBeUndefined()
      expect(field.operationType).toBeUndefined()
    }
    expect(definition.fields?.filter(field => field.type === 'UNKNOWN')).toHaveLength(2)
    expect(definition.fields?.filter(field => field.visibility).map(field => field.visibility)).toEqual([
      { kind: 'equals', path: 'isMoldRemoved', value: 'value-001' },
      { kind: 'equals', path: 'isMoldRemoved', value: 'value-001' },
    ])
  })

  it('retains unknown controls, configuration loss and provider references as separate limits', () => {
    expect(fixture.limits).toMatchObject({ unknownTypeFields: ['field-004', 'field-058'],
      unretainedConfigurationFields: ['field-018', 'field-028', 'field-029', 'field-051', 'field-053', 'field-058'],
      providerReferences: ['synthetic-code-provider-001', 'synthetic-cascade-provider-001', 'synthetic-code-provider-002'],
      providers: 'NOT_CAPTURED', operationTypes: 'NOT_RETAINED', sourceRuleEquivalence: 'NOT_PROVEN',
      liveParity: 'NOT_VERIFIED', customerValuesIncluded: false, serverWritePermissionTested: false })
    expect(fixture.limits.unretainedMachineKeys).toHaveLength(25)
    expect(fixture.rows.reduce((sum, row) => sum + row.unretainedConfigKeyCount, 0)).toBe(7)
    expect(fixture.rows.every(row => row.operationTypeKnown === false)).toBe(true)
  })

  it('updates current F04 evidence without rewriting the historical capture or promoting F09', () => {
    expect(validateCurrentFormDefEvidence(current.domains[0], receipt, fixture)).toEqual(fixture)
    expect(historical.stats.boundedProductionResponseDomains).toBe(15)
    expect(historical.domains.find(row => row.id === 'F04')?.productionObservation)
      .toBe('REFERENCE_ONLY_NO_CURRENT_FIELDS')
    expect(current.domains.map(row => row.id)).toEqual(['F04'])
    expect(current.r1Baseline).toEqual({
      frontend: 'xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d',
      backend: 'xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e',
    })
  })

  it.each(['missing-row', 'duplicate-id', 'inconsistent-total', 'one-page', 'converted-primitive',
    'invented-provider', 'invented-purpose', 'customer-data', 'mutation'])(
    'rejects incomplete or expanded evidence: %s', change => {
      const copy = structuredClone(receipt)
      if (change === 'missing-row') copy.evidence.fields.rows.pop()
      if (change === 'duplicate-id') copy.evidence.fields.rows[1].fieldId = copy.evidence.fields.rows[0].fieldId
      if (change === 'inconsistent-total') copy.diagnostics[1].reportedTotal = 60
      if (change === 'one-page') copy.diagnostics.pop()
      if (change === 'converted-primitive') Object.assign(copy.evidence.fields.rows[0], { required: true })
      if (change === 'invented-provider') copy.evidence.providerReads = 'COMPLETE'
      if (change === 'invented-purpose') copy.evidence.formPurpose = 'survey'
      if (change === 'customer-data') copy.evidence.customerValuesRead = true
      if (change === 'mutation') copy.productionBusinessMutationNetworkRequests = 1
      expect(() => projectCurrentFormDefStructure(copy)).toThrow('R1_FORMDEF_EVIDENCE_BLOCKED')
    },
  )

  it.each(['unknown-types', 'missing-config', 'provider-read', 'model-complete', 'live-parity', 'write-permission'])(
    'rejects promotion or erased limitations: %s', change => {
      const projection = structuredClone(fixture), observation = structuredClone(current.domains[0])
      if (change === 'unknown-types') projection.limits.unknownTypeFields = []
      if (change === 'missing-config') projection.limits.unretainedConfigurationFields = []
      if (change === 'provider-read') projection.limits.providers = 'COMPLETE'
      if (change === 'model-complete') observation.productionObservation = 'COMPLETE_MODEL'
      if (change === 'live-parity') observation.liveParity = 'PASS'
      if (change === 'write-permission') observation.serverBusinessWritePermissionTested = true
      expect(() => validateCurrentFormDefEvidence(observation, receipt, projection))
        .toThrow('UNPROVEN_MODEL_PROMOTION_OR_FIXTURE_DRIFT')
    },
  )
})
