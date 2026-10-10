import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ActionDraftIdentity, ActionDraftRepository } from '@runtimes/action'
import type {
  CodeOptionRead,
  QuotationCatalogItemRead,
  QuotationPackageDetailRead,
  QuotationPackageRead,
} from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

import { quotationCatalogItemFor, quotationCatalogKindLabels } from './catalog'
import { decodeQuotationDraftRecord, quotationDraftRecordFor } from './draft-codec'
import {
  appendQuotationGroup,
  appendQuotationSelection,
  changeQuotationSelectionQuantity,
  createEmptyQuotationDraft,
  createQuotationGroup,
  isDirectQuotationCatalogKind,
  parseQuotationQuantity,
  quotationSelectionsFor,
  removeQuotationSelection,
  upsertQuotationPackageSelection,
  updateQuotationGroupContext,
  type QuotationDraft,
  type QuotationCatalogItem,
  type QuotationGroupContext,
  type QuotationLineKind,
} from './model'
import {
  configuredQuotationPackageCandidateFor,
  type QuotationPackageMaterialChoice,
} from './package-configuration'

export type QuotationDraftLocalState =
  | 'idle'
  | 'loading'
  | 'fresh'
  | 'restored'
  | 'dirty'
  | 'saving'
  | 'saved_local'
  | 'save_failed'
  | 'legacy_requires_action'
  | 'invalid'
  | 'unavailable'

function succeeded<T = void>(data?: T): OperationSnapshot<T> {
  return { state: 'succeeded', ...(data === undefined ? {} : { data }) }
}

function failed<T = void>(category: 'validation' | 'unsupported_capability' | 'server_terminal', message: string): OperationSnapshot<T> {
  const error = createOperationError(category, message)
  return { state: 'failed_terminal', error }
}

function selections(draft: QuotationDraft) {
  return draft.groups.flatMap((group) => [
    ...group.projPackages,
    ...group.procedures,
    ...group.materials,
    ...group.measures,
  ])
}

