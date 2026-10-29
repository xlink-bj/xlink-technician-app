import type { SigningReadStage } from './r1-signing-read-reconciliation'
import type { R1SigningIntentKind } from './r1-signing-command-intents'

/** Local-only post-command evidence model. Does not send commands or poll a server. */
export type R1CommandReadbackPhase =
  | 'idle' | 'accepted_unverified' | 'checking' | 'waiting_for_external'
  | 'recorded_signed_unverified' | 'needs_attention'
export interface R1CommandReadback {
  readonly phase: R1CommandReadbackPhase
  readonly scope: string
  readonly requestKey: string | null
  readonly command: R1SigningIntentKind | null
  readonly accepted: boolean
  readonly checkedVersion: number
  readonly note: string
}
export type R1CommandReadbackEvent =
  | { readonly type: 'accepted'; readonly scope: string; readonly requestKey: string; readonly command: R1SigningIntentKind }
  | { readonly type: 'read_started'; readonly scope: string; readonly requestKey: string }
  | { readonly type: 'read_observed'; readonly scope: string; readonly requestKey: string; readonly stage: SigningReadStage; readonly version: number }
  | { readonly type: 'read_failed'; readonly scope: string; readonly requestKey: string }
  | { readonly type: 'clear' }

export function startR1CommandReadback(scope: string): R1CommandReadback {
  return { phase:'idle',scope,requestKey:null,command:null,accepted:false,checkedVersion:0,
    note:'尚未接受任何签约业务命令' }
}

/**
 * Request "accepted" is not legal execution proof. It cannot trigger another
 * POST, automatic SMS reminder, retry or QR/PDF access. Caller must provide
 * independently obtained, fresher read-only evidence.
 */
export function reduceR1CommandReadback(
  prior: R1CommandReadback, event: R1CommandReadbackEvent,
): R1CommandReadback {
  if (event.type === 'clear') return startR1CommandReadback(prior.scope)
  if (!prior.scope || event.scope !== prior.scope) return prior
  if (event.type === 'accepted') {
    if (prior.phase !== 'idle' || !/^[A-Za-z0-9_-]{1,100}$/.test(event.requestKey)) return prior
    return { ...prior, phase:'accepted_unverified',requestKey:event.requestKey,
      command:event.command,accepted:true,
      note:'接口受理仅是待核验事件，不能证明客户已签署' }
  }
  if (prior.requestKey !== event.requestKey || !prior.accepted) return prior
  if (event.type === 'read_started') {
    if (!['accepted_unverified','waiting_for_external'].includes(prior.phase)) return prior
    return {...prior,phase:'checking',note:'正在等待独立只读回查结果'}
  }
  if (event.type === 'read_failed') {
    if (prior.phase !== 'checking') return prior
    return {...prior,phase:'needs_attention',note:'回查失败，结果未知；禁止盲目自动重试签约或短信'}
  }
  if (prior.phase !== 'checking' || !Number.isSafeInteger(event.version)
    || event.version <= prior.checkedVersion) return prior
  const checkedVersion = event.version
  if (event.stage === 'record_signed') {
    return {...prior,phase:'recorded_signed_unverified',checkedVersion,
      note:'只读合同记录显示签署完成，仍须核实实际法律签名与订单阶段'}
  }
  if (event.stage === 'signing_in_progress') {
    return {...prior,phase:'waiting_for_external',checkedVersion,
      note:'外部签署仍在进行，不重复发送或重新发起'}
  }
  if (event.stage === 'contract_not_checked' || event.stage === 'contract_query_inconclusive') {
    return {...prior,phase:'waiting_for_external',checkedVersion,
      note:'只读结果不足，不能推断成功或失败'}
  }
  return {...prior,phase:'needs_attention',checkedVersion,
    note:'签约状态冲突、异常或不可识别，需人工核查，不自动重试'}
}
