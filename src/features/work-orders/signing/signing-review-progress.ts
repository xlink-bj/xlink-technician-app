import type { SigningReadStage } from './r1-signing-read-reconciliation'

type ContractReadState = 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
type HandlerReadState = 'idle' | 'loading' | 'verified' | 'blocked'

export interface SigningProgress {
  readonly title: string
  readonly nextStep: string
  readonly executable: false
}

/** Read-only state guidance; never an entitlement to sign or to send messages. */
export function signingReviewProgress(input: {
  readonly orderVerified: boolean
  readonly contractState: ContractReadState
  readonly stage: SigningReadStage
  readonly handlerState: HandlerReadState
}): SigningProgress {
  const show = (title: string, nextStep: string): SigningProgress =>
    ({ title, nextStep, executable: false })
  if (!input.orderVerified) return show('步骤 1/3 · 正式订单待核验',
    '从当前角色可见的工单进入，核验准确的正式订单身份。')
  if (input.contractState === 'loading') return show('步骤 2/3 · 正在核验合同',
    '等待有限只读结果；不创建合同，也不重发任何消息。')
  if (input.contractState === 'failed_retryable') return show('步骤 2/3 · 合同读取失败',
    '仅可重新执行有界只读核验，禁止重试签约命令。')
  if (input.contractState === 'failed_terminal') return show('步骤 2/3 · 合同核验受阻',
    '需要核对当前角色、工单归属及已有接口，不可推断合同状态。')
  if (input.contractState === 'idle') return show('步骤 2/3 · 合同尚未核验',
    '在获准的隔离 DEV 环境手动核验合同；真实环境仍保持阻断。')
  if (input.stage === 'signing_in_progress') return show('步骤 3/3 · 等待外部签署',
    '只读状态显示处理中；禁止再次发起或重复发送短信。')
  if (input.stage === 'record_signed') return show('步骤 3/3 · 已取得签约状态记录',
    '仅表示后端状态回读；合同文件、签名真实性与角色权限仍待核实。')
  if (['signing_exception', 'conflicting_records', 'contract_status_unknown'].includes(input.stage))
    return show('步骤 3/3 · 签约状态需要人工核查',
      '不得根据异常状态自动重签、取消或发送客户消息。')
  return show(input.handlerState === 'verified'
    ? '步骤 3/3 · 当前节点候选已核验（仅 DEV）'
    : '步骤 3/3 · 当前节点处理人尚未核验',
  '仅可查看 R1 操作前置条件，不具有实际签署权限。')
}
