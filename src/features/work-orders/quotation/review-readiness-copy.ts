import type { LocalQuotationPreflight } from './local-preflight'

/** Business-first preview copy only; cannot authorize a real quotation. */
export interface QuotationReviewReadinessCopy {
  readonly title: '草稿待完善' | '草稿核对'
  readonly summary: string
  readonly officialSubmissionAllowed: false
}

export function quotationReviewReadinessCopy(report: LocalQuotationPreflight): QuotationReviewReadinessCopy {
  if (report.composition.state !== 'synthetic_pass') {
    const first = report.composition.issues[0]
    return {
      title: '草稿待完善',
      summary: first ? first.message : '请核对维修部位和项目组合。',
      officialSubmissionAllowed: false,
    }
  }
  // Required fields must not be presented as already reviewed, even when
  // the repair-group composition itself is complete (R1 final requiredness
  // may include conditionally hidden fields).
  if (report.selectionEntry.state === 'needs_input' || report.finalRequiredness.state === 'needs_input') {
    return {
      title: '草稿待完善',
      summary: '报价资料仍有必填项未完成，请补充后继续核对；暂不能提交正式订单。',
      officialSubmissionAllowed: false,
    }
  }
  if (report.selectionEntry.state === 'unverified' || report.finalRequiredness.state === 'unverified') {
    return {
      title: '草稿核对',
      summary: '维修部位、项目和数量已填写，报价资料仍待确认；正式订单暂不能提交。',
      officialSubmissionAllowed: false,
    }
  }
  return {
    title: '草稿核对',
    summary: '维修部位与项目明细已填写；完成资料和金额确认前不能提交正式订单。',
    officialSubmissionAllowed: false,
  }
}
