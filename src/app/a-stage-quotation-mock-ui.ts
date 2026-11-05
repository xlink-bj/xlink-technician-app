import { withScopedDraftLock } from '@adapters/storage/scoped-draft-lock'
import { createMockOrderMediaSession } from './mock-order-media-session'
import type { OrderFieldSession } from '@features/work-orders/quotation/order-field-session'
import { createMockOrderFieldSession } from './mock-order-field-session'
import { evaluateOrderExtFields, hasReservedOrderFieldKeys } from '@features/work-orders/quotation/order-extfield-runtime'
/** DEV-only R1 quote → Order protocol. Every mutation is owned by the exact
 * local Mock router; Production/Beta transports are never called or enabled. */
import {
  isDevMockJourneyEnabled, mockJourneyNodes, mockJourneyOrderWorkflowDefinitionId,
  mockJourneyStage, mockJourneyWorkOrderId, mockJourneyQuotationId,
  mockJourneyOfficialOrderId, mockJourneyOrderWorkflowRunId,
  readMockJourneyQuoteWorkflow,
} from '@adapters/api/mock/journey'
import { tryMockRead, tryMockCommand } from '@adapters/api/mock/router'
import { QuotationOrderReadAdapter, projectExactQuotationOrderReadForBrowse } from '@adapters/api/quotation-order-api'
import type { QuotationEngineResult } from '@features/work-orders/quotation/engine'
import type { StoragePort } from '@shared/ports'
import type { QuotationOrderBrowseItem } from '@shared/ports'
import { createDefaultMediaUploadQueue, createDefaultMediaFilePickerPort, createSpecialDevMockUploadPort, createDefaultStoragePort } from './composition'

export interface AStageQuoteActor { readonly userId: string; readonly roleId: string; readonly identity: string }
export type AStageQuoteFlowState = 'ready' | 'quote_created' | 'blocked' | 'uncertain' | 'succeeded'
type ReceiptStep = 'prepared' | 'quote_create_dispatched' | 'quote_created'
  | 'workflow_start_dispatched' | 'workflow_started' | 'order_upsert_dispatched' | 'succeeded' | 'ambiguous'
type UncertainPhase = 'quote' | 'workflow' | 'order'

interface FlowReceipt {
  readonly version: 1
  readonly state: ReceiptStep
  readonly fingerprint: string
  readonly authorizationFingerprint: string
  readonly draftVersion: number
  readonly quoteId?: string
  readonly workflowId?: string
  readonly orderId?: string
  readonly orderExts?: Readonly<Record<string, unknown>>
  readonly uncertainPhase?: UncertainPhase
}

const receiptKey = `quotation-to-order:v1:${mockJourneyWorkOrderId}:${mockJourneyNodes.quotation}`

