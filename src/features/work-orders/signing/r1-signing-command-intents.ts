import type { QuotationOrderBrowseItem, R1ScopedContractSummary } from '@shared/ports'
import { isSigningReadOrderCandidate } from '@shared/signing-order-read-policy'

/** Fixed R1 business action names. THIS IS A PREPARATION CONTRACT, not an executable client. */
export type R1SigningIntentKind = 'electronic' | 'offline' | 'resign' | 'resend_sms' | 'cancel'
export type R1SigningIntentAssessment = 'candidate' | 'blocked' | 'source_conflict'

export interface R1SigningIntentDescriptor {
  readonly kind: R1SigningIntentKind
  readonly title: string
  readonly route: string
  /** R1 osg.ajax HTTP method is not established by @RequestMapping; never guess it. */
  readonly transportMethod: 'R1_AJAX_METHOD_UNVERIFIED'
  readonly source: string
  readonly effect: string
  readonly expectedReadback: string
  readonly businessMutation: true
}

const source = 'xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages2/workOrder/workOrder.vue'
export const r1SigningIntentDescriptors: Readonly<Record<R1SigningIntentKind, R1SigningIntentDescriptor>> = {
  electronic: {
    kind: 'electronic', title: '发起电子签约', route: 'signature/applyForElectronicSignature',
    transportMethod: 'R1_AJAX_METHOD_UNVERIFIED', source: source + ':5117-5139',
    effect: '生成合同/PDF、变更订单 processState、发起外部电子签约，可能异步发送客户短信',
    expectedReadback: '重新读取正式订单及合同；HTTP 成功只意味着命令受理，不证明客户已签署',
    businessMutation: true,
  },
  offline: {
    kind: 'offline', title: '发起线下签约', route: 'signature/applyForElectronicSignature.do',
    transportMethod: 'R1_AJAX_METHOD_UNVERIFIED', source: source + ':5077-5115',
    effect: 'type=1 激活线下合同，可能生成 PDF 和变更订单 processState',
    expectedReadback: '重新读取正式订单及合同；不把请求成功等同于客户签名',
    businessMutation: true,
  },
  resign: {
    kind: 'resign', title: '再次签约', route: 'signature/againApplyForElectronicSignature',
    transportMethod: 'R1_AJAX_METHOD_UNVERIFIED', source: source + ':5231-5245',
    effect: '可能清除 signedDate、更新订单 processState 并重新发起外部签约',
    expectedReadback: '重新读取合同、订单状态及签名字段；必须处理异步完成与重复触发',
    businessMutation: true,
  },
  resend_sms: {
    kind: 'resend_sms', title: '重新发送签约短信', route: 'signature/handleReminderContract',
    transportMethod: 'R1_AJAX_METHOD_UNVERIFIED', source: source + ':5246-5260',
    effect: '向签署人发出消息；可能不改变合同状态，禁止自动重试',
    expectedReadback: '保留请求受理与客户实际收信的区别；必须单独核实发送记录',
    businessMutation: true,
  },
  cancel: {
    kind: 'cancel', title: '取消合同', route: 'basic/contract/remove',
    transportMethod: 'R1_AJAX_METHOD_UNVERIFIED', source: source + ':5199-5229',
    effect: '永久性业务合同变更；R1 workType=2 还要求填写取消原因',
    expectedReadback: '重新读取合同状态；撤销必须由既有后端和客户协议证据确认',
    businessMutation: true,
  },
}

export interface R1SigningIntentContext {
  readonly workOrderId: string
  readonly selectedOrderId: string
  readonly officialOrder: Pick<QuotationOrderBrowseItem, 'id' | 'type' | 'serviceAppointmentId' | 'state' | 'processState'>
    & { readonly isAgain?: number; readonly hasExts?: boolean } | null
  readonly contractState: 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
  readonly contracts: readonly R1ScopedContractSummary[]
  readonly selectedContractId?: string
  readonly currentRoleWorkOrderVerified: boolean
  /**
   * R1's isHandler is derived from current workflow node.handlerIds, NOT from
   * being able to see a WorkOrder. This fact must be independently verified
   * using the current node and actor; unknown => false.
   */
  readonly currentNodeHandlerVerified: boolean
  /** Verified means trusted by the current identity, NOT signer/contract permission. */
  readonly currentIdentityVerified: boolean
}

export interface R1SigningIntentReview {
  readonly kind: R1SigningIntentKind
  readonly descriptor: R1SigningIntentDescriptor
  readonly assessment: R1SigningIntentAssessment
  readonly reasons: readonly string[]
  readonly scopedWorkOrderId: string | null
  readonly scopedOrderId: string | null
  readonly scopedContractId: string | null
  /** No request data or signer/PII is serialised. */
  readonly mayDispatch: false
  readonly backendPermissionProven: false
  readonly actualBusinessOutcomeKnown: false
}

const safeId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id)

