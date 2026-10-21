import type { StoragePort } from '@shared/ports'
import type { FormDataId, OperationSnapshot } from '@shared/types'

/**
 * Conservative, durable client-side dispatch fence; NOT server idempotency.
 * Index deliberately excludes role/session: changing roles must still see a
 * pending write to the same user's WorkOrder/node/form, never bypass it.
 */
export interface ActionMutationScope {
  readonly userId: string
  readonly workOrderId: string
  readonly workflowNodeId: string
  readonly formDefinitionId: string
  readonly authorizationScope: string
}
export type ActionMutationPhase =
  | 'form_dispatched' | 'form_saved' | 'workflow_dispatched' | 'completed'
export interface ActionMutationReceipt {
  readonly version: 1
  readonly userId: string
  readonly workOrderId: string
  readonly workflowNodeId: string
  readonly formDefinitionId: string
  /** Non-credential fingerprint; never persist cookies or session tokens. */
  readonly actorFingerprint: string
  readonly phase: ActionMutationPhase
  readonly formDataId?: string
}
// All StoragePort wrappers in one app runtime share this reservation. H5 also
// takes a browser Web Lock around the read/write pair below.
const locks = new Set<string>()
function digest(value: string): string {
  let a = 2166136261
  let b = 2246822519
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619)
    b = Math.imul(b ^ (value.charCodeAt(i) + i), 3266489917)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
function receiptKey(s: ActionMutationScope): string {
  return ['action-mutation:v1',s.userId,s.workOrderId,s.workflowNodeId,s.formDefinitionId]
    .map(encodeURIComponent).join(':')
}
function storageKey(s: ActionMutationScope) {
  return { namespace: 'draft' as const, key: receiptKey(s) }
}
function valid(value: unknown, s: ActionMutationScope): value is ActionMutationReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Record<string, unknown>
  return r.version === 1
    && r.userId === s.userId
    && r.workOrderId === s.workOrderId
    && r.workflowNodeId === s.workflowNodeId
    && r.formDefinitionId === s.formDefinitionId
    && typeof r.actorFingerprint === 'string'
    && /^[0-9a-f]{16}$/.test(r.actorFingerprint)
    && ['form_dispatched','form_saved','workflow_dispatched','completed'].includes(String(r.phase))
    && (r.formDataId === undefined || (typeof r.formDataId === 'string' && r.formDataId.trim().length > 0))
    && (r.phase === 'form_dispatched' || typeof r.formDataId === 'string')
}
function denial(message: string): OperationSnapshot<never> {
  return { state: 'failed_terminal', error: {
    category: 'unsupported_capability', message, retryable: false,
  } }
}
const UNKNOWN = '服务器写入结果尚未唯一确认，已阻止再次提交；请联系管理员核对 FormData 与工作流状态。'
export function mutationReceiptDenial(): OperationSnapshot<never> { return denial(UNKNOWN) }

