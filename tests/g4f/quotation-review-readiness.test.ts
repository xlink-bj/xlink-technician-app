import { describe, expect, it } from 'vitest'
import {
  appendQuotationGroup,
  appendQuotationSelection,
  createEmptyQuotationDraft,
  createQuotationGroup,
} from '../../src/features/work-orders/quotation/model'
import { evaluateLocalQuotationPreflight } from '../../src/features/work-orders/quotation/local-preflight'
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
    expect(copy.summary).toContain('附加字段尚未核验')
    expect(copy.summary).toContain('正式报价不可提交')
    expect(copy.officialSubmissionAllowed).toBe(false)
  })
})
