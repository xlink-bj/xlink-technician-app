import { describe, expect, it } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { mockSyntheticDynamicFormDefinitionId, mockSyntheticStage2BFormDefinitionResponse,
  mockSyntheticStage2CFormDefinitionResponse } from '@adapters/api/mock/fixtures'
import { asOpaqueId } from '@shared/types'
import { projectR1LocalFields, normalizeR1LocalFieldPatch } from '@features/work-orders/r1-local-form-fields'
import { validateR1SpecialMockFields } from '@features/work-orders/r1-special-mock-form-fields'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'

const definitionId = asOpaqueId<'FormDefinitionId'>(mockSyntheticDynamicFormDefinitionId)
const full = formDefinition(mockSyntheticStage2CFormDefinitionResponse, definitionId)
const primitive = formDefinition(mockSyntheticStage2BFormDefinitionResponse, definitionId)
const base = { inspectionSummary: '平屋顶排水复查', inspectionResult: 'safe' }
const arrays = { inspectionChecks: ['drain', 'parapet'], inspectionLocation: ['roof', 'drain'] }

describe('R1 source-backed checkbox and cascade arrays', () => {
  it('projects verified inline options without discarding cascade hierarchy', () => {
    const fields = projectR1LocalFields(full)
    expect(fields.find(field => field.valueKey === 'inspectionChecks')).toMatchObject({
      supported: true, type: 'checkbox', multiple: true,
    })
    const location = fields.find(field => field.valueKey === 'inspectionLocation')
    expect(location).toMatchObject({ supported: true, type: 'cascade', multiple: false })
    expect(location?.options[0]).toMatchObject({
      value: 'roof', children: [{ value: 'drain' }, { value: 'parapet' }],
    })
  })

  it('normalizes and preserves the exact ordered FormData arrays', () => {
    const checked = validateR1SpecialMockFields(full, { ...base, ...arrays })
    expect(checked).toMatchObject({ ok: true, fields: { ...base, ...arrays } })
    const wire = r1SpecialFormUpsert({
      sourceNodeType: 'forms', definitionId,
      formData: checked.ok ? checked.fields : {},
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-020-local-forms'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-020-forms'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('mock-workflow-run-020'), state: 1,
    })
    const sent = JSON.parse(String(wire.body?.dataStr)) as Record<string, unknown>
    expect(sent.inspectionChecks).toEqual(['drain', 'parapet'])
    expect(sent.inspectionLocation).toEqual(['roof', 'drain'])
    expect(wire.path).toBe('biz/extForm/upsert/' + definitionId)
  })

  it('rejects fabricated paths, duplicate choices, scalar arrays and oversized values', () => {
    for (const patch of [
      { inspectionChecks: ['drain', 'drain'] },
      { inspectionChecks: 'drain' },
      { inspectionChecks: Array.from({ length: 31 }, () => 'drain') },
      { inspectionLocation: ['roof', 'pipe'] },
      { inspectionLocation: 'roof' },
      { inspectionLocation: ['bath', 'parapet'] },
    ]) {
      expect(validateR1SpecialMockFields(full, { ...base, ...arrays, ...patch }).ok).toBe(false)
    }
  })

  it('keeps schema scope and optional clear as a local-only draft transition', () => {
    expect(validateR1SpecialMockFields(primitive, { ...base, ...arrays }).ok).toBe(false)
    const withChoices = normalizeR1LocalFieldPatch(full, base, 'inspectionChecks', ['drain'])
    expect(withChoices?.inspectionChecks).toEqual(['drain'])
    const cleared = normalizeR1LocalFieldPatch(full, withChoices!, 'inspectionChecks', [])
    expect(cleared).not.toHaveProperty('inspectionChecks')
    // Clearing an existing server record still needs a verified upsert deletion
    // contract and is deliberately fenced by the transaction controller.
  })

  it('rejects raw arrays that do not belong to an R1 array field', () => {
    expect(validateR1SpecialMockFields(full, {
      ...base, inspectionSummary: ['roof'],
    } as never).ok).toBe(false)
    expect(() => r1SpecialFormUpsert({
      sourceNodeType: 'forms', definitionId,
      formData: { injected: [['nested']] } as never,
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-node'), state: 1,
    })).toThrow(/bounded scalar or path array/)
  })
})