export function reviewR1SigningIntent(
  kind: R1SigningIntentKind, context: R1SigningIntentContext,
): R1SigningIntentReview {
  const descriptor = r1SigningIntentDescriptors[kind]
  const reasons: string[] = []
  let conflict = false
  const order = context.officialOrder
  if (!context.currentIdentityVerified || !context.currentRoleWorkOrderVerified) {
    reasons.push('当前会话/角色及工单访问范围尚未核验')
  }
  if (!context.currentNodeHandlerVerified) {
    reasons.push('尚未核验 R1 当前工作流节点 handlerIds 与用户/角色/组织角色的处理人关系')
  }
  if (!safeId(context.workOrderId) || !safeId(context.selectedOrderId)
    || !order || order.type !== 1 || order.id !== context.selectedOrderId
    || order.serviceAppointmentId !== context.workOrderId) {
    reasons.push('正式订单身份/工单归属尚未核验，不可使用报价草稿')
  }
  // Live R1 evidence disproved equivalence: basic/order/query may include
  // state=-1 whereas R1 clearOrderFieldQuery filters state IN (0,1).
  // Unknown state also cannot prove that this source-filter requirement holds.
  if (order && !isSigningReadOrderCandidate(order)) {
    reasons.push('订单生命周期不符合 R1 原列表允许的 state=0/1；不能将取消或未知订单作为签约候选')
  }
  const active = context.contractState === 'succeeded'
  const records = context.contracts
  if (records.length > 3 || new Set(records.map(c => c.id)).size !== records.length
    || records.some(c => !safeId(c.id) || c.serviceAppointmentId !== context.workOrderId
      || c.orderId !== context.selectedOrderId)) {
    reasons.push('合同集合中存在重复、越界或其他订单记录')
    conflict = true
  }
  const needsContract = kind === 'resign' || kind === 'resend_sms' || kind === 'cancel'
  if (needsContract) {
    if (!active) reasons.push('尚未获得本次合同状态读取结果')
    if (!context.selectedContractId || !safeId(context.selectedContractId)) {
      reasons.push('尚未指定有效的合同身份')
    }
    const exact = records.filter(c => c.id === context.selectedContractId)
    if (exact.length !== 1 || records.length !== 1) reasons.push('无法证明唯一有效的目标合同')
    const row = exact.length === 1 ? exact[0] : undefined
    if (row) {
      if (row.state !== 1) reasons.push('合同记录不是可核验的有效状态')
      if (kind === 'resign') {
        if (row.contractStatus === '-3') {
          reasons.push('R1 前端 -3 显示再次签约，后端该状态直接返回成功而不重新签署')
          conflict = true
        } else {
          reasons.push('非 -3 状态不符合 R1 再次签约入口')
        }
      }
      if (kind === 'resend_sms' && row.contractStatus !== '2') reasons.push('状态不是 R1 短信重发条件 2')
      if (kind === 'cancel') {
        if (!['10','2','-3'].includes(row.contractStatus ?? '')) {
          reasons.push('合同状态不满足 R1 取消条件')
        }
        // Sanitized read does not contain endDate/workType/reason; cannot infer them.
        reasons.push('尚未核验合同 endDate、workType、取消理由及角色授权')
      }
    }
  } else {
    if (order?.processState !== 0) reasons.push('正式订单不是 R1 允许首次签约的 processState=0')
    // extension metadata is intentionally not projected in existing Order precheck.
    if (order?.hasExts !== true || order.isAgain === undefined) {
      reasons.push('尚未核验正式订单扩展字段 exts.isAgain')
    } else if (order.isAgain === 1) {
      reasons.push('R1 exts.isAgain=1 禁止首次签约')
    }
    if (active && records.length > 0) reasons.push('已有合同记录，不能直接重新发起首次签约')
    if (!active) reasons.push('当前合同列表尚未完成独立核验')
  }
  return {
    kind, descriptor,
    assessment: conflict ? 'source_conflict' : reasons.length ? 'blocked' : 'candidate',
    reasons: [...reasons, '真实签约角色/租户权限及生产合同 API 等价性未验证；所有业务写入禁止'],
    scopedWorkOrderId: safeId(context.workOrderId) ? context.workOrderId : null,
    scopedOrderId: safeId(context.selectedOrderId) ? context.selectedOrderId : null,
    scopedContractId: context.selectedContractId && safeId(context.selectedContractId)
      ? context.selectedContractId : null,
    mayDispatch: false,
    backendPermissionProven: false,
    actualBusinessOutcomeKnown: false,
  }
}

/** Fail closed even if a caller presents a source-matching R1 action state. */
export function r1SigningCommandDispatchDenied(): {
  readonly success: false
  readonly reason: 'business_writes_not_authorized'
  readonly calledEndpoint: false
} {
  return { success: false, reason: 'business_writes_not_authorized', calledEndpoint: false }
}
