import { describe, expect, it } from 'vitest'
import {
  appendQuotationGroup,
  appendQuotationSelection,
  createEmptyQuotationDraft,
  createQuotationGroup,
  type QuotationDraft,
} from '../../src/features/work-orders/quotation/model'
import {
  createOrderExtFieldEffectivePlan,
  type OrderExtFieldRawRow,
} from '../../src/features/work-orders/quotation/order-extfield-effective-plan'
import { evaluateLocalQuotationPreflight } from '../../src/features/work-orders/quotation/local-preflight'
import type { QuotationEngineResult } from '../../src/features/work-orders/quotation/engine'

const baseRow = (overrides: Partial<OrderExtFieldRawRow> = {}): OrderExtFieldRawRow => ({
  rowId: 'row-1',
  valueKey: 'workDescription',
  colName: 'order',
  state: 1,
  showList: [4],
  required: '1',
  type: 'text',
  frontEndConfig: { showType: 'placeOrder' },
  ...overrides,
})
const planFor = (rows: readonly OrderExtFieldRawRow[], values: Readonly<Record<string, unknown>> = {}) =>
  createOrderExtFieldEffectivePlan(rows, { stage: 'placeOrder', values })

function completeDraft(): QuotationDraft {
  let draft = appendQuotationGroup(
    createEmptyQuotationDraft('mock-workorder', 'mock-workflow-node'),
    createQuotationGroup('group-1', {
      repairParts: ['roof'],
      partDescription: '屋面檐口局部维修',
      maintainAreaNum: '12',
    }),
  )
  draft = appendQuotationSelection(draft, 'group-1', {
    kind: 'procedure', catalogId: 'mock-proc', label: '檐口密封处理',
  }, 'proc-1')
  draft = appendQuotationSelection(draft, 'group-1', {
    kind: 'material', catalogId: 'mock-mat', label: '弹性密封材料',
  }, 'mat-1')
  return draft
}

