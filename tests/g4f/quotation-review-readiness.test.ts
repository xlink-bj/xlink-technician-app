import { describe, expect, it } from 'vitest'
import {
  appendQuotationGroup,
  appendQuotationSelection,
  createEmptyQuotationDraft,
  createQuotationGroup,
} from '../../src/features/work-orders/quotation/model'
import { evaluateLocalQuotationPreflight } from '../../src/features/work-orders/quotation/local-preflight'
import { createOrderExtFieldEffectivePlan } from '../../src/features/work-orders/quotation/order-extfield-effective-plan'
import { quotationReviewReadinessCopy } from '../../src/features/work-orders/quotation/review-readiness-copy'

const groupDraft = () => appendQuotationGroup(
  createEmptyQuotationDraft('synthetic-wo', 'synthetic-node'),
  createQuotationGroup('group-1', {
    repairParts: ['roof'], partDescription: '屋面檐口局部维修', maintainAreaNum: '12',
  }),
)

describe('commercial mock readiness copy remains bounded to R1 local evidence', () => {
  it('gives actionable context while a repair group is incomplete', () => {
    const report = evaluateLocalQuotationPreflight({ draft: groupDraft(), schemaEvidence: 'unverified' })
    const copy = quotationReviewReadinessCopy(report)
    expect(copy.title).toBe('草稿待完善')
    expect(copy.summary).toContain('一项工序和一项材料')
    expect(copy.officialSubmissionAllowed).toBe(false)
  })

  it('does not equate a complete local draft with verified dynamic fields or official quotation', () => {
    let draft = appendQuotationSelection(groupDraft(), 'group-1', {
      kind: 'procedure', catalogId: 'mock-proc', label: '檐口密封',
    }, 'proc-1')
    draft = appendQuotationSelection(draft, 'group-1', {
      kind: 'material', catalogId: 'mock-mat', label: '弹性密封材料',
    }, 'material-1')
    const report = evaluateLocalQuotationPreflight({ draft, schemaEvidence: 'unverified' })
    expect(report.composition.state).toBe('synthetic_pass')
    expect(report.selectionEntry.state).toBe('unverified')
    expect(report.finalRequiredness.state).toBe('unverified')
    const copy = quotationReviewReadinessCopy(report)
    expect(copy.title).toBe('草稿核对')
    // Commercial UI keeps the unresolved schema state in the report and
    // presents concise operator copy rather than developer-only field jargon.
    expect(copy.summary).toBe('维修部位、项目和数量已填写，报价资料仍待确认；正式订单暂不能提交。')
    expect(copy.officialSubmissionAllowed).toBe(false)
  })
  it('keeps a hidden but required R1 final field in the needs-input state', () => {
    let draft = appendQuotationSelection(groupDraft(), 'group-1', {
      kind: 'procedure', catalogId: 'mock-proc', label: '檐口密封',
    }, 'proc-1')
    draft = appendQuotationSelection(draft, 'group-1', {
      kind: 'material', catalogId: 'mock-mat', label: '弹性密封材料',
    }, 'material-1')
    const extFieldPlan = createOrderExtFieldEffectivePlan([{
      rowId: 'synthetic-required', valueKey: 'requiredMemo', colName: 'order',
      state: 1, showList: [4], type: 'text', required: '1',
      frontEndConfig: { showType: 'placeOrder', showField: 'mode', showValue: 'enabled' },
    }], { stage: 'placeOrder', values: { mode: 'disabled' } })
    const report = evaluateLocalQuotationPreflight({
      draft, schemaEvidence: 'complete_synthetic_fixture', extFieldPlan,
    })
    expect(report.composition.state).toBe('synthetic_pass')
    expect(report.selectionEntry.state).toBe('synthetic_pass')
    expect(report.finalRequiredness.state).toBe('needs_input')
    const copy = quotationReviewReadinessCopy(report)
    expect(copy.title).toBe('草稿待完善')
    expect(copy.summary).toBe('报价资料仍有必填项未完成，请补充后继续核对；暂不能提交正式订单。')
    expect(copy.officialSubmissionAllowed).toBe(false)
  })

})
