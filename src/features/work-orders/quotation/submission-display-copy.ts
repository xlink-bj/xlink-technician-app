import type { QuotationOrderSubmissionState } from './order-submission'

/** The source-specific UI wording, not a change to the server receipt contract.
 * Ordinary successful submissions still describe the authoritative readback;
 * only the explicitly selected local A-stage Mock flow describes local proof. */
export function quotationSubmissionDisplayCopy(input: {
  readonly state: QuotationOrderSubmissionState
  readonly message?: string
  readonly aStageMockOrder: boolean
}): string | undefined {
  if (input.aStageMockOrder && input.state === 'succeeded') {
    return '本机 Mock 订单已完成本地回读；未提交真实业务后台。'
  }
  return input.message
}