export function isAStageMockOrderEnabled(input: {
  readonly workOrderId: string | null | undefined
  readonly userId: string | null | undefined
  readonly roleId: string | null | undefined
}): boolean {
  return isDevMockJourneyEnabled() && mockJourneyStage() === 'quotation'
    && input.workOrderId === mockJourneyWorkOrderId
    && input.userId === 'synthetic-user' && input.roleId === 'synthetic-role'
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function configuredStage(config: unknown): unknown {
  try { return record(typeof config === 'string' ? JSON.parse(config) : config)?.showType } catch { return undefined }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  const row = record(value)
  if (!row) return value
  return Object.fromEntries(Object.keys(row).sort().map(key => [key, canonical(row[key])]))
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

function digest(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  let first = 2166136261
  let second = 2246822519
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ (code + index), 3266489917)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function validReceipt(value: unknown): value is FlowReceipt {
  const row = record(value)
  return Boolean(row && row.version === 1
    && ['prepared', 'quote_create_dispatched', 'quote_created', 'workflow_start_dispatched',
      'workflow_started', 'order_upsert_dispatched', 'succeeded', 'ambiguous'].includes(String(row.state))
    && typeof row.fingerprint === 'string' && /^[0-9a-f]{16}$/.test(row.fingerprint)
    && typeof row.authorizationFingerprint === 'string' && /^[0-9a-f]{16}$/.test(row.authorizationFingerprint)
    && Number.isSafeInteger(row.draftVersion)
    && (row.orderExts === undefined || record(row.orderExts) !== null)
    && (row.quoteId === undefined || typeof row.quoteId === 'string')
    && (row.workflowId === undefined || typeof row.workflowId === 'string')
    && (row.orderId === undefined || typeof row.orderId === 'string')
    && (row.uncertainPhase === undefined || ['quote', 'workflow', 'order'].includes(String(row.uncertainPhase))))
}

function successfulEnvelope(value: unknown): boolean {
  const row = record(value)
  return row?.status === 1 || row?.success === true
}

function returnedId(value: unknown, key: 'data' | 'entity'): string | null {
  const outer = record(value)
  const nested = record(outer?.[key])
  const id = nested?._id
  return typeof id === 'string' && id.trim() ? id : null
}

function baseQuotePayload(engine: QuotationEngineResult): Record<string, unknown> | null {
  const payload = engine.payload
  const pricing = engine.pricing
  if (engine.state !== 'ready' || !payload || payload.type !== 1
    || !pricing || pricing.rounding !== 'r1_calcTotalPrice_and_fillOrder'
    || payload.originPrice !== pricing.calcTotalPrice.originPrice
    || payload.totalPrice !== pricing.calcTotalPrice.totalPrice
    || payload.serviceAppointmentId !== mockJourneyWorkOrderId
    || payload.discount !== 1 || payload.otherAmount !== 0 || payload.preferentialAmount !== 0
    || payload.exts.coupons !== '' || payload.exts.couponsVal !== 0 || payload.exts.couponsName !== ''
    || payload.exts.serviceType === '' || payload.exts.sourceType === '') return null
  try {
    const details = JSON.parse(payload.bjProducts) as unknown
    const root = record(details)
    if (!root || !Array.isArray(root.orderList) || root.orderList.length === 0) return null
  } catch { return null }
  return { ...payload, type: 0 }
}

function quoteMatches(value: unknown, quoteId: string, expected: Record<string, unknown>): boolean {
  const row = record(value)
  if (!row || row._id !== quoteId || row.type !== 0
    || row.serviceAppointmentId !== mockJourneyWorkOrderId
    || row.productIds !== expected.productIds
    || row.originPrice !== expected.originPrice || row.totalPrice !== expected.totalPrice
    || row.discount !== expected.discount || row.otherAmount !== expected.otherAmount
    || row.preferentialAmount !== expected.preferentialAmount) return false
  try {
    const expectedDetails = JSON.parse(String(expected.bjProducts)) as unknown
    const actualDetails = typeof row.bjProducts === 'string' ? JSON.parse(row.bjProducts) as unknown : row.bjProducts
    if (!sameValue(expectedDetails, actualDetails)) return false
  } catch { return false }
  const expectedExts = record(expected.exts)
  const actualExts = record(row.exts)
  return Boolean(expectedExts && actualExts
    && actualExts.serviceType === expectedExts.serviceType
    && actualExts.sourceType === expectedExts.sourceType
    && actualExts.coupons === expectedExts.coupons
    && actualExts.couponsVal === expectedExts.couponsVal
    && actualExts.couponsName === expectedExts.couponsName
    && actualExts.isCreateBjdPDF === expectedExts.isCreateBjdPDF
    && Object.keys(expectedExts).every(key => sameValue(actualExts[key], expectedExts[key])))
}

function orderMatches(value: unknown, expected: Record<string, unknown>, workflowId: string): boolean {
  const row = record(value)
  const snapshot = record(row?.replaceSnapshot)
  const exts = record(snapshot?.exts)
  const expectedExts = record(expected.exts)
  if (!row || !snapshot || !exts || row.id !== mockJourneyOfficialOrderId || row.type !== 1
    || row.serviceAppointmentId !== mockJourneyWorkOrderId
    || row.workflowId !== workflowId || workflowId !== mockJourneyOrderWorkflowRunId
    || row.originPrice !== expected.originPrice || row.totalPrice !== expected.totalPrice
    || row.discount !== expected.discount || snapshot.otherAmount !== expected.otherAmount
    || row.preferentialAmount !== expected.preferentialAmount) return false
  try {
    const expectedDetails = JSON.parse(String(expected.bjProducts)) as unknown
    const actualDetails = row.bjProducts
    if (!sameValue(expectedDetails, actualDetails)) return false
  } catch { return false }
  return exts.serviceType === expectedExts?.serviceType
    && exts.sourceType === expectedExts?.sourceType
    && exts.coupons === expectedExts?.coupons
    && exts.couponsVal === expectedExts?.couponsVal
    && exts.couponsName === expectedExts?.couponsName
    && exts.isCreateBjdPDF === expectedExts?.isCreateBjdPDF
    && exts.orphanId === mockJourneyNodes.quotation
    && Object.keys(expectedExts ?? {}).every(key => key === 'orphanId' || sameValue(exts[key], expectedExts?.[key]))
}

async function readRawOrder(id: string, authorized: () => boolean): Promise<unknown | null> {
  if (!authorized()) return null
  try {
    const raw = await tryMockRead('basic/order/queryById', { id }, { latencyMs: 0 })
    if (!authorized()) return null
    return record(raw)?.data ?? null
  } catch { return null }
}

export function createAStageMockQuoteOrderController(options: {
  readonly getActor: () => AStageQuoteActor | null
  readonly storage: StoragePort
  readonly enableOrderFields?: boolean
  readonly orderFields?: OrderFieldSession
}) {
  const expectedActor = options.getActor()
  let inFlight = false
  const authorized = () => Boolean(expectedActor?.identity
    && isAStageMockOrderEnabled({ workOrderId: mockJourneyWorkOrderId,
      userId: expectedActor.userId, roleId: expectedActor.roleId })
    && options.getActor()?.identity === expectedActor.identity
    && options.getActor()?.userId === expectedActor.userId
    && options.getActor()?.roleId === expectedActor.roleId)

  let fields: OrderFieldSession | undefined = options.orderFields
  async function savedExts() {
    const receipt = await readReceipt()
    if (receipt !== 'invalid' && receipt?.state === 'succeeded') {
      const order = record(await readRawOrder(mockJourneyOfficialOrderId, authorized))
      return order?._id === mockJourneyOfficialOrderId && order.type === 1 && order.serviceAppointmentId === mockJourneyWorkOrderId
        && order.workflowId === mockJourneyOrderWorkflowRunId ? record(order.exts) : null
    }
    const quote = record(await readRawOrder(mockJourneyQuotationId, authorized))
    return quote?._id === mockJourneyQuotationId && quote.type === 0 && quote.serviceAppointmentId === mockJourneyWorkOrderId ? record(quote.exts) : null
  }

  async function canSaveFields() {
    const receipt = await readReceipt()
    return authorized() && (receipt === null || (receipt !== 'invalid' && !receipt.orderExts && receipt.state === 'quote_created'))
  }
  if (!fields && options.enableOrderFields === true) {
    const media = createMockOrderMediaSession({ lockKey: receiptKey,
      queue: createDefaultMediaUploadQueue(options.storage, createSpecialDevMockUploadPort()), picker: createDefaultMediaFilePickerPort(),
      userId: expectedActor?.userId ?? '', workOrderId: mockJourneyWorkOrderId, nodeId: mockJourneyNodes.quotation,
      authorized, canSave: canSaveFields, draft: () => fields?.current() ?? null, savedExts,
    })
    fields = createMockOrderFieldSession(options.storage, authorized, `${expectedActor?.userId}:${expectedActor?.roleId}:${mockJourneyWorkOrderId}`, savedExts, canSaveFields, media)
  }

  const readApi = new QuotationOrderReadAdapter({
    async execute(request) {
      if (!authorized() || request.path !== 'basic/order/queryById'
        || request.body?.id !== mockJourneyOfficialOrderId) {
        throw new Error('Order read is not scoped to this synthetic task')
      }
      const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
      if (raw === null) throw new Error('A Mock Order read unavailable; no real fallback')
      return raw
    },
  })

  function input(engine: QuotationEngineResult) {
    let evaluated = engine
    if (fields) {
      const draft = fields.current()
      if (!draft || draft.input.context.serviceType !== engine.payload?.exts.serviceType) return null
      // Saved Quote and submitOrder input have independent immutable snapshots.
      // Do not let a later submit-only edit invalidate the type=0 receipt.
      const placeKeys = new Set(draft.input.rows.filter(row => configuredStage(row.frontEndConfig) === 'placeOrder').map(row => row.valueKey))
      const submitOnly = new Set(draft.input.rows.filter(row => configuredStage(row.frontEndConfig) === 'submitOrder' && !placeKeys.has(row.valueKey)).map(row => row.valueKey))
      const values = Object.fromEntries(Object.entries(draft.input.values).filter(([key]) => !submitOnly.has(key)))
      const result = evaluateOrderExtFields({ ...draft.input, context: { ...draft.input.context, stage: 'placeOrder' }, values }, 'submit')
      if (result.state !== 'ready' || !engine.payload || hasReservedOrderFieldKeys(result.exts ?? {})) return null
      evaluated = { ...engine, payload: { ...engine.payload, exts: { ...engine.payload.exts, ...result.exts } } }
    }
    const quote = baseQuotePayload(evaluated)
    return expectedActor && quote ? {
      quote,
      fingerprint: digest(quote),
      authFingerprint: digest(expectedActor.identity),
      draftVersion: engine.draftVersion,
    } : null
  }

  function expectedOrder(quote: Record<string, unknown>, receipt: FlowReceipt): Record<string, unknown> {
    return { ...quote, exts: { ...record(quote.exts), ...receipt.orderExts } }
  }

  async function readReceipt(): Promise<FlowReceipt | null | 'invalid'> {
    try {
      const result = await options.storage.read<unknown>({ namespace: 'draft', key: receiptKey })
      if (result.state !== 'succeeded') return 'invalid'
      if (result.data === null) return null
      const value = result.data
      if (!validReceipt(value) || value.authorizationFingerprint !== digest(expectedActor?.identity ?? '')) return 'invalid'
      return value
    } catch { return 'invalid' }
  }

  async function writeReceipt(receipt: FlowReceipt): Promise<boolean> {
    try {
      if (receipt.orderExts) fields?.freeze?.()
      return (await options.storage.write({ namespace: 'draft', key: receiptKey }, receipt)).state === 'succeeded'
    } catch { return false }
  }

  async function readQuote(expected: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const value = await readRawOrder(mockJourneyQuotationId, authorized)
    return quoteMatches(value, mockJourneyQuotationId, expected) ? value as Record<string, unknown> : null
  }

  async function readOfficialOrder(expected: Record<string, unknown>, workflowId: string): Promise<boolean> {
    const read = await readApi.getQuotationOrderById(mockJourneyOfficialOrderId)
    return authorized() && read.state === 'succeeded' && read.data !== undefined
      && orderMatches(read.data as unknown as Record<string, unknown>, expected, workflowId)
  }

  async function readStatus(engine: QuotationEngineResult): Promise<AStageQuoteFlowState> {
    if (!authorized() || (fields && !await fields.verifyCurrent())) return 'blocked'
    const current = input(engine)
    if (!current) return 'blocked'
    const receipt = await readReceipt()
    if (receipt === 'invalid') return 'blocked'
    if (receipt === null) {
      const preexistingQuote = await readRawOrder(mockJourneyQuotationId, authorized)
      const preexistingOrder = await readRawOrder(mockJourneyOfficialOrderId, authorized)
      return preexistingQuote || preexistingOrder ? 'blocked' : 'ready'
    }
    if (receipt.fingerprint !== current.fingerprint || receipt.draftVersion !== current.draftVersion) return 'blocked'
    if (receipt.state === 'ambiguous' || receipt.state === 'quote_create_dispatched'
      || receipt.state === 'workflow_start_dispatched' || receipt.state === 'order_upsert_dispatched') return 'uncertain'
    if (receipt.state === 'succeeded') {
      return receipt.orderId === mockJourneyOfficialOrderId
        && receipt.quoteId === mockJourneyQuotationId
        && receipt.workflowId === mockJourneyOrderWorkflowRunId
        && await readOfficialOrder(expectedOrder(current.quote, receipt), receipt.workflowId)
        ? 'succeeded' : 'uncertain'
    }
    if (receipt.state === 'quote_created' || receipt.state === 'workflow_started') {
      return await readQuote(current.quote) ? 'quote_created' : 'uncertain'
    }
    return 'ready'
  }

  async function createQuoteUnlocked(engine: QuotationEngineResult): Promise<{
    readonly state: 'quote_created' | 'succeeded' | 'blocked' | 'uncertain'; readonly message: string
  }> {
    if (!authorized()) return { state: 'blocked', message: '账号、角色或流程范围已变化，不能保存报价。' }
    if (inFlight) return { state: 'blocked', message: '上一项报价操作仍在处理。' }
    const current = input(engine)
    if (!current) return { state: 'blocked', message: '报价价格或明细未通过 R1 规则核验。' }
    inFlight = true
    try {
      const state = await readStatus(engine)
      if (state === 'quote_created') return { state, message: '报价单记录已保存并完成回读。' }
      if (state === 'succeeded') return { state, message: '订单记录已保存并完成回读。' }
      if (state === 'uncertain') return { state, message: '保存结果待核对；系统已阻止重复提交。' }
      if (state === 'blocked') return { state, message: '报价身份或本地防重记录无法核验，未继续保存。' }
      let receipt = await readReceipt()
      if (receipt === 'invalid') return { state: 'blocked', message: '本地防重记录不可用，未发送报价请求。' }
      if (receipt && receipt.fingerprint !== current.fingerprint) {
        return { state: 'blocked', message: '当前草稿与已保存报价不同；请在订单记录核对，未创建第二份报价。' }
      }
      receipt = receipt ?? {
        version: 1, state: 'prepared', fingerprint: current.fingerprint,
        authorizationFingerprint: current.authFingerprint, draftVersion: current.draftVersion,
      }
      if (!await writeReceipt(receipt)) return { state: 'blocked', message: '本地防重记录无法保存，未发送报价请求。' }
      if (!authorized()) return { state: 'blocked', message: '报价提交前账号或角色已变化，未发送请求。' }
      if (!await writeReceipt({ ...receipt, state: 'quote_create_dispatched', uncertainPhase: 'quote' })) {
        return { state: 'blocked', message: '本地防重记录无法保存，未发送报价请求。' }
      }
      try {
        const response = await tryMockCommand('basic/order/creatQuotation', { data: JSON.stringify(current.quote) })
        if (!authorized()) return { state: 'uncertain', message: '报价请求已发出，身份发生变化；请只读核对结果。' }
        const id = successfulEnvelope(response) ? returnedId(response, 'data') : null
        if (!id || id !== mockJourneyQuotationId) {
          await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'quote' })
          return { state: 'uncertain', message: '报价保存结果尚未确认；请只读核对，不能重复提交。' }
        }
        const savedQuote = await readQuote(current.quote)
        if (!authorized()) return { state: 'uncertain', message: '报价回读期间身份发生变化，结果仍待核对。' }
        if (!savedQuote) {
          await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'quote', quoteId: id })
          return { state: 'uncertain', message: '报价已返回记录编号，但明细回读未能匹配；请勿重复提交。' }
        }
        const saved = await writeReceipt({ ...receipt, state: 'quote_created', quoteId: id })
        return saved
          ? { state: 'quote_created', message: '报价单记录已保存并完成回读。' }
          : { state: 'uncertain', message: '报价记录已回读，但本地防重状态未能保存；请只读核对。' }
      } catch {
        await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'quote' })
        return { state: 'uncertain', message: '报价请求结果暂不可确认；请只读核对，不能重复提交。' }
      }
    } finally { inFlight = false }
  }

  async function convertQuoteToOrderUnlocked(engine: QuotationEngineResult): Promise<{
    readonly state: 'quote_created' | 'succeeded' | 'blocked' | 'uncertain'; readonly message: string
  }> {
    if (!authorized()) return { state: 'blocked', message: '账号、角色或流程范围已变化，不能转换订单。' }
    if (inFlight) return { state: 'blocked', message: '上一项报价操作仍在处理。' }
    if (fields && !await fields.verifyCurrent()) return { state: 'blocked', message: '报价资料已在其他页面修改，请重新读取后核对。' }
    const fieldDraft = fields?.current()
    const finalFields = fieldDraft ? evaluateOrderExtFields({ ...fieldDraft.input,
      context: { ...fieldDraft.input.context, stage: 'submitOrder', personType: typeof fieldDraft.input.values.personType === 'string' ? fieldDraft.input.values.personType : undefined } }, 'submit') : null
    if (finalFields && (finalFields.state !== 'ready' || hasReservedOrderFieldKeys(finalFields.exts ?? {}))) {
      return { state: 'blocked', message: '正式下单资料尚未通过校验，请核对字段配置与必填项。' }
    }
    const current = input(engine)
    if (!current) return { state: 'blocked', message: '报价价格或明细未通过 R1 规则核验。' }
    inFlight = true
    try {
      let receipt = await readReceipt()
      if (receipt === 'invalid' || !receipt || receipt.fingerprint !== current.fingerprint
        || receipt.draftVersion !== current.draftVersion) {
        return { state: 'blocked', message: '尚无与当前草稿一致且已回读的报价单。' }
      }
      if (receipt.state === 'succeeded') {
        return receipt.orderId === mockJourneyOfficialOrderId
          && receipt.quoteId === mockJourneyQuotationId
          && receipt.workflowId === mockJourneyOrderWorkflowRunId
          && await readOfficialOrder(expectedOrder(current.quote, receipt), receipt.workflowId)
          ? { state: 'succeeded', message: '订单记录已保存并按返回的订单编号完成回读。合同状态仍需单独核验。' }
          : { state: 'uncertain', message: '订单回读身份或金额无法再次核验；系统已保留防重复保护。' }
      }
      if (['quote_create_dispatched', 'workflow_start_dispatched', 'order_upsert_dispatched', 'ambiguous']
        .includes(receipt.state)) {
        return { state: 'uncertain', message: '上一项请求结果待核对；系统已阻止重复操作。' }
      }
      const quote = await readQuote(current.quote)
      if (!authorized()) return { state: 'blocked', message: '报价回读期间账号或角色已变化。' }
      if (!quote || receipt.quoteId !== mockJourneyQuotationId) {
        return { state: 'blocked', message: '报价单编号或明细无法确认，未启动订单流程。' }
      }
      if (receipt.orderExts && !sameValue(receipt.orderExts, finalFields?.exts ?? {})) {
        return { state: 'blocked', message: '下单资料已随流程冻结，请只读核对原请求。' }
      }
      receipt = { ...receipt, orderExts: receipt.orderExts ?? finalFields?.exts ?? {} }
      let workflowId = receipt.workflowId
      if (receipt.state !== 'workflow_started' || !workflowId) {
        receipt = { ...receipt, state: 'workflow_start_dispatched', quoteId: mockJourneyQuotationId,
          uncertainPhase: 'workflow' }
        if (!await writeReceipt(receipt)) return { state: 'blocked', message: '本地防重记录无法保存，未启动订单流程。' }
        if (!authorized()) return { state: 'blocked', message: '流程启动前账号或角色已变化。' }
        try {
          const response = await tryMockCommand(
            `workflow/startWorkflow/order/${mockJourneyQuotationId}/${mockJourneyOrderWorkflowDefinitionId}`,
            { saId: mockJourneyWorkOrderId },
          )
          if (!authorized()) return { state: 'uncertain', message: '订单流程请求已发出，身份发生变化；请只读核对。' }
          workflowId = successfulEnvelope(response) ? returnedId(response, 'entity') ?? returnedId(response, 'data') ?? undefined : undefined
          if (workflowId !== mockJourneyOrderWorkflowRunId) {
            await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'workflow' })
            return { state: 'uncertain', message: '订单流程启动结果未能确认，已阻止重复启动。' }
          }
          receipt = { ...receipt, state: 'workflow_started', workflowId, uncertainPhase: undefined }
          if (!await writeReceipt(receipt)) return { state: 'uncertain', message: '订单流程已启动，但本地回执未能保存。' }
        } catch {
          await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'workflow' })
          return { state: 'uncertain', message: '订单流程启动结果暂不可确认；请只读核对。' }
        }
      }
      if (!workflowId || workflowId !== mockJourneyOrderWorkflowRunId) {
        return { state: 'uncertain', message: '订单流程身份待核对，未写入正式订单。' }
      }
      if (!authorized()) return { state: 'blocked', message: '正式订单写入前账号或角色已变化。' }
      const orderPayload = {
        ...quote,
        ...current.quote,
        _id: mockJourneyQuotationId,
        type: 1,
        workflowId,
        processState: 0,
        exts: { ...record(quote.exts), ...record(current.quote.exts), ...receipt.orderExts, orphanId: mockJourneyNodes.quotation },
      }
      receipt = { ...receipt, state: 'order_upsert_dispatched', quoteId: mockJourneyQuotationId,
        workflowId, uncertainPhase: 'order' }
      if (!await writeReceipt(receipt)) return { state: 'blocked', message: '本地防重记录无法保存，未写入订单。' }
      try {
        const response = await tryMockCommand('basic/order/upsert', { order: JSON.stringify(orderPayload) })
        if (!authorized()) return { state: 'uncertain', message: '订单请求已发出，身份发生变化；请只读核对。' }
        const orderId = successfulEnvelope(response) ? returnedId(response, 'data') : null
        if (orderId !== mockJourneyOfficialOrderId) {
          await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'order' })
          return { state: 'uncertain', message: '订单保存结果尚未确认；请只读核对，不能重复提交。' }
        }
        const readback = await readOfficialOrder(expectedOrder(current.quote, receipt), workflowId)
        if (!authorized()) return { state: 'uncertain', message: '订单回读期间身份发生变化；结果待核对。' }
        if (!readback) {
          await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'order', orderId })
          return { state: 'uncertain', message: '订单编号已返回，但订单明细未能匹配；请勿重复提交。' }
        }
        const completed: FlowReceipt = { ...receipt, state: 'succeeded', quoteId: mockJourneyQuotationId,
          orderId, workflowId, uncertainPhase: undefined }
        const saved = await writeReceipt(completed)
        if (saved) await fields?.media?.finalize()
        return saved
          ? { state: 'succeeded', message: '订单记录已保存并按返回的订单编号完成回读。合同状态仍需单独核验。' }
          : { state: 'uncertain', message: '订单已回读，但本地防重状态未能保存；请只读核对。' }
      } catch {
        await writeReceipt({ ...receipt, state: 'ambiguous', uncertainPhase: 'order' })
        return { state: 'uncertain', message: '订单请求结果暂不可确认；请只读核对，不能重复提交。' }
      }
    } finally { inFlight = false }
  }

  async function verifyPendingUnlocked(engine: QuotationEngineResult): Promise<{
    readonly state: 'confirmed' | 'not_found' | 'blocked' | 'unknown'
    readonly message: string
  }> {
    if (!authorized()) return { state: 'blocked', message: '账号或角色已变化，不能跨角色核对。' }
    const current = input(engine)
    const receipt = await readReceipt()
    if (!current || receipt === null || receipt === 'invalid'
      || receipt.fingerprint !== current.fingerprint || !receipt.uncertainPhase) {
      return { state: 'blocked', message: '当前没有可独立核对的待确认回执。' }
    }
    if (receipt.uncertainPhase === 'quote') {
      const quote = await readQuote(current.quote)
      if (!authorized()) return { state: 'blocked', message: '核对期间身份已变化。' }
      if (!quote) return { state: 'not_found', message: '暂未读取到匹配报价；请求是否执行仍未知，防重保护保持有效。' }
      if (!await writeReceipt({ ...receipt, state: 'quote_created', quoteId: mockJourneyQuotationId,
        uncertainPhase: undefined })) return { state: 'unknown', message: '报价已回读，但防重状态无法更新。' }
      return { state: 'confirmed', message: '已按报价编号回读并核对报价单；不会自动启动订单流程。' }
    }
    if (receipt.uncertainPhase === 'workflow') {
      const workflow = readMockJourneyQuoteWorkflow()
      if (!authorized()) return { state: 'blocked', message: '核对期间身份已变化。' }
      if (workflow?.formDataId !== mockJourneyQuotationId
        || workflow.workflowId !== mockJourneyOrderWorkflowRunId) {
        return { state: 'not_found', message: '暂未确认订单流程；无法证明请求未执行，系统不会自动重启。' }
      }
      if (!await writeReceipt({ ...receipt, state: 'workflow_started', quoteId: mockJourneyQuotationId,
        workflowId: workflow.workflowId, uncertainPhase: undefined })) {
        return { state: 'unknown', message: '流程已回读，但防重状态无法更新。' }
      }
      return { state: 'confirmed', message: '已按报价编号核对订单流程；可继续单独保存订单。' }
    }
    const workflowId = receipt.workflowId
    if (workflowId !== mockJourneyOrderWorkflowRunId) {
      return { state: 'unknown', message: '订单流程编号缺失或不匹配，无法确认订单归属。' }
    }
    const orderRead = await readOfficialOrder(expectedOrder(current.quote, receipt), workflowId)
    if (!authorized()) return { state: 'blocked', message: '核对期间身份已变化。' }
    if (!orderRead) return { state: 'not_found', message: '暂未确认匹配订单；请求是否执行仍未知，不能再次提交。' }
    if (!await writeReceipt({ ...receipt, state: 'succeeded', quoteId: mockJourneyQuotationId,
      orderId: mockJourneyOfficialOrderId, workflowId, uncertainPhase: undefined })) {
      return { state: 'unknown', message: '订单已回读，但防重状态无法更新。' }
    }
    await fields?.media?.finalize()
    return { state: 'confirmed', message: '已按返回的订单编号核对订单及金额；签约仍需单独核验。' }
  }

  async function readMockOrder(): Promise<{
    readonly state: 'confirmed' | 'unavailable' | 'blocked'
    readonly order?: QuotationOrderBrowseItem
  }> {
    if (!authorized()) return { state: 'blocked' }
    try {
      const result = await readApi.getQuotationOrderById(mockJourneyOfficialOrderId)
      if (!authorized()) return { state: 'blocked' }
      if (result.state !== 'succeeded' || !result.data) return { state: 'unavailable' }
      const order = result.data
      if (order.id !== mockJourneyOfficialOrderId || order.type !== 1
        || order.serviceAppointmentId !== mockJourneyWorkOrderId
        || order.workflowId !== mockJourneyOrderWorkflowRunId
        || order.originPrice === undefined || order.totalPrice === undefined
        || !Number.isFinite(order.originPrice) || !Number.isFinite(order.totalPrice)
        || order.totalPrice <= 0) return { state: 'blocked' }
      const display = projectExactQuotationOrderReadForBrowse(order)
      return display.id === mockJourneyOfficialOrderId && display.serviceAppointmentId === mockJourneyWorkOrderId
        ? { state: 'confirmed', order: display } : { state: 'blocked' }
    } catch { return { state: 'unavailable' } }
  }

  async function createQuote(engine: QuotationEngineResult) {
    return await withScopedDraftLock(receiptKey, () => createQuoteUnlocked(engine)) ?? { state: 'blocked' as const, message: '当前浏览器无法安全锁定报价操作。' }
  }
  async function convertQuoteToOrder(engine: QuotationEngineResult) {
    return await withScopedDraftLock(receiptKey, () => convertQuoteToOrderUnlocked(engine)) ?? { state: 'blocked' as const, message: '当前浏览器无法安全锁定订单操作。' }
  }
  async function verifyPending(engine: QuotationEngineResult) {
    return await withScopedDraftLock(receiptKey, () => verifyPendingUnlocked(engine)) ?? { state: 'blocked' as const, message: '当前浏览器无法安全锁定结果核对。' }
  }
  return { readStatus, createQuote, convertQuoteToOrder, verifyPending, readMockOrder, fields }
}

export function readAStageMockOrderForActor(getActor: () => AStageQuoteActor | null) {
  return createAStageMockQuoteOrderController({ getActor,
    storage: createDefaultStoragePort() }).readMockOrder()
}

export function createAStageMockQuoteOrderControllerForActor(getActor: () => AStageQuoteActor | null) {
  return createAStageMockQuoteOrderController({ getActor, storage: createDefaultStoragePort(), enableOrderFields: true })
}
