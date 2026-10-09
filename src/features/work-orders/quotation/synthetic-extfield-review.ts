import { evaluateFieldState, normalizeFieldValue, normalizeSubmission } from '@runtimes/dynamic-form'
import type { FormFieldSchema, NormalizedFieldValue } from '@runtimes/dynamic-form'
import type { OperationSnapshot } from '@shared/types'
import type { StoragePort } from '@shared/ports'

import {
  createOrderExtFieldEffectivePlan,
  type OrderExtFieldEffectiveContext,
  type OrderExtFieldRawRow,
  type OrderExtFieldStage,
} from './order-extfield-effective-plan'

export const SYNTHETIC_ORDER_EXTFIELD_FIXTURE_VERSION = 'order-extfield-fixture-v1'
export const SYNTHETIC_ORDER_EXTFIELD_SCENARIO = 'dynamic-fields'

export interface SyntheticOrderExtFieldIdentity {
  readonly userId: string
  readonly workOrderId: string
  readonly workflowNodeId: string
  readonly actionIntent: string
  readonly scenario: typeof SYNTHETIC_ORDER_EXTFIELD_SCENARIO
  readonly fixtureVersion: typeof SYNTHETIC_ORDER_EXTFIELD_FIXTURE_VERSION
}

export interface SyntheticOrderExtFieldDraftValues {
  readonly [key: string]: unknown
}

export interface SyntheticOrderExtFieldDraftRecord {
  readonly schemaVersion: 1
  readonly identity: SyntheticOrderExtFieldIdentity
  readonly updatedAt: string
  /** Tuple encoding keeps arbitrary legacy keys (including __proto__) inert. */
  readonly values: readonly (readonly [string, unknown])[]
}

export type SyntheticOrderExtFieldDraftLoad =
  | { readonly state: 'ready'; readonly values: Readonly<Record<string, unknown>>; readonly preservedUnknownValues: readonly (readonly [string, unknown])[] }
  | { readonly state: 'empty' }
  | { readonly state: 'corrupt' }
  | { readonly state: 'unavailable' }

export interface SyntheticOrderExtFieldDraftSession {
  load(): Promise<SyntheticOrderExtFieldDraftLoad>
  schedule(values: Readonly<Record<string, unknown>>): void
  flush(): Promise<void>
  dispose(): void
}

export interface SyntheticOrderExtFieldDraftSessionOptions {
  readonly debounceMs?: number
  readonly now?: () => string
  readonly setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
  readonly onWriteState?: (state: 'saving' | 'saved' | 'failed') => void
}

export const syntheticOrderExtFieldRows: readonly OrderExtFieldRawRow[] = [
  {
    rowId: 'demo-mode-row', valueKey: 'demoMode', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '1', frontEndConfig: { showType: 'placeOrder' },
  },
  {
    rowId: 'demo-conditional-required-row', valueKey: 'demoConditionalRequired', colName: 'order', state: 1, showList: [4],
    type: 'textarea', required: '1', frontEndConfig: { showType: 'placeOrder', showField: 'demoMode', showValue: '是' },
  },
  {
    rowId: 'demo-waiver-mode-row', valueKey: 'demoWaiverMode', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '0', frontEndConfig: { showType: 'placeOrder' },
  },
  {
    rowId: 'demo-waived-required-row', valueKey: 'demoWaivedRequired', colName: 'order', state: 1, showList: [4],
    type: 'textarea', required: '1', frontEndConfig: {
      showType: 'placeOrder', dispensableField: 'demoWaiverMode', dispensableValue: '豁免',
    },
  },
  {
    rowId: 'demo-shared-visible-yes-row', valueKey: 'demoSharedExplanation', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '0', frontEndConfig: { showType: 'placeOrder', showField: 'demoMode', showValue: '是' },
  },
  {
    rowId: 'demo-shared-visible-no-row', valueKey: 'demoSharedExplanation', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '0', frontEndConfig: { showType: 'placeOrder', showField: 'demoMode', showValue: '否' },
  },
  {
    rowId: 'demo-stage-filtered-row', valueKey: 'demoSubmitOnly', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '1', frontEndConfig: { showType: 'submitOrder' },
  },
  {
    rowId: 'demo-service-filtered-row', valueKey: 'demoServiceOnly', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '1', frontEndConfig: { showType: 'placeOrder', serviceType: ['demo-service-other'] },
  },
  {
    rowId: 'demo-person-filtered-row', valueKey: 'demoPersonOnly', colName: 'order', state: 1, showList: [4],
    type: 'text', required: '1', frontEndConfig: { showType: 'submitOrder', personType: 'demo-person-tenant' },
  },
  {
    rowId: 'demo-digit-row', valueKey: 'demoDigit', colName: 'order', state: 1, showList: [4],
    type: 'digit', required: '0', frontEndConfig: { showType: 'placeOrder' },
  },
  {
    rowId: 'demo-area-blocked-row', valueKey: 'demoArea', colName: 'order', state: 1, showList: [4],
    type: 'area', required: '0', frontEndConfig: { showType: 'placeOrder' },
  },
  {
    rowId: 'demo-button-blocked-row', valueKey: 'demoButton', colName: 'order', state: 1, showList: [4],
    type: 'button', required: '0', frontEndConfig: { showType: 'placeOrder' },
  },
  {
    rowId: 'demo-media-blocked-row', valueKey: 'demoRequiredImage', colName: 'order', state: 1, showList: [4],
    type: 'image', required: '1', frontEndConfig: { showType: 'submitOrder' },
  },
  {
    rowId: 'demo-provider-select-blocked-row', valueKey: 'demoProviderSelect', colName: 'order', state: 1, showList: [4],
    type: 'select', required: '0', valueOption: 'demo-unfetched-provider', frontEndConfig: { showType: 'placeOrder' },
  },
  {
    rowId: 'demo-provider-cascade-blocked-row', valueKey: 'demoProviderCascade', colName: 'order', state: 1, showList: [4],
    type: 'cascade', required: '0', valueOption: 'demo-unfetched-cascade', frontEndConfig: { showType: 'placeOrder' },
  },
] as const

