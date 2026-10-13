import { describe, expect, it } from 'vitest'
import { reviewLocalQuotationForP1 } from '@features/work-orders/quotation/local-review-closure'
import { createQuotationGroup, type QuotationDraft, type QuotationGroup } from '@features/work-orders/quotation/model'

const packageSelection = {
  selectionId: 's-pkg', kind: 'package' as const,
  catalogId: 'synthetic-package', label: '合成套餐', quantity: 1,
  configuration: {
    procedures: [{ providerComponentId: 'p', catalogId: 'proc', label: '工序' }],
    materials: [
      { providerComponentId: 'layer-a', catalogId: 'spu-a', label: '材料 A', layer: '1' },
      { providerComponentId: 'layer-b', catalogId: 'spu-b', label: '材料 B', layer: 2 },
    ],
    measures: [],
  },
}
const direct = {
  selectionId: 's-direct', kind: 'material' as const,
  catalogId: 'synthetic-spu', label: '合成直接材料', quantity: 2,
}
const base = (id: string): QuotationGroup => ({
  ...createQuotationGroup(id),
  repairParts: ['synthetic-roof'],
  partDescription: '本机模拟渗漏维修',
  maintainAreaNum: '12',
})
const draft = (groups: readonly QuotationGroup[]): QuotationDraft => ({
  workOrderId: 'mock-work-order-019-continuous-journey',
  workflowNodeId: 'synthetic-place-order',
  draftVersion: 3,
  groups,
})
describe('P1 grouped quotation local review never constitutes an official Order', () => {
  it('reviews a configured package group without inferring SKU authority or money', () => {
    const result = reviewLocalQuotationForP1(draft([{ ...base('g1'), projPackages: [packageSelection] }]))
    expect(result.state).toBe('local_complete')
    expect(result.groups).toMatchObject([{ groupId: 'g1', configuredPackages: 1, selectedCount: 1, state: 'local_complete' }])
    expect(result.skuSource).toBe('unverified')
    expect(result.pricingAuthority).toBe('unverified')
    expect(result.officialSubmissionAllowed).toBe(false)
    expect(result.officialOrder).toBe('not_created')
  })
  it('separates two repair groups and preserves both selection identities', () => {
    const g1 = { ...base('g1'), projPackages: [packageSelection] }
    const g2 = {
      ...base('g2'), procedures: [{ ...direct, kind: 'procedure' as const, selectionId: 's-proc' }],
      materials: [direct],
    }
    const result = reviewLocalQuotationForP1(draft([g1, g2]))
    expect(result.state).toBe('local_complete')
    expect(result.groups.map((g) => [g.groupId, g.selectedCount, g.configuredPackages]))
      .toEqual([['g1', 1, 1], ['g2', 2, 0]])
    expect(result.groups[1].hasDirectMaterial).toBe(true)
  })
  it('reports a missing group description without blaming a different group', () => {
    const g1 = { ...base('g1'), projPackages: [packageSelection] }
    const g2 = { ...base('g2'), partDescription: '', materials: [direct] }
    const result = reviewLocalQuotationForP1(draft([g1, g2]))
    expect(result.state).toBe('needs_input')
    expect(result.groups[0].state).toBe('local_complete')
    expect(result.groups[1].state).toBe('needs_input')
    expect(result.groups[1].firstIssue).toContain('维修部位描述')
  })
  it('does not treat one direct Material without Procedure as a complete group', () => {
    const result = reviewLocalQuotationForP1(draft([{ ...base('g1'), materials: [direct] }]))
    expect(result.state).toBe('needs_input')
    expect(result.groups[0].firstIssue).toContain('工序')
  })
  it('flags unconfigured package and restores the status when configuration appears', () => {
    const incomplete = { ...packageSelection, configuration: undefined }
    const blocked = reviewLocalQuotationForP1(draft([{ ...base('g1'), projPackages: [incomplete] }]))
    const ready = reviewLocalQuotationForP1(draft([{ ...base('g1'), projPackages: [packageSelection] }]))
    expect(blocked.groups[0].state).toBe('needs_input')
    expect(blocked.groups[0].firstIssue).toContain('套餐配置')
    expect(ready.groups[0].state).toBe('local_complete')
  })
  it('retains the workflow/local identity blocker, never promotes a broken draft', () => {
    const broken = { ...draft([{ ...base('g1'), projPackages: [packageSelection] }]), workflowNodeId: '' }
    const result = reviewLocalQuotationForP1(broken)
    expect(result.state).toBe('needs_input')
    expect(result.groups[0].state).toBe('needs_input')
    expect(result.officialSubmissionAllowed).toBe(false)
  })
  it('stays unverified even with a complete local repair group and positive quantities', () => {
    const result = reviewLocalQuotationForP1(draft([{ ...base('g1'), projPackages: [packageSelection] }]))
    expect(result.effectiveExtFields).toBe('unverified')
    expect(result.skuSource).toBe('unverified')
    expect(result.pricingAuthority).toBe('unverified')
    expect('total' in result).toBe(false)
    expect('amount' in result).toBe(false)
  })
  it('does not mutate the original draft or introduce SKU identifiers', () => {
    const source = draft([{ ...base('g1'), projPackages: [packageSelection] }])
    const before = JSON.stringify(source)
    const result = reviewLocalQuotationForP1(source)
    expect(JSON.stringify(source)).toBe(before)
    expect('skuId' in result.groups[0]).toBe(false)
  })
})
