import type { QuotationOrderCommandPort, QuotationOrderRead, QuotationOrderReadPort, StoragePort } from '@shared/ports'
import type { OperationSnapshot, UserId, WorkOrderId, WorkflowNodeRuntimeId, WorkflowDefinitionId } from '@shared/types'

import type { R1OfficialOrderType1Payload } from './order-encoder'
import { quotationOrderEditBlockers } from './order-reconstruction'

export type QuotationOrderSubmissionState =
  | 'idle'
  | 'validating'
  | 'submitting'
  | 'write_succeeded_readback_pending'
  | 'succeeded'
  | 'failed_retryable_before_write'
  | 'failed_ambiguous_after_dispatch'
  | 'failed_terminal'

export interface QuotationOrderReceipt {
  readonly version: 1
  readonly workOrderId: string
  readonly workflowNodeId: string
  readonly fingerprint: string
  /** Local actor fingerprint; never store a bearer token. */
  readonly authorizationFingerprint: string
  readonly draftVersion: number
  readonly state: 'prepared' | 'workflow_start_dispatched' | 'workflow_started' | 'order_upsert_dispatched' | 'ambiguous' | 'write_succeeded_readback_pending' | 'succeeded'
  readonly workflowId?: string
  readonly orderId?: string
}

export interface QuotationOrderSubmissionSnapshot {
  readonly state: QuotationOrderSubmissionState
  readonly order?: QuotationOrderRead
  readonly message?: string
}

export interface QuotationOrderSubmissionInput {
  readonly userId: UserId
  readonly authorizationIdentityKey: string
  readonly authorizationCurrent: () => boolean
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly workflowDefinitionId?: WorkflowDefinitionId
  readonly expectedDraftVersion: number
  readonly evaluatedDraftVersion: number
  readonly engineReady: boolean
  readonly payload: R1OfficialOrderType1Payload
  readonly existingOrderId?: string
  readonly command: QuotationOrderCommandPort
  readonly readApi: QuotationOrderReadPort
  readonly storage: StoragePort
  readonly finalizeDraft: () => Promise<OperationSnapshot<void>>
}

function receiptKey(input: Pick<QuotationOrderSubmissionInput, 'userId' | 'workOrderId' | 'workflowNodeId'>): string {
  return `quotation-order-receipt:v1:${encodeURIComponent(input.userId)}:${encodeURIComponent(input.workOrderId)}:${encodeURIComponent(input.workflowNodeId)}`
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let first = 2166136261
  let second = 2246822519
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    first ^= code
    first = Math.imul(first, 16777619)
    second ^= code + index
    second = Math.imul(second, 3266489917)
  }
  // Two independently seeded 32-bit non-PII digests reduce accidental local
  // receipt collisions without storing the payload or using platform crypto.
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function validReceipt(value: unknown): value is QuotationOrderReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const receipt = value as Record<string, unknown>
  return receipt.version === 1
    && typeof receipt.workOrderId === 'string'
    && typeof receipt.workflowNodeId === 'string'
    && typeof receipt.fingerprint === 'string'
    && typeof receipt.authorizationFingerprint === 'string'
    && /^[0-9a-f]{16}$/.test(receipt.authorizationFingerprint)
    && Number.isInteger(receipt.draftVersion)
    && ['prepared', 'workflow_start_dispatched', 'workflow_started', 'order_upsert_dispatched', 'ambiguous', 'write_succeeded_readback_pending', 'succeeded'].includes(String(receipt.state))
    && (receipt.workflowId === undefined || typeof receipt.workflowId === 'string')
    && (receipt.orderId === undefined || typeof receipt.orderId === 'string')
}

function authorizationValid(input: QuotationOrderSubmissionInput): boolean {
  return typeof input.authorizationIdentityKey === 'string'
    && input.authorizationIdentityKey.length > 0
    && input.authorizationCurrent()
}

function authorizationMatches(scope: string, receipt: QuotationOrderReceipt): boolean {
  return typeof scope === 'string' && scope.length > 0
    && receipt.authorizationFingerprint === fingerprint(scope)
}