export async function loadActionMutationReceipt(
  storage: StoragePort | undefined,
  scope: ActionMutationScope,
): Promise<OperationSnapshot<ActionMutationReceipt | null>> {
  if (!storage || !scope.authorizationScope || !scope.formDefinitionId || !scope.userId)
    return denial('持久化防重能力或会话身份不可用，禁止业务写入。')
  let read: OperationSnapshot<unknown | null>
  try { read = await storage.read<unknown>(storageKey(scope)) }
  catch { return denial('防重记录读取异常，禁止业务写入。') }
  if (read.state !== 'succeeded') return denial('防重记录读取失败，禁止业务写入。')
  if (read.data === null) return { state: 'succeeded', data: null }
  if (!valid(read.data, scope) || read.data.actorFingerprint !== digest(scope.authorizationScope))
    return denial('防重记录无效或由另一会话/角色发起，禁止覆盖。')
  return { state: 'succeeded', data: read.data }
}
async function persist(
  storage: StoragePort | undefined,
  scope: ActionMutationScope,
  phase: ActionMutationPhase,
  formDataId?: string,
): Promise<OperationSnapshot<ActionMutationReceipt>> {
  if (!storage) return denial('没有可用的持久化防重存储。')
  const record: ActionMutationReceipt = {
    version: 1,
    userId: scope.userId, workOrderId: scope.workOrderId,
    workflowNodeId: scope.workflowNodeId, formDefinitionId: scope.formDefinitionId,
    actorFingerprint: digest(scope.authorizationScope),
    phase, ...(formDataId ? { formDataId } : {}),
  }
  let result: OperationSnapshot<void>
  try { result = await storage.write(storageKey(scope), record) }
  catch { return denial('防重记录落盘异常，禁止业务写入或继续完成工作流。') }
  if (result.state !== 'succeeded') return denial('防重记录落盘失败，禁止业务写入或继续完成工作流。')
  return { state: 'succeeded', data: record }
}
/** Dispatch reservation is taken before ANY async storage read/write. */
export async function beginActionMutation(
  storage: StoragePort | undefined,
  scope: ActionMutationScope,
  phase: 'form_dispatched' | 'workflow_dispatched',
  knownFormDataId?: FormDataId,
): Promise<OperationSnapshot<ActionMutationReceipt>> {
  if (!storage) return denial('必须持久化未知结果防重记录，禁止请求。')
  const key=receiptKey(scope)
  const reserve = async (): Promise<OperationSnapshot<ActionMutationReceipt>> => {
    if (locks.has(key)) return mutationReceiptDenial()
    locks.add(key)
    try {
      const read=await loadActionMutationReceipt(storage,scope)
      if (read.state !== 'succeeded') return read as OperationSnapshot<ActionMutationReceipt>
      const old=read.data
      if (old && old.phase !== 'form_saved') return mutationReceiptDenial()
      if (old && (!knownFormDataId || old.formDataId !== String(knownFormDataId))) return mutationReceiptDenial()
      if (phase === 'workflow_dispatched' && (!knownFormDataId || (old && old.formDataId !== String(knownFormDataId))))
        return mutationReceiptDenial()
      return persist(storage,scope,phase,knownFormDataId ? String(knownFormDataId) : undefined)
    } finally {
      locks.delete(key)
    }
  }
  // MP and App-Plus use the runtime-wide reservation. Browser tabs require an
  // atomic same-origin lock; without Web Locks, H5 writes fail closed.
  // Bridge globals (wx/plus) can exist in H5. Only the compile-time Uni
  // target may exempt native/mini-program builds from cross-tab Web Locks.
  // Any unknown browser target fails closed rather than using a tab-local Set.
  const target = import.meta.env.UNI_PLATFORM
  const requiresBrowserLock = target === 'h5'
    || (target !== 'app' && target !== 'app-plus'
      && target !== 'mp-weixin' && typeof window !== 'undefined')
  if (requiresBrowserLock) {
    if (typeof navigator === 'undefined' || !navigator.locks) return denial('浏览器缺少跨窗口防重锁，禁止业务写入。')
    try { return await navigator.locks.request(key, { mode: 'exclusive' }, reserve) }
    catch { return denial('跨窗口防重锁不可用，禁止业务写入。') }
  }
  return reserve()
}
/** For a save ACK, retain authoritative ID even if the view/session has switched. */
export async function recordActionFormSaved(
  storage: StoragePort | undefined,
  scope: ActionMutationScope,
  formDataId: FormDataId,
): Promise<OperationSnapshot<ActionMutationReceipt>> {
  const read=await loadActionMutationReceipt(storage,scope)
  if (read.state !== 'succeeded' || !read.data
    || read.data.phase !== 'form_dispatched'
    || (read.data.formDataId && read.data.formDataId !== String(formDataId))) return mutationReceiptDenial()
  return persist(storage,scope,'form_saved',String(formDataId))
}
export async function recordActionWorkflowCompleted(
  storage: StoragePort | undefined,
  scope: ActionMutationScope,
): Promise<OperationSnapshot<ActionMutationReceipt>> {
  const read=await loadActionMutationReceipt(storage,scope)
  if (read.state !== 'succeeded' || !read.data
    || read.data.phase !== 'workflow_dispatched') return mutationReceiptDenial()
  return persist(storage,scope,'completed',read.data.formDataId)
}
/** Unknown (including crash after prepared record) remains blocked. No
 * client-side reset exists; only separately authorized manual reconciliation. */
export function actionMutationMayStart(receipt: ActionMutationReceipt | null): boolean {
  return receipt === null || receipt.phase === 'form_saved'
}
