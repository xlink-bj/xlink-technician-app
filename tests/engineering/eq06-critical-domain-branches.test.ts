import { describe, expect, it } from 'vitest'
import {
  appendQuotationGroup, appendQuotationSelection, createEmptyQuotationDraft,
  createQuotationGroup, type QuotationDraft,
} from '@features/work-orders/quotation/model'
import { validateQuotationDraft } from '@features/work-orders/quotation/validation'
import { quotationPackageLayerKey } from '@features/work-orders/quotation/package-configuration'
import { mockCommandFailureFor } from '@adapters/api/mock/scenario-policy'
import { mockCommandScenarioIds } from '@adapters/api/mock/fixtures'

function make(
  context: { repairParts?: readonly string[]; description?: string; area?: string } = {},
): QuotationDraft {
  return appendQuotationGroup(
    createEmptyQuotationDraft('synthetic-work-order', 'synthetic-workflow-node'),
    createQuotationGroup('synthetic-repair-group', {
      repairParts: context.repairParts ?? ['roof'],
      partDescription: context.description ?? 'Synthetic roof waterproofing',
      maintainAreaNum: context.area ?? '3.5',
    }),
  )
}

function withSelection(draft: QuotationDraft, kind: 'material' | 'procedure' | 'measure') {
  return appendQuotationSelection(draft,'synthetic-repair-group',{
    catalogId:'synthetic-'+kind,kind,label:'Synthetic '+kind,
  },'synthetic-selection-'+kind)
}

describe('EQ06 critical quotation domain branch behavior — source-independent', () => {
  it('rejects truly empty draft and invalid scoped repair form fields with exact error identity', () => {
    const empty = createEmptyQuotationDraft('synthetic-work-order','synthetic-workflow-node')
    expect(validateQuotationDraft(empty).issues.map(x=>x.code)).toContain('draft.groups_required')
    const bad = make({repairParts:[],description:'',area:'0'})
    expect(validateQuotationDraft(bad)).toMatchObject({state:'blocked'})
    const issues = validateQuotationDraft(bad).issues
    expect(issues.filter(x=>x.groupId==='synthetic-repair-group').map(x=>x.code)).toEqual(
      expect.arrayContaining([
        'group.repair_parts_required','group.description_required','group.maintain_area_invalid',
      ]),
    )
    expect(issues.every(x=>!x.selectionId)).toBe(true)
  })

  it.each(['-1','0','NaN','Infinity','   '])('rejects invalid area %s without calling any API', area => {
    const result = validateQuotationDraft(make({area}))
    expect(result.state).toBe('blocked')
    expect(result.issues.some(x=>x.field==='maintainAreaNum')).toBe(true)
  })

  it('a standalone Material, Procedure or Measure is not enough to submit an official Order', () => {
    for (const kind of ['material','procedure','measure'] as const) {
      const result = validateQuotationDraft(withSelection(make(),kind))
      expect(result.state).toBe('blocked')
      expect(result.issues.map(x=>x.code)).toContain('group.direct_composition_incomplete')
    }
  })

  it('composition repairs only its targeted group when adding both real catalog line kinds', () => {
    let draft=withSelection(make(),'material')
    expect(validateQuotationDraft(draft).state).toBe('blocked')
    draft=withSelection(draft,'procedure')
    expect(validateQuotationDraft(draft)).toEqual({state:'ready',issues:[]})
    expect(draft.groups).toHaveLength(1)
    expect(draft.groups[0]?.materials).toHaveLength(1)
    expect(draft.groups[0]?.procedures).toHaveLength(1)
  })

  it('local SKU choice explicitly blocks official submission even with complete local direct composition', () => {
    let draft=withSelection(withSelection(make(),'procedure'),'material')
    expect(validateQuotationDraft(draft).state).toBe('ready')
    draft={...draft,groups:draft.groups.map(g=>({
      ...g,
      materials:g.materials.map(m=>({...m,skuChoices:[{
        skuId:'synthetic-sku-unverified',quantity:1,attributes:{color:'synthetic'},
      }]})),
    }))}
    const issues=validateQuotationDraft(draft).issues
    expect(issues.map(x=>x.code)).toContain('material.sku_local_only')
    expect(validateQuotationDraft(draft).state).toBe('blocked')
  })

  it('material Package layers use numeric-equivalent identity, reject false free-form lookups', () => {
    expect(quotationPackageLayerKey('1')).toBe(quotationPackageLayerKey(1))
    expect(quotationPackageLayerKey('01')).toBe(quotationPackageLayerKey(1))
    expect(quotationPackageLayerKey('layer-a')).not.toBe(quotationPackageLayerKey(1))
    expect(quotationPackageLayerKey(undefined)).toBe('missing-layer')
  })

  it('Mock error plans cannot impersonate a legitimate role, intent or backend Order identity', () => {
    expect(mockCommandFailureFor('accept',mockCommandScenarioIds.acceptRetryable)).toBe('retryable')
    expect(mockCommandFailureFor('appointment',mockCommandScenarioIds.appointmentTerminal)).toBe('terminal')
    expect(mockCommandFailureFor('accept',mockCommandScenarioIds.appointmentTerminal)).toBeNull()
    expect(mockCommandFailureFor('appointment','real-work-order-unsafe')).toBeNull()
  })
})