function safeMessage(state: QuotationOrderSubmissionState): string {
  switch (state) {
    case 'write_succeeded_readback_pending': return '订单已提交，正在等待权威订单信息；请勿重复提交。'
    case 'failed_ambiguous_after_dispatch': return '提交结果暂无法确认；系统已阻止重复提交，请联系支持人员核查服务器订单状态。'
    case 'failed_retryable_before_write': return '尚未提交订单，检查网络后可重试。'
    case 'failed_terminal': return '当前订单条件未通过，未继续提交。'
    case 'succeeded': return '订单已提交并完成服务器核对。'
    default: return ''
  }
}

async function readReceipt(input: QuotationOrderSubmissionInput): Promise<OperationSnapshot<QuotationOrderReceipt | null>> {
  const result = await input.storage.read<unknown>({ namespace: 'draft', key: receiptKey(input) })
  if (result.state !== 'succeeded') return { state: result.state, ...(result.error ? { error: result.error } : {}) }
  if (result.data === null) return { state: 'succeeded', data: null }
  if (!validReceipt(result.data)
    || !authorizationMatches(input.authorizationIdentityKey, result.data)
    || result.data.workOrderId !== input.workOrderId
    || result.data.workflowNodeId !== input.workflowNodeId) {
    return { state: 'failed_terminal' }
  }
  return { state: 'succeeded', data: result.data }
}

/** Restores the duplicate-protection state before the submit CTA can be enabled after app restart. */
export async function restoreQuotationOrderSubmissionState(input: {
  readonly userId: UserId
  readonly authorizationIdentityKey: string
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly storage: StoragePort
}): Promise<QuotationOrderSubmissionSnapshot> {
  const result = await input.storage.read<unknown>({ namespace: 'draft', key: receiptKey(input) })
  if (result.state !== 'succeeded') return { state: 'failed_terminal', message: '本地订单防重记录无法读取，暂不能安全提交。' }
  if (result.data === null) return { state: 'idle' }
  if (!validReceipt(result.data)
    || !authorizationMatches(input.authorizationIdentityKey, result.data)
    || result.data.workOrderId !== input.workOrderId
    || result.data.workflowNodeId !== input.workflowNodeId) {
    return { state: 'failed_terminal', message: '本地订单防重记录无效，暂不能安全提交。' }
  }
  if (result.data.state === 'succeeded') return { state: 'succeeded', message: safeMessage('succeeded') }
  if (result.data.state === 'write_succeeded_readback_pending') {
    return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  }
  if (result.data.state === 'ambiguous'
    || result.data.state === 'workflow_start_dispatched'
    || result.data.state === 'order_upsert_dispatched') {
    return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
  }
  if (result.data.state === 'workflow_started') {
    return { state: 'failed_retryable_before_write', message: '订单流程已准备；可以安全继续提交，不会重复启动子流程。' }
  }
  return { state: 'idle' }
}

async function writeReceipt(input: QuotationOrderSubmissionInput, receipt: QuotationOrderReceipt): Promise<boolean> {
  return (await input.storage.write({ namespace: 'draft', key: receiptKey(input) }, receipt)).state === 'succeeded'
}

async function reconcile(input: QuotationOrderSubmissionInput, receipt: QuotationOrderReceipt): Promise<QuotationOrderSubmissionSnapshot> {
  if (!authorizationValid(input) || !authorizationMatches(input.authorizationIdentityKey, receipt)) {
    return { state: 'failed_terminal', message: '账号或角色归属已变化；禁止跨角色读取或清理订单草稿。' }
  }
  if (!receipt.orderId || !input.readApi.getQuotationOrderById) {
    return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  }
  const read = await input.readApi.getQuotationOrderById(receipt.orderId)
  if (!authorizationValid(input)) return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  if (read.state !== 'succeeded' || !read.data
    || read.data.id !== receipt.orderId
    || read.data.type !== 1
    || read.data.serviceAppointmentId !== input.workOrderId) {
    return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  }
  const completed = { ...receipt, state: 'succeeded' as const }
  if (!(await writeReceipt(input, completed))) {
    return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  }
  // Local cleanup is post-success only and only when the currently held local
  // draft is still the exact version/payload that produced this Order write.
  // A later edit must never be deleted by a delayed readback.
  if (authorizationValid(input)
    && receipt.draftVersion === input.expectedDraftVersion
    && receipt.fingerprint === fingerprint(input.payload)) {
    await input.finalizeDraft()
  }
  return { state: 'succeeded', order: read.data, message: safeMessage('succeeded') }
}

