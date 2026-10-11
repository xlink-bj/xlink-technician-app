import { validateQuotationDraft, type QuotationValidationIssue } from './validation'
import type { QuotationDraft, QuotationGroup } from './model'

/**
 * P1 source-aware MOCK draft review. This report describes LOCAL grouped
 * composition only; it cannot authorize Order.type=1 or interpret SKU read,
 * payment, contract, ExtFields, warranty or commercial prices.
 */
export interface QuotationLocalReviewGroup {
  readonly groupId: string
  readonly position: number
  readonly selectedCount: number
  readonly configuredPackages: number
  readonly hasDirectMaterial: boolean
  readonly state: 'local_complete' | 'needs_input'
  readonly firstIssue?: string
  readonly skuSource: 'unverified'
}
export interface QuotationLocalReview {
  readonly state: 'local_complete' | 'needs_input'
  readonly groups: readonly QuotationLocalReviewGroup[]
  readonly issueCount: number
  readonly officialSubmissionAllowed: false
  readonly skuSource: 'unverified'
  readonly effectiveExtFields: 'unverified'
  readonly pricingAuthority: 'unverified'
  readonly officialOrder: 'not_created'
}
function count(group: QuotationGroup): number {
  return group.projPackages.length + group.procedures.length
    + group.materials.length + group.measures.length
}
function groupIssues(groupId: string, issues: readonly QuotationValidationIssue[]): readonly QuotationValidationIssue[] {
  return issues.filter((issue) => issue.groupId === groupId)
}
export function reviewLocalQuotationForP1(draft: QuotationDraft): QuotationLocalReview {
  const validation = validateQuotationDraft(draft)
  const generalIssue = validation.issues.find((issue) => !issue.groupId)
  const groups: QuotationLocalReviewGroup[] = draft.groups.map((group, i) => {
    const problems = groupIssues(group.groupId, validation.issues)
    const firstIssue = generalIssue?.message ?? problems[0]?.message
    return {
      groupId: group.groupId,
      position: i + 1,
      selectedCount: count(group),
      configuredPackages: group.projPackages.filter((p) => Boolean(p.configuration)).length,
      hasDirectMaterial: group.materials.length > 0,
      state: firstIssue ? 'needs_input' : 'local_complete',
      ...(firstIssue ? { firstIssue } : {}),
      skuSource: 'unverified',
    }
  })
  // Never convert "local_complete" into business or monetary readiness.
  return {
    state: validation.state === 'ready' ? 'local_complete' : 'needs_input',
    groups,
    issueCount: validation.issues.length,
    officialSubmissionAllowed: false,
    skuSource: 'unverified',
    effectiveExtFields: 'unverified',
    pricingAuthority: 'unverified',
    officialOrder: 'not_created',
  }
}