const labelsByRowId: Readonly<Record<string, string>> = {
  'demo-mode-row': '是否需要专项说明',
  'demo-conditional-required-row': '专项说明内容',
  'demo-waiver-mode-row': '最终提交豁免条件',
  'demo-waived-required-row': '目录进入必填示例',
  'demo-shared-visible-yes-row': '共享键说明（条件为是）',
  'demo-shared-visible-no-row': '共享键说明（条件为否）',
  'demo-stage-filtered-row': '提交阶段字段（当前阶段不展示）',
  'demo-service-filtered-row': '其他服务类型字段',
  'demo-person-filtered-row': '其他客户类型字段',
  'demo-digit-row': '工程量补充值',
  'demo-area-blocked-row': '省／市／区（Provider 未接入）',
  'demo-button-blocked-row': '受控业务动作（不执行）',
  'demo-media-blocked-row': '必填照片（持久化契约未接入）',
  'demo-provider-select-blocked-row': '业务选项（Provider 未读取）',
  'demo-provider-cascade-blocked-row': '级联选项（Provider 未读取）',
}

const knownValueKeys = new Set(syntheticOrderExtFieldRows.map((row) => row.valueKey).filter((key): key is string => typeof key === 'string'))
const identityFields = ['userId', 'workOrderId', 'workflowNodeId', 'actionIntent', 'scenario', 'fixtureVersion'] as const
const keyGeneration = new Map<string, number>()
const keyWriteChains = new Map<string, Promise<void>>()

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameIdentity(left: unknown, right: SyntheticOrderExtFieldIdentity): boolean {
  if (!isRecord(left)) return false
  return identityFields.every((key) => left[key] === right[key])
}

function validScalarDraftValue(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

function scopeKey(identity: SyntheticOrderExtFieldIdentity): string {
  return [
    'g4f-synthetic-order-extfield', 'v1',
    ...identityFields.map((key) => encodeURIComponent(identity[key])),
  ].join(':')
}

function decodeDraft(
  raw: unknown,
  identity: SyntheticOrderExtFieldIdentity,
): SyntheticOrderExtFieldDraftLoad {
  if (raw === null || raw === undefined) return { state: 'empty' }
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !sameIdentity(raw.identity, identity)
    || typeof raw.updatedAt !== 'string' || !Array.isArray(raw.values)) return { state: 'corrupt' }

  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const preservedUnknownValues: [string, unknown][] = []
  const seen = new Set<string>()
  for (const entry of raw.values) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || seen.has(entry[0])) {
      return { state: 'corrupt' }
    }
    const [key, value] = entry as [string, unknown]
    seen.add(key)
    if (knownValueKeys.has(key)) {
      if (!validScalarDraftValue(value)) return { state: 'corrupt' }
      values[key] = value
    } else {
      preservedUnknownValues.push([key, value])
    }
  }
  return { state: 'ready', values, preservedUnknownValues }
}

