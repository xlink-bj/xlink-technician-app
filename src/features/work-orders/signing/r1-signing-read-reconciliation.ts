import type { QuotationOrderBrowseItem, R1ScopedContractSummary } from '@shared/ports'

/**
 * Conservative R1 Order+Contract reconciliation for DISPLAY only.
 * Even an apparently signed record never authorizes a contract, QR/PDF,
 * resend, cancellation, offline or electronic signing command.
 *
 * Sources: R1 workOrder.vue:727-750,772-885,4583-4620,5025-5139.
 */
export type SigningReadStage =
  | 'order_not_verified' | 'contract_not_checked' | 'contract_query_inconclusive'
  | 'record_signed' | 'signing_in_progress' | 'signing_exception'
  | 'conflicting_records' | 'contract_status_unknown'

export interface SigningReadModel {
  readonly stage: SigningReadStage
  readonly title: string
  readonly detail: string
  readonly recordedContractCount: number
  readonly canInitiateElectronicSignature: false
  readonly canInitiateOfflineSignature: false
  readonly canResendSms: false
  readonly canRetrySignature: false
  readonly canCancelContract: false
}

type ReadStatus = 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'

function result(stage: SigningReadStage, title: string, detail: string, count = 0): SigningReadModel {
  return {
    stage, title, detail, recordedContractCount: count,
    canInitiateElectronicSignature: false, canInitiateOfflineSignature: false,
    canResendSms: false, canRetrySignature: false, canCancelContract: false,
  }
}

export function reconcileR1SigningRead(
  officialOrder: Pick<QuotationOrderBrowseItem, 'id' | 'type' | 'processState'> | null | undefined,
  contractRead: { readonly state: ReadStatus; readonly items: readonly R1ScopedContractSummary[] },
): SigningReadModel {
  if (!officialOrder?.id || officialOrder.type !== 1) {
    return result('order_not_verified', '正式订单尚未核验', '不能根据报价草稿或伪造订单入口判断签约。')
  }
  if (contractRead.state !== 'succeeded') {
    return result('contract_not_checked', '合同状态尚未核验',
      '正式订单存在不代表合同已创建。读取不可用、尚未执行或失败时均不推断签约结果。')
  }
  const contracts = contractRead.items.filter(c => c.orderId === officialOrder.id)
  if (contracts.length !== contractRead.items.length || contracts.length > 1) {
    return result('conflicting_records', '合同记录存在归属或多版本歧义',
      '当前结果不足以确认哪份合同有效，需查证已有后台流程，不发起任何操作。', contracts.length)
  }
  if (contracts.length === 0) {
    return result('contract_query_inconclusive', '本次范围内未核验到合同',
      'R1 查询字段与历史存储仍有差异，有限结果为空不等于合同不存在。')
  }
  const contract = contracts[0]!
  const status = contract.contractStatus
  if (contract.state !== 1 || !status) {
    return result('contract_status_unknown', '合同状态无法核验',
      '合同不处于已验证的有效状态，或状态字段未返回。', 1)
  }
  if (status === '10') {
    if (officialOrder.processState === 0 || officialOrder.processState === 4) {
      return result('conflicting_records', '合同与订单阶段尚未一致',
        '合同记录为已签署，但订单仍显示待签或签约处理中。需以后台更新后的真实状态复核。', 1)
    }
    return result('record_signed', '合同记录显示已签署',
      contract.signedDate
        ? '已取得已签署状态及记录中的日期；这仍不是 PDF、签名真实性或当前账号权限证明。'
        : '返回的状态为 10，但未取得签约日期；需要继续核实。', 1)
  }
  if (status === '2') {
    return result('signing_in_progress', '签约处理中',
      '只显示契约锁签约处理中记录，不自动重新发起或重发短信。', 1)
  }
  if (status === '-3') {
    return result('signing_exception', '签约异常，需人工核查',
      'R1 前端“再次签约”与固定版本后端的 -3 早退分支存在差异，不进行盲目重试。', 1)
  }
  return result('contract_status_unknown', '合同状态未映射',
    '保留服务端真实状态；不把未知代码解释为成功或可签署。', 1)
}
