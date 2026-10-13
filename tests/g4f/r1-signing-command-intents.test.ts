import { describe, expect, it } from 'vitest'
import {
  reviewR1SigningIntent, r1SigningIntentDescriptors, r1SigningCommandDispatchDenied,
  type R1SigningIntentKind, type R1SigningIntentContext,
} from '@features/work-orders/signing/r1-signing-command-intents'

const workOrderId='wo-019', orderId='official-001', contractId='contract-123'
const ctx = (extra: Partial<R1SigningIntentContext> = {}): R1SigningIntentContext => ({
  workOrderId, selectedOrderId: orderId,
  currentIdentityVerified: true, currentRoleWorkOrderVerified: true,
  officialOrder: { id: orderId, type: 1, serviceAppointmentId: workOrderId,
    processState: 0, isAgain: 0, hasExts: true },
  contractState: 'succeeded', contracts: [], ...extra,
})
const contract=(status: string, more: Record<string, unknown>={}) => ({
  id: contractId, orderId, serviceAppointmentId: workOrderId,
  state: 1, contractStatus: status, ...more,
})

describe('I6 source-pinned signing command intent contracts, zero business writes', () => {
  const kinds: readonly R1SigningIntentKind[]=['electronic','offline','resign','resend_sms','cancel']
  it('pins five distinct R1 mutation routes and never claims a verified HTTP method',()=>{
    expect(kinds.map(k=>r1SigningIntentDescriptors[k].route)).toEqual([
      'signature/applyForElectronicSignature',
      'signature/applyForElectronicSignature.do',
      'signature/againApplyForElectronicSignature',
      'signature/handleReminderContract',
      'basic/contract/remove',
    ])
    for(const k of kinds){
      expect(r1SigningIntentDescriptors[k]).toMatchObject({
        kind:k, businessMutation:true,transportMethod:'R1_AJAX_METHOD_UNVERIFIED',
      })
      expect(r1SigningIntentDescriptors[k].expectedReadback.length).toBeGreaterThan(10)
    }
  })
  it.each(['electronic','offline'] as const)('%s is source-shaped for an exactly matched initial R1 Order, but still blocks dispatch',(kind)=>{
    const result=reviewR1SigningIntent(kind,ctx())
    expect(result.assessment).toBe('candidate')
    expect(result.mayDispatch).toBe(false)
    expect(result.backendPermissionProven).toBe(false)
    expect(result.reasons).toContain(expect.stringContaining('所有业务写入禁止'))
  })
  it.each(['electronic','offline'] as const)('%s rejects missing isAgain, already signing and existing Contract',(kind)=>{
    expect(reviewR1SigningIntent(kind,ctx({officialOrder:{id:orderId,type:1,serviceAppointmentId:workOrderId,processState:0}})).assessment).toBe('blocked')
    expect(reviewR1SigningIntent(kind,ctx({officialOrder:{id:orderId,type:1,serviceAppointmentId:workOrderId,processState:4,isAgain:0,hasExts:true}})).assessment).toBe('blocked')
    expect(reviewR1SigningIntent(kind,ctx({officialOrder:{id:orderId,type:1,serviceAppointmentId:workOrderId,processState:0,isAgain:1,hasExts:true}})).assessment).toBe('blocked')
    expect(reviewR1SigningIntent(kind,ctx({contracts:[contract('2')]})).assessment).toBe('blocked')
  })
  it('R1 -3 resign source conflict is explicitly surfaced, not treated as a safe retry',()=>{
    const result=reviewR1SigningIntent('resign',ctx({
      selectedContractId:contractId,contracts:[contract('-3')],
    }))
    expect(result.assessment).toBe('source_conflict')
    expect(result.reasons.join(' ')).toContain('后端该状态直接返回成功')
  })
  it('R1 reminder status=2 is only a candidate for review, never an SMS send',()=>{
    const result=reviewR1SigningIntent('resend_sms',ctx({
      selectedContractId:contractId,contracts:[contract('2')],
    }))
    expect(result.assessment).toBe('candidate')
    expect(result.mayDispatch).toBe(false)
    expect(result.descriptor.effect).toContain('消息')
    expect(reviewR1SigningIntent('resend_sms',ctx({
      selectedContractId:contractId,contracts:[contract('10')],
    })).assessment).toBe('blocked')
  })
  it('cancellation requires unprojected workType/endDate/reason; never inferred from status alone',()=>{
    const result=reviewR1SigningIntent('cancel',ctx({
      selectedContractId:contractId,contracts:[contract('10')],
    }))
    expect(result.assessment).toBe('blocked')
    expect(result.reasons.join(' ')).toContain('endDate')
  })
  it.each(kinds)('%s rejects cross-WorkOrder and Order mismatch',(kind)=>{
    const result=reviewR1SigningIntent(kind,ctx({
      selectedContractId:contractId,
      officialOrder:{ id:'another-order', type:1, serviceAppointmentId:workOrderId },
      contracts:[contract('2',{serviceAppointmentId:'foreign-wo'})],
    }))
    expect(result.assessment).not.toBe('candidate')
    expect(result.reasons.join(' ')).toContain('工单')
    expect(result.mayDispatch).toBe(false)
  })
  it.each(kinds)('%s fails role/identity denial before any future command',(kind)=>{
    expect(reviewR1SigningIntent(kind,ctx({currentIdentityVerified:false})).assessment).not.toBe('candidate')
    expect(reviewR1SigningIntent(kind,ctx({currentRoleWorkOrderVerified:false})).assessment).not.toBe('candidate')
  })
  it('rejects multiple Contract versions, missing or invalid Contract identity and stale list',()=>{
    expect(reviewR1SigningIntent('resend_sms',ctx({
      selectedContractId:contractId,contracts:[contract('2'),contract('2',{id:'contract-456'})],
    })).assessment).toBe('blocked')
    expect(reviewR1SigningIntent('resend_sms',ctx({
      selectedContractId:'../contract',contracts:[contract('2')],
    })).assessment).toBe('blocked')
    expect(reviewR1SigningIntent('resend_sms',ctx({
      selectedContractId:contractId,contracts:[contract('2')],contractState:'failed_retryable',
    })).assessment).toBe('blocked')
  })
  it('signing write fence has no transport/capability and always denies',()=>{
    expect(r1SigningCommandDispatchDenied()).toEqual({
      success:false,reason:'business_writes_not_authorized',calledEndpoint:false,
    })
  })
})