function failedStorageWrite(snapshot: OperationSnapshot<void>): boolean {
  return snapshot.state !== 'succeeded'
}

export function createSyntheticOrderExtFieldPlan(
  values: Readonly<Record<string, unknown>>,
  stage: OrderExtFieldStage = 'placeOrder',
): ReturnType<typeof createOrderExtFieldEffectivePlan> {
  const context: OrderExtFieldEffectiveContext = {
    stage,
    serviceType: 'demo-service-roof',
    personType: 'demo-person-owner',
    values,
  }
  return createOrderExtFieldEffectivePlan(syntheticOrderExtFieldRows, context)
}

export function syntheticOrderExtFieldLabel(rowId: string | undefined): string {
  return rowId ? labelsByRowId[rowId] ?? '合成字段' : '合成字段'
}

export function syntheticOrderExtFieldSchemaLabel(field: FormFieldSchema): string {
  const row = syntheticOrderExtFieldRows.find((candidate) => candidate.rowId === field.fieldId)
  return syntheticOrderExtFieldLabel(typeof row?.rowId === 'string' ? row.rowId : undefined)
}

export function validateSyntheticCatalogEntry(
  plan: ReturnType<typeof createOrderExtFieldEffectivePlan>,
  values: Readonly<Record<string, unknown>>,
): { readonly ok: true; readonly values: Readonly<Record<string, NormalizedFieldValue>> } | {
  readonly ok: false
  readonly fieldId?: string
  readonly message: string
} {
  const requiredBlocker = plan.diagnostics.requiredBlockerRowIds[0]
  if (requiredBlocker) {
    const row = plan.rows.find((candidate) => candidate.rowId === requiredBlocker)
    return { ok: false, fieldId: requiredBlocker, message: `必填字段暂不支持安全编辑：${syntheticOrderExtFieldLabel(row?.rowId)}` }
  }
  const normalized = normalizeSubmission({ fields: plan.fields, values, surface: 'mobile_detail' })
  if (!normalized.ok) {
    return {
      ok: false,
      fieldId: normalized.fieldId,
      message: normalized.reason === 'validation'
        ? `请填写必填项：${syntheticOrderExtFieldLabel(normalized.fieldId)}`
        : `字段能力未通过安全校验：${syntheticOrderExtFieldLabel(normalized.fieldId)}`,
    }
  }
  return { ok: true, values: normalized.value.values }
}

export interface SyntheticFinalSubmitRow {
  readonly rowId: string
  readonly label: string
  readonly state: 'missing' | 'valid' | 'blocked' | 'optional'
  readonly reason?: string
}

export function syntheticFinalSubmitRows(
  plan: ReturnType<typeof createOrderExtFieldEffectivePlan>,
  values: Readonly<Record<string, unknown>>,
): readonly SyntheticFinalSubmitRow[] {
  const rowIds = [...new Set([
    ...plan.diagnostics.finalSubmitRequiredRowIds,
    ...plan.rows.filter((row) => row.finalSubmit.state === 'optional' && row.rowId).map((row) => row.rowId!),
  ])]
  return rowIds.map((rowId) => {
    const row = plan.rows.find((candidate) => candidate.rowId === rowId)
    if (row?.finalSubmit.state === 'optional') {
      return { rowId, label: syntheticOrderExtFieldLabel(row.rowId), state: 'optional', reason: row.finalSubmit.reason }
    }
    if (!row?.valueKey || !row.controlType) return { rowId, label: syntheticOrderExtFieldLabel(row?.rowId), state: 'blocked', reason: '最终提交规则缺少可验证字段映射' }
    if (row.disposition === 'blocked') return { rowId, label: syntheticOrderExtFieldLabel(row.rowId), state: 'blocked', reason: '此控件目前不支持安全编辑' }
    const raw = values[row.valueKey]
    if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
      return { rowId, label: syntheticOrderExtFieldLabel(row.rowId), state: 'missing' }
    }
    const normalized = normalizeFieldValue(row.controlType, raw)
    return normalized.ok
      ? { rowId, label: syntheticOrderExtFieldLabel(row.rowId), state: 'valid' }
      : { rowId, label: syntheticOrderExtFieldLabel(row.rowId), state: 'blocked', reason: normalized.message }
  })
}

