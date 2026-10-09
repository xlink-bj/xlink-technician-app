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
  if (report.selectionEntry.state === 'unverified' || report.finalRequiredness.state === 'unverified') {
    return {
      title: '草稿核对',
      summary: '维修部位与项目组合已填写；当前工单的附加字段尚未核验，正式报价不可提交。',
      officialSubmissionAllowed: false,
    }
  }
  return {
    title: '草稿核对',
    summary: '本机项目结构和合成字段规则已检查；正式报价仍需核实数据与金额，不可提交。',
    officialSubmissionAllowed: false,
  }
}