export const useQuotationCompositionStore = defineStore('quotationComposition', () => {
  const draft = ref<QuotationDraft | null>(null)
  const localState = ref<QuotationDraftLocalState>('idle')
  const localStateMessage = ref('')
  const repairPartOptions = ref<readonly CodeOptionRead[]>([])
  const quantityTextBySelection = ref<Readonly<Record<string, string>>>({})
  const quantityErrorBySelection = ref<Readonly<Record<string, string>>>({})
  const groups = computed(() => draft.value?.groups ?? [])
  const selectionCount = computed(() => draft.value ? selections(draft.value).length : 0)
  const catalogKindLabels = quotationCatalogKindLabels

  let repository: ActionDraftRepository | null = null
  let identity: ActionDraftIdentity | null = null
  let now: () => string = () => new Date().toISOString()
  let debounceMs = 360
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let activeWrite: { readonly generation: number; readonly promise: Promise<OperationSnapshot<void>> } | null = null

  function canEdit(): boolean {
    return ['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(localState.value)
  }

  function clearTimer(): void {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function clear(): void {
    clearTimer()
    generation += 1
    repository = null
    identity = null
    draft.value = null
    localState.value = 'idle'
    localStateMessage.value = ''
    repairPartOptions.value = []
    quantityTextBySelection.value = {}
    quantityErrorBySelection.value = {}
  }

  function inputValuesFor(value: QuotationDraft): Record<string, string> {
    return Object.fromEntries(selections(value).map((selection) => [selection.selectionId, String(selection.quantity)]))
  }

  async function initialize(input: {
    readonly identity: ActionDraftIdentity
    readonly repository: ActionDraftRepository
    readonly repairPartOptions?: readonly CodeOptionRead[]
    readonly now?: () => string
    readonly debounceMs?: number
  }): Promise<QuotationDraftLocalState> {
    clearTimer()
    const currentGeneration = ++generation
    repository = input.repository
    identity = input.identity
    now = input.now ?? (() => new Date().toISOString())
    debounceMs = input.debounceMs ?? 360
    draft.value = null
    localState.value = 'loading'
    localStateMessage.value = ''
    repairPartOptions.value = input.repairPartOptions ?? []
    quantityTextBySelection.value = {}
    quantityErrorBySelection.value = {}

    const stored = await input.repository.read<Readonly<Record<string, unknown>>>(input.identity)
    if (currentGeneration !== generation) return localState.value
    if (stored.state !== 'succeeded') {
      localState.value = 'unavailable'
      localStateMessage.value = '本地草稿存储暂不可用。为避免覆盖未确认的数据，当前无法编辑。'
      return localState.value
    }
    if (!stored.data) {
      draft.value = createEmptyQuotationDraft(String(input.identity.workOrderId), String(input.identity.workflowNodeId))
      quantityTextBySelection.value = {}
      localState.value = 'fresh'
      return localState.value
    }

    const decoded = decodeQuotationDraftRecord(stored.data, input.identity)
    if (decoded.state === 'legacy_requires_action') {
      localState.value = 'legacy_requires_action'
      localStateMessage.value = decoded.reason
      return localState.value
    }
    if (decoded.state !== 'valid') {
      localState.value = 'invalid'
      localStateMessage.value = decoded.reason
      return localState.value
    }
    draft.value = decoded.draft
    quantityTextBySelection.value = inputValuesFor(decoded.draft)
    localState.value = 'restored'
    localStateMessage.value = '已恢复本地报价分组草稿。'
    return localState.value
  }

  function scheduleSave(): void {
    clearTimer()
    timer = setTimeout(() => {
      timer = undefined
      void persist()
    }, debounceMs)
  }

  function markDirty(): void {
    localState.value = 'dirty'
    localStateMessage.value = ''
    scheduleSave()
  }

  function createGroup(context: QuotationGroupContext = {}): OperationSnapshot<string> {
    if (!draft.value || !canEdit()) return failed<string>('unsupported_capability', '报价草稿当前不可编辑')
    const usedIds = draft.value.groups.flatMap((group) => {
      const match = /^quotation-group-(\d+)$/.exec(group.groupId)
      return match ? [Number(match[1])] : []
    })
    const groupId = `quotation-group-${Math.max(0, ...usedIds) + 1}`
    draft.value = appendQuotationGroup(draft.value, createQuotationGroup(groupId, context))
    markDirty()
    return succeeded(groupId)
  }

  function updateGroupContext(groupId: string, context: QuotationGroupContext): OperationSnapshot<void> {
    if (!draft.value || !canEdit()) return failed('unsupported_capability', '报价草稿当前不可编辑')
    if (!draft.value.groups.some((group) => group.groupId === groupId)) return failed('validation', '维修部位组已不存在')
    if (context.repairParts?.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
      return failed('validation', '维修部位路径无效')
    }
    const next = updateQuotationGroupContext(draft.value, groupId, context)
    if (next !== draft.value) {
      draft.value = next
      markDirty()
    }
    return succeeded()
  }

  /** Phase 1D deterministic local fixture selection only; provider read records are never accepted here. */
  function addCatalogItem(groupId: string, kind: QuotationLineKind, catalogId: string): OperationSnapshot<void> {
    if (!draft.value || !canEdit()) return failed('unsupported_capability', '报价草稿当前不可编辑')
    const group = draft.value.groups.find((item) => item.groupId === groupId)
    if (!group) return failed('validation', '请先选择有效的维修部位组')
    if (group.repairParts.length === 0) return failed('validation', '请先为维修部位组选择部位路径')
    const item = quotationCatalogItemFor(kind, catalogId)
    if (!item) return failed('validation', '所选目录项不可用')
    const usedIds = selections(draft.value).flatMap((selection) => {
      const match = /^quotation-selection-(\d+)$/.exec(selection.selectionId)
      return match ? [Number(match[1])] : []
    })
    const selectionId = `quotation-selection-${Math.max(0, ...usedIds) + 1}`
    draft.value = appendQuotationSelection(draft.value, groupId, item, selectionId)
    quantityTextBySelection.value = { ...quantityTextBySelection.value, [selectionId]: '1' }
    quantityErrorBySelection.value = { ...quantityErrorBySelection.value, [selectionId]: '' }
    markDirty()
    return succeeded()
  }

  /** Adds only allowlisted normalized direct reads to the local draft. */
  function addCatalogReadItem(groupId: string, source: QuotationCatalogItemRead): OperationSnapshot<void> {
    if (!isDirectQuotationCatalogKind(source.kind)) return failed('unsupported_capability', '该目录类型不能直接加入草稿')
    if (!draft.value || !canEdit()) return failed('unsupported_capability', '报价草稿当前不可编辑')
    const group = draft.value.groups.find((item) => item.groupId === groupId)
    if (!group) return failed('validation', '请先选择有效的维修部位组')
    if (group.repairParts.length === 0) return failed('validation', '请先为维修部位组选择部位路径')
    if (!source.id.trim() || !source.name.trim()) return failed('validation', '所选目录项身份不完整')
    if (quotationSelectionsFor(group, source.kind).some((selection) => selection.catalogId === source.id)) {
      // Re-selecting a row is an idempotent no-op. Quantity remains an explicit
      // user-edited field and is never increased as a side effect of selection.
      return succeeded()
    }

    // Project only local composition fields; provider commercial metadata is
    // intentionally excluded from the persisted draft model.
    const item = {
      catalogId: source.id,
      kind: source.kind,
      label: source.name,
      ...(source.unit ? { unit: source.unit } : {}),
    } satisfies QuotationCatalogItem
    const usedIds = selections(draft.value).flatMap((selection) => {
      const match = /^quotation-selection-(\d+)$/.exec(selection.selectionId)
      return match ? [Number(match[1])] : []
    })
    const selectionId = `quotation-selection-${Math.max(0, ...usedIds) + 1}`
    const next = appendQuotationSelection(draft.value, groupId, item, selectionId)
    if (next === draft.value) return failed('validation', '所选目录项未能加入当前分组')
    draft.value = next
    quantityTextBySelection.value = { ...quantityTextBySelection.value, [selectionId]: '1' }
    quantityErrorBySelection.value = { ...quantityErrorBySelection.value, [selectionId]: '' }
    markDirty()
    return succeeded()
  }

  function packageConfigurationCandidate(
    groupId: string,
    source: QuotationPackageRead,
    detail: QuotationPackageDetailRead,
    choices: readonly QuotationPackageMaterialChoice[],
  ) {
    if (!draft.value || !canEdit()) return failed('unsupported_capability', '报价草稿当前不可编辑')
    const group = draft.value.groups.find((item) => item.groupId === groupId)
    if (!group) return failed('validation', '请先选择有效的维修部位组')
    if (group.projPackages.filter((selection) => selection.catalogId === source.id).length > 1) {
      return failed('validation', '当前分组存在重复套餐记录，未修改草稿。')
    }
    return configuredQuotationPackageCandidateFor(group, source, detail, choices)
  }

  function validatePackageReadItem(
    groupId: string,
    source: QuotationPackageRead,
    detail: QuotationPackageDetailRead,
    choices: readonly QuotationPackageMaterialChoice[],
  ): OperationSnapshot<void> {
    const candidate = packageConfigurationCandidate(groupId, source, detail, choices)
    return candidate.state === 'succeeded'
      ? succeeded()
      : { state: candidate.state, ...(candidate.error ? { error: candidate.error } : {}) }
  }

  function configurePackageReadItem(
    groupId: string,
    source: QuotationPackageRead,
    detail: QuotationPackageDetailRead,
    choices: readonly QuotationPackageMaterialChoice[],
  ): OperationSnapshot<void> {
    const candidate = packageConfigurationCandidate(groupId, source, detail, choices)
    if (candidate.state !== 'succeeded' || !candidate.data || !draft.value) {
      return { state: candidate.state, ...(candidate.error ? { error: candidate.error } : {}) }
    }
    const group = draft.value.groups.find((item) => item.groupId === groupId)
    if (!group) return failed('validation', '请先选择有效的维修部位组')
    const existing = group.projPackages.find((selection) => selection.catalogId === source.id)
    const usedIds = selections(draft.value).flatMap((selection) => {
      const match = /^quotation-selection-(\d+)$/.exec(selection.selectionId)
      return match ? [Number(match[1])] : []
    })
    const selectionId = `quotation-selection-${Math.max(0, ...usedIds) + 1}`
    const next = upsertQuotationPackageSelection(draft.value, groupId, {
      catalogId: source.id,
      label: source.name,
      ...(source.unit ? { unit: source.unit } : {}),
      configuration: candidate.data.configuration,
      selectionId,
      initialQuantity: candidate.data.quantity,
    })
    if (next !== draft.value) {
      draft.value = next
      if (!existing) {
        quantityTextBySelection.value = { ...quantityTextBySelection.value, [selectionId]: String(candidate.data.quantity) }
        quantityErrorBySelection.value = { ...quantityErrorBySelection.value, [selectionId]: '' }
      }
      markDirty()
    }
    return succeeded()
  }

  function setQuantityText(groupId: string, selectionId: string, input: string): OperationSnapshot<void> {
    if (!draft.value || !canEdit()) return failed('unsupported_capability', '报价草稿当前不可编辑')
    quantityTextBySelection.value = { ...quantityTextBySelection.value, [selectionId]: input }
    const parsed = parseQuotationQuantity(input)
    if (!parsed.valid) {
      quantityErrorBySelection.value = { ...quantityErrorBySelection.value, [selectionId]: parsed.message }
      return failed('validation', parsed.message)
    }
    const group = draft.value.groups.find((item) => item.groupId === groupId)
    if (!group || !selections({ ...draft.value, groups: [group] }).some((item) => item.selectionId === selectionId)) {
      return failed('validation', '报价项目已不存在')
    }
    quantityErrorBySelection.value = { ...quantityErrorBySelection.value, [selectionId]: '' }
    const next = changeQuotationSelectionQuantity(draft.value, groupId, selectionId, parsed.value)
    if (next !== draft.value) {
      draft.value = next
      markDirty()
    }
    return succeeded()
  }

  function removeSelection(groupId: string, selectionId: string): OperationSnapshot<void> {
    if (!draft.value || !canEdit()) return failed('unsupported_capability', '报价草稿当前不可编辑')
    const next = removeQuotationSelection(draft.value, groupId, selectionId)
    if (next === draft.value) return failed('validation', '报价项目已不存在')
    draft.value = next
    const nextTexts = { ...quantityTextBySelection.value }
    const nextErrors = { ...quantityErrorBySelection.value }
    delete nextTexts[selectionId]
    delete nextErrors[selectionId]
    quantityTextBySelection.value = nextTexts
    quantityErrorBySelection.value = nextErrors
    markDirty()
    return succeeded()
  }

  async function persist(): Promise<OperationSnapshot<void>> {
    clearTimer()
    const currentRepository = repository
    const currentIdentity = identity
    const currentDraft = draft.value
    const currentGeneration = generation
    if (!currentRepository || !currentIdentity || !currentDraft) {
      return failed('unsupported_capability', '报价草稿当前不可保存')
    }
    if (localState.value === 'legacy_requires_action' || localState.value === 'invalid' || localState.value === 'unavailable') {
      return failed('unsupported_capability', '本地报价草稿需要先恢复后才能保存')
    }
    if (activeWrite?.generation === currentGeneration) return activeWrite.promise

    const writeVersion = currentDraft.draftVersion
    const record = quotationDraftRecordFor(currentIdentity, currentDraft, now())
    localState.value = 'saving'
    const write = {
      generation: currentGeneration,
      promise: currentRepository.write(record).then((result) => {
        if (currentGeneration !== generation) return result
        if (draft.value?.draftVersion !== writeVersion) {
          localState.value = 'dirty'
          scheduleSave()
        } else if (result.state === 'succeeded') {
          localState.value = 'saved_local'
          localStateMessage.value = '报价分组草稿已保存在本机。'
        } else {
          localState.value = 'save_failed'
          localStateMessage.value = '本地草稿保存失败，请保持页面打开并重试。'
        }
        return result
      }).finally(() => {
        if (activeWrite === write) activeWrite = null
      }),
    }
    activeWrite = write
    return write.promise
  }

  async function flushDraft(): Promise<OperationSnapshot<void>> {
    clearTimer()
    if (activeWrite?.generation === generation) {
      const inFlight = await activeWrite.promise
      if (localState.value === 'dirty' || localState.value === 'save_failed') return persist()
      return inFlight
    }
    if (localState.value === 'dirty' || localState.value === 'save_failed') return persist()
    return succeeded()
  }

  async function restoreServerOrderDraft(source: QuotationDraft): Promise<OperationSnapshot<void>> {
    if (!identity || localState.value !== 'fresh' || draft.value?.groups.length !== 0) {
      return failed('unsupported_capability', '已有本地草稿未完成处理，服务器订单不会覆盖本地内容。')
    }
    if (String(source.workOrderId) !== String(identity.workOrderId) || source.groups.length === 0) {
      return failed('validation', '服务器订单与当前工单不匹配，未恢复到本地草稿。')
    }
    draft.value = {
      ...source,
      workOrderId: String(identity.workOrderId),
      workflowNodeId: String(identity.workflowNodeId),
      draftVersion: 1,
    }
    quantityTextBySelection.value = inputValuesFor(draft.value)
    localState.value = 'restored'
    localStateMessage.value = '已从服务器订单恢复分组；目录身份将重新核对后才允许编辑。'
    return persist()
  }

  async function discardStoredDraftAndStartFresh(expectedState: 'invalid' | 'legacy_requires_action'): Promise<OperationSnapshot<void>> {
    if (!repository || !identity || localState.value !== expectedState) {
      return failed('validation', '当前没有需要显式处理的旧草稿')
    }
    const removed = await repository.remove(identity)
    if (removed.state !== 'succeeded') return removed
    draft.value = createEmptyQuotationDraft(String(identity.workOrderId), String(identity.workflowNodeId))
    quantityTextBySelection.value = {}
    quantityErrorBySelection.value = {}
    localState.value = 'fresh'
    localStateMessage.value = ''
    return succeeded()
  }

  return {
    draft,
    groups,
    selectionCount,
    localState,
    localStateMessage,
    repairPartOptions,
    catalogKindLabels,
    quantityTextBySelection,
    quantityErrorBySelection,
    initialize,
    clear,
    createGroup,
    updateGroupContext,
    isGroupEditable: (groupId: string) => canEdit() && draft.value?.groups.some((group) => group.groupId === groupId) === true,
    addCatalogItem,
    addCatalogReadItem,
    validatePackageReadItem,
    configurePackageReadItem,
    setQuantityText,
    removeSelection,
    flushDraft,
    restoreServerOrderDraft,
    discardInvalidDraft: () => discardStoredDraftAndStartFresh('invalid'),
    discardLegacyDraft: () => discardStoredDraftAndStartFresh('legacy_requires_action'),
    selectionsFor: (groupId: string, kind: QuotationLineKind) => {
      const group = draft.value?.groups.find((item) => item.groupId === groupId)
      return group ? quotationSelectionsFor(group, kind) : []
    },
  }
})