describe('R1 quotation preflight, pure synthetic evidence', () => {
  const draft = completeDraft()

  it('never authorizes official submit even when synthetic evidence is complete', () => {
    const plan = planFor([baseRow()])
    const result = evaluateLocalQuotationPreflight({
      draft,
      extFieldPlan: plan,
      extFieldValues: { workDescription: '檐口局部维修' },
      schemaEvidence: 'complete_synthetic_fixture',
    })
    expect(result.composition.state).toBe('synthetic_pass')
    expect(result.selectionEntry).toMatchObject({ state: 'synthetic_pass', requiredCount: 1 })
    expect(result.finalRequiredness).toMatchObject({ state: 'synthetic_pass', requiredCount: 1 })
    expect(result.pricing).toBe('unverified')
    expect(result.officialSubmission).toBe('not_authorized')
  })

  it('fails closed on absent or unverified effective schema and on wrong action stage', () => {
    const missing = evaluateLocalQuotationPreflight({ draft, schemaEvidence: 'unverified' })
    expect(missing.selectionEntry.state).toBe('unverified')
    expect(missing.finalRequiredness.diagnostics[0].code).toBe('schema_unverified')
    const notProven = evaluateLocalQuotationPreflight({
      draft, schemaEvidence: 'unverified', extFieldPlan: planFor([baseRow()]),
    })
    expect(notProven.finalRequiredness.state).toBe('unverified')
    const wrongStage = createOrderExtFieldEffectivePlan(
      [baseRow({ frontEndConfig: { showType: 'submitOrder' } })],
      { stage: 'submitOrder' },
    )
    expect(evaluateLocalQuotationPreflight({
      draft, schemaEvidence: 'complete_synthetic_fixture', extFieldPlan: wrongStage,
    }).finalRequiredness.diagnostics[0].code).toBe('stage_mismatch')
  })

  it('does not bypass a hidden required R1 final-submit obligation', () => {
    const plan = planFor([
      baseRow({
        frontEndConfig: { showType: 'placeOrder', showField: 'mode', showValue: 'enabled' },
      }),
    ], { mode: 'disabled' })
    const out = evaluateLocalQuotationPreflight({
      draft, extFieldPlan: plan, schemaEvidence: 'complete_synthetic_fixture',
    })
    expect(out.selectionEntry.state).toBe('synthetic_pass')
    expect(out.selectionEntry.requiredCount).toBe(0)
    expect(out.finalRequiredness).toMatchObject({ state: 'needs_input', requiredCount: 1 })
    expect(out.finalRequiredness.diagnostics[0].code).toBe('required_value_missing')
  })

  it('does not waive visible catalog requiredness when dispensable applies to final submit', () => {
    const rows = [baseRow({
      frontEndConfig: {
        showType: 'placeOrder', dispensableField: 'mode', dispensableValue: 'skip',
      },
    })]
    const matched = planFor(rows, { mode: 'skip' })
    const out = evaluateLocalQuotationPreflight({
      draft, extFieldPlan: matched, schemaEvidence: 'complete_synthetic_fixture',
    })
    expect(out.selectionEntry.state).toBe('needs_input')
    expect(out.finalRequiredness.state).toBe('synthetic_pass')
    expect(out.finalRequiredness.requiredCount).toBe(0)
    const unresolved = planFor(rows)
    const blocked = evaluateLocalQuotationPreflight({
      draft, extFieldPlan: unresolved, schemaEvidence: 'complete_synthetic_fixture',
    })
    expect(blocked.selectionEntry.state).toBe('needs_input')
    expect(blocked.finalRequiredness.state).toBe('unverified')
    expect(blocked.finalRequiredness.diagnostics[0].code).toBe('rule_unresolved')
  })

  it('matches the R1 required-value check for numeric zero versus missing, without guessing complex shapes', () => {
    const plan = planFor([baseRow({ type: 'number', valueKey: 'numberValue' })])
    const mk = (value: unknown) => evaluateLocalQuotationPreflight({
      draft, extFieldPlan: plan, extFieldValues: { numberValue: value },
      schemaEvidence: 'complete_synthetic_fixture',
    }).finalRequiredness
    expect(mk(0).state).toBe('synthetic_pass')
    expect(mk(false).state).toBe('needs_input')
    expect(mk('').state).toBe('needs_input')
    expect(mk([]).state).toBe('needs_input')
    expect(mk({ url: 'synthetic' }).diagnostics[0].code).toBe('value_shape_unverified')
    expect(mk(['synthetic']).state).toBe('unverified')
  })

  it('blocks special controls and provider values rather than treating a present value as verified', () => {
    const special = planFor([baseRow({ type: 'area', valueKey: 'areaValue' })])
    const output = evaluateLocalQuotationPreflight({
      draft, extFieldPlan: special,
      extFieldValues: { areaValue: ['110000', '110100', '110101'] },
      schemaEvidence: 'complete_synthetic_fixture',
    })
    expect(output.finalRequiredness.state).toBe('unverified')
    expect(output.finalRequiredness.diagnostics[0].code).toBe('value_shape_unverified')
    expect(output.officialSubmission).toBe('not_authorized')
  })

  it('keeps local pricing separate from stale engine and official business authorization', () => {
    const plan = planFor([baseRow({ required: '0' })])
    const current = {
      state: 'ready', draftVersion: draft.draftVersion, pricing: {}, payload: {},
    } as unknown as QuotationEngineResult
    const latest = evaluateLocalQuotationPreflight({
      draft, extFieldPlan: plan, schemaEvidence: 'complete_synthetic_fixture',
      engineResult: current,
    })
    expect(latest.pricing).toBe('local_engine_evaluated')
    expect(latest.officialSubmission).toBe('not_authorized')
    const stale = evaluateLocalQuotationPreflight({
      draft, extFieldPlan: plan, schemaEvidence: 'complete_synthetic_fixture',
      engineResult: { ...current, draftVersion: draft.draftVersion - 1 },
    })
    expect(stale.pricing).toBe('unverified')
  })

  it('continues to report incomplete repair-group composition separately', () => {
    const empty = createEmptyQuotationDraft('mock-workorder', 'mock-workflow-node')
    const out = evaluateLocalQuotationPreflight({
      draft: empty, extFieldPlan: planFor([]), schemaEvidence: 'complete_synthetic_fixture',
    })
    expect(out.composition.state).toBe('needs_input')
    expect(out.composition.issues.some((item) => item.code === 'draft.groups_required')).toBe(true)
    expect(out.selectionEntry.state).toBe('synthetic_pass')
    expect(out.officialSubmission).toBe('not_authorized')
  })
})
