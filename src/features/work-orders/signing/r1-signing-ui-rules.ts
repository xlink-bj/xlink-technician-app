/**
 * R1 source-derived DISPLAY conditions only. These do not grant backend roles,
 * electronic-signature capabilities, SMS, PDF or Contract read access.
 *
 * Source: xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d
 * business/subpackages2/workOrder/workOrder.vue:727-750,844-884,5077-5139.
 */
type R1Code = string | number | null | undefined
const code = (value: R1Code): string | null => {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return value
  return null
}

export interface R1SigningOrderDisplay {
  readonly type?: R1Code
  readonly processState?: R1Code
  readonly hasExts: boolean
  readonly isAgain?: R1Code
}

export interface R1SigningContractDisplay {
  readonly state?: R1Code
  readonly contractStatus?: R1Code
  readonly endDate?: string | null
  readonly fileUrls?: readonly string[] | null
}

export function r1InitialSigningButtonVisibility(order: R1SigningOrderDisplay): {
  readonly electronic: boolean
  readonly offline: boolean
} {
  // R1 buttons require type 1, processState 0, exts.isAgain != 1.
  // If the extension record has not been read, never infer eligibility.
  const visible = order.hasExts
    && code(order.type) === '1'
    && code(order.processState) === '0'
    && code(order.isAgain) !== '1'
  return { electronic: visible, offline: visible }
}

export function r1ContractButtonVisibility(contract: R1SigningContractDisplay): {
  readonly cancel: boolean
  readonly tryAgain: boolean
  readonly resendSms: boolean
  readonly viewFile: boolean
} {
  const status = code(contract.contractStatus)
  return {
    cancel: code(contract.state) === '1'
      && !contract.endDate && (status === '10' || status === '2' || status === '-3'),
    tryAgain: status === '-3',
    resendSms: status === '2',
    viewFile: Boolean(contract.fileUrls?.length && contract.fileUrls[contract.fileUrls.length - 1]?.trim()),
  }
}

/** An informational read-only label; unknown status never means "signed". */
export function r1OrderSigningStageNotice(processState: number | undefined): string {
  if (processState === 0) return 'R1 订单阶段：待签约。仅表示订单状态，不代表当前账号获准签约。'
  if (processState === 4) return 'R1 订单阶段：签约处理中。请勿重复发起，需从正式订单／合同读取结果核实后续状态。'
  return 'R1 签约阶段尚不可确认。不可据此推断合同已签署或可支付。'
}


/** UI copy for a sanitized, existing Contract row; never authorizes signing. */
export function r1ContractStatusReadNotice(status: string | undefined): string {
  if (status === '10') return 'R1 合同记录：已签署（状态 10）；需以实际后台状态为准'
  if (status === '2') return 'R1 合同记录：签署处理中（状态 2）；不可重复发起'
  if (status === '-3') return 'R1 合同记录：签署异常（状态 -3）；再次签约效果待核验'
  return 'R1 合同状态尚未核验；不能推断已签署或可发起'
}