async function submitQuotationOrderOnce(input: QuotationOrderSubmissionInput): Promise<QuotationOrderSubmissionSnapshot> {
  if (!authorizationValid(input)) return { state: 'failed_terminal', message: '账号或角色归属不完整，禁止提交订单。' }
  if (input.payload.type !== 1
    || input.payload.serviceAppointmentId !== input.workOrderId
    || input.expectedDraftVersion !== input.evaluatedDraftVersion
    || !input.engineReady
    || !input.readApi.getQuotationOrderById) {
    return { state: 'failed_terminal', message: safeMessage('failed_terminal') }
  }
  if (!input.existingOrderId && !input.workflowDefinitionId) {
    return { state: 'failed_terminal', message: '当前流程未提供已验证的 Order 子流程定义，不能创建订单。' }
  }
  let existingOrderSnapshot: Readonly<Record<string, unknown>> | undefined
  if (input.existingOrderId) {
    if (!input.readApi.getQuotationOrderById) return { state: 'failed_terminal', message: safeMessage('failed_terminal') }
    const existing = await input.readApi.getQuotationOrderById(input.existingOrderId)
    if (!authorizationValid(input)) return { state: 'failed_terminal', message: '读取现有订单期间权限已失效。' }
    if (existing.state !== 'succeeded' || !existing.data
      || existing.data.id !== input.existingOrderId
      || existing.data.type !== 1
      || existing.data.serviceAppointmentId !== input.workOrderId) {
      return { state: 'failed_terminal', message: '待编辑订单无法权威读取或不属于当前工单，未发送更新。' }
    }
    const blockers = quotationOrderEditBlockers(existing.data)
    if (blockers.length > 0) return { state: 'failed_terminal', message: blockers[0] }
    existingOrderSnapshot = existing.data.replaceSnapshot
  }

  const existing = await readReceipt(input)
  if (!authorizationValid(input)) return { state: 'failed_terminal', message: '读取防重记录期间权限已失效。' }
  if (existing.state !== 'succeeded') return { state: 'failed_terminal', message: safeMessage('failed_terminal') }
  const old = existing.data
  if (old) {
    const sameFingerprint = old.fingerprint === fingerprint(input.payload)
    const sameOrderEdit = Boolean(input.existingOrderId && old.orderId === input.existingOrderId && old.state === 'succeeded')
    if (!sameFingerprint && !sameOrderEdit && old.state !== 'workflow_started' && old.state !== 'prepared') {
      return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
    }
    if (sameFingerprint && (old.state === 'succeeded' || old.state === 'write_succeeded_readback_pending')) {
      return reconcile(input, old)
    }
    if (['ambiguous', 'workflow_start_dispatched', 'order_upsert_dispatched'].includes(old.state)) {
      return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
    }
  }

  const nextReceipt: QuotationOrderReceipt = {
    version: 1,
    workOrderId: input.workOrderId,
    workflowNodeId: input.workflowNodeId,
    fingerprint: fingerprint(input.payload),
    authorizationFingerprint: fingerprint(input.authorizationIdentityKey),
    draftVersion: input.expectedDraftVersion,
    state: old?.state === 'workflow_started' ? 'workflow_started' : 'prepared',
    ...(old?.workflowId ? { workflowId: old.workflowId } : {}),
    ...(input.existingOrderId ? { orderId: input.existingOrderId } : {}),
  }
  if (!(await writeReceipt(input, nextReceipt))) return { state: 'failed_retryable_before_write', message: safeMessage('failed_retryable_before_write') }
  if (!authorizationValid(input)) return { state: 'failed_terminal', message: '提交前账号或角色已变化；未发送业务写入。' }

  let workflowId = nextReceipt.workflowId
  if (!input.existingOrderId && !workflowId) {
    if (!authorizationValid(input)) return { state: 'failed_terminal', message: '业务写入前权限已失效。' }
    if (!(await writeReceipt(input, { ...nextReceipt, state: 'workflow_start_dispatched' }))) {
      return { state: 'failed_retryable_before_write', message: safeMessage('failed_retryable_before_write') }
    }
    if (!authorizationValid(input)) return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
    const started = await input.command.startOrderWorkflow({
      workOrderId: input.workOrderId,
      workflowDefinitionId: input.workflowDefinitionId!,
    })
    if (started.state !== 'succeeded' || !started.data) {
      // Any dispatched write is uncertain without authoritative readback,
      // regardless of the envelope's terminal/retryable classification.
      await writeReceipt(input, { ...nextReceipt, state: 'ambiguous' })
      return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
    }
    workflowId = started.data
    if (!(await writeReceipt(input, { ...nextReceipt, state: 'workflow_started', workflowId }))) {
      return { state: 'failed_ambiguous_after_dispatch', message: '子流程已启动，但本地确认记录未保存；为避免重复启动，已阻止继续提交。' }
    }
    if (!authorizationValid(input)) return { state: 'failed_terminal', message: '启动流程后角色已变化，禁止写入正式订单。' }
  }

  if (!authorizationValid(input)) return { state: 'failed_terminal', message: '订单写入前权限已失效。' }
  const originalExts = typeof existingOrderSnapshot?.exts === 'object' && existingOrderSnapshot.exts !== null && !Array.isArray(existingOrderSnapshot.exts)
    ? existingOrderSnapshot.exts as Readonly<Record<string, unknown>>
    : {}
  const order = {
    ...(existingOrderSnapshot ?? {}),
    ...input.payload,
    ...(input.existingOrderId ? { _id: input.existingOrderId, processState: 0 } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(input.existingOrderId ? { exts: { ...originalExts, ...input.payload.exts } } : {}),
  }
  const dispatchReceipt: QuotationOrderReceipt = {
    ...nextReceipt,
    state: 'order_upsert_dispatched',
    ...(workflowId ? { workflowId } : {}),
    ...(input.existingOrderId ? { orderId: input.existingOrderId } : {}),
  }
  if (!(await writeReceipt(input, dispatchReceipt))) {
    return { state: 'failed_terminal', message: '提交保护记录无法保存，未发送订单请求。' }
  }
  if (!authorizationValid(input)) return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
  const saved = await input.command.upsertOfficialOrder({ order })
  if (saved.state !== 'succeeded' || !saved.data) {
    // A terminal response does not prove the server did not apply type=1 upsert.
    await writeReceipt(input, { ...dispatchReceipt, state: 'ambiguous' })
    return { state: 'failed_ambiguous_after_dispatch', message: safeMessage('failed_ambiguous_after_dispatch') }
  }
  const receipt: QuotationOrderReceipt = {
    ...nextReceipt,
    state: 'write_succeeded_readback_pending',
    ...(workflowId ? { workflowId } : {}),
    orderId: saved.data,
  }
  if (!(await writeReceipt(input, receipt))) {
    return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  }
  if (!authorizationValid(input)) return { state: 'write_succeeded_readback_pending', message: safeMessage('write_succeeded_readback_pending') }
  return reconcile(input, receipt)
}

const submissionFlights = new Map<string, {
  readonly authorizationFingerprint: string
  readonly promise: Promise<QuotationOrderSubmissionSnapshot>
}>()

export function submitQuotationOrder(input: QuotationOrderSubmissionInput): Promise<QuotationOrderSubmissionSnapshot> {
  const key = receiptKey(input)
  const actor = fingerprint(input.authorizationIdentityKey)
  const active = submissionFlights.get(key)
  if (active) {
    // Same actor joins the existing attempt. Different actor must NEVER
    // coalesce with another role's in-flight mutation or race its receipt.
    return active.authorizationFingerprint === actor
      ? active.promise
      : Promise.resolve({ state: 'failed_terminal', message: '另一角色存在未完成的订单请求，禁止并行写入。' })
  }
  const flight = submitQuotationOrderOnce(input).finally(() => {
    if (submissionFlights.get(key)?.promise === flight) submissionFlights.delete(key)
  })
  submissionFlights.set(key, { authorizationFingerprint: actor, promise: flight })
  return flight
}

export async function retryQuotationOrderReadback(
  input: QuotationOrderSubmissionInput,
): Promise<QuotationOrderSubmissionSnapshot> {
  if (!authorizationValid(input)) return { state: 'failed_terminal', message: '当前角色无权回读订单。' }
  const receipt = await readReceipt(input)
  if (!authorizationValid(input)) return { state: 'failed_terminal', message: '回读期间账号或角色已变化。' }
  if (receipt.state !== 'succeeded' || !receipt.data
    || !['write_succeeded_readback_pending', 'succeeded'].includes(receipt.data.state)) {
    return { state: 'failed_terminal', message: safeMessage('failed_terminal') }
  }
  return reconcile(input, receipt.data)
}