export function syntheticEffectiveFieldStates(
  plan: ReturnType<typeof createOrderExtFieldEffectivePlan>,
  values: Readonly<Record<string, unknown>>,
) {
  return plan.fields.map((field) => ({
    field,
    state: evaluateFieldState(field, { values, surface: 'mobile_detail' }),
  }))
}

export function createSyntheticOrderExtFieldDraftSession(
  storage: StoragePort,
  identity: SyntheticOrderExtFieldIdentity,
  options: SyntheticOrderExtFieldDraftSessionOptions = {},
): SyntheticOrderExtFieldDraftSession {
  const storageKey = { namespace: 'draft' as const, key: scopeKey(identity) }
  const debounceMs = options.debounceMs ?? 250
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
  const now = options.now ?? (() => new Date().toISOString())
  const generation = (keyGeneration.get(storageKey.key) ?? 0) + 1
  keyGeneration.set(storageKey.key, generation)
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let pendingValues: Readonly<Record<string, unknown>> | undefined
  let loadResult: SyntheticOrderExtFieldDraftLoad | undefined

  async function readAfterPriorWrites(): Promise<OperationSnapshot<unknown | null>> {
    await (keyWriteChains.get(storageKey.key) ?? Promise.resolve())
    return storage.read<unknown>(storageKey)
  }

  function enqueueWrite(values: Readonly<Record<string, unknown>>, expectedGeneration: number): Promise<void> {
    const prior = keyWriteChains.get(storageKey.key) ?? Promise.resolve()
    const next = prior.then(async () => {
      if (disposed || keyGeneration.get(storageKey.key) !== expectedGeneration) return
      const entries: [string, unknown][] = []
      if (loadResult?.state === 'ready') entries.push(...loadResult.preservedUnknownValues.map(([key, value]) => [key, value] as [string, unknown]))
      for (const key of knownValueKeys) {
        if (hasOwn(values, key)) entries.push([key, values[key]])
      }
      const record: SyntheticOrderExtFieldDraftRecord = {
        schemaVersion: 1,
        identity,
        updatedAt: now(),
        values: entries,
      }
      const result = await storage.write(storageKey, record)
      if (failedStorageWrite(result)) throw new Error('synthetic draft storage write failed')
    })
    keyWriteChains.set(storageKey.key, next.catch(() => undefined))
    return next
  }

  return {
    async load() {
      if (disposed) return { state: 'unavailable' }
      const result = await readAfterPriorWrites()
      if (disposed || keyGeneration.get(storageKey.key) !== generation || result.state !== 'succeeded') {
        loadResult = { state: 'unavailable' }
      } else {
        loadResult = decodeDraft(result.data, identity)
      }
      return loadResult
    },
    schedule(values) {
      if (disposed || keyGeneration.get(storageKey.key) !== generation || !loadResult || loadResult.state === 'corrupt' || loadResult.state === 'unavailable') return
      pendingValues = { ...values }
      if (timer) clearTimer(timer)
      timer = setTimer(() => {
        timer = undefined
        const snapshot = pendingValues
        pendingValues = undefined
        if (snapshot) {
          options.onWriteState?.('saving')
          void enqueueWrite(snapshot, generation)
            .then(() => {
              if (!disposed && keyGeneration.get(storageKey.key) === generation) options.onWriteState?.('saved')
            })
            .catch(() => {
              if (!disposed && keyGeneration.get(storageKey.key) === generation) options.onWriteState?.('failed')
            })
        }
      }, debounceMs)
    },
    async flush() {
      if (timer) {
        clearTimer(timer)
        timer = undefined
      }
      const snapshot = pendingValues
      pendingValues = undefined
      if (!snapshot || disposed || keyGeneration.get(storageKey.key) !== generation || !loadResult || loadResult.state === 'corrupt' || loadResult.state === 'unavailable') return
      options.onWriteState?.('saving')
      try {
        await enqueueWrite(snapshot, generation)
        if (!disposed && keyGeneration.get(storageKey.key) === generation) options.onWriteState?.('saved')
      } catch (error) {
        if (!disposed && keyGeneration.get(storageKey.key) === generation) options.onWriteState?.('failed')
        throw error
      }
    },
    dispose() {
      if (timer) clearTimer(timer)
      timer = undefined
      pendingValues = undefined
      disposed = true
      if (keyGeneration.get(storageKey.key) === generation) keyGeneration.set(storageKey.key, generation + 1)
    },
  }
}

export function syntheticOrderExtFieldStorageKey(identity: SyntheticOrderExtFieldIdentity): string {
  return scopeKey(identity)
}
