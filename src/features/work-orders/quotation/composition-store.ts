import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ActionDraftIdentity, ActionDraftRepository } from '@runtimes/action'
import { createOperationError, type OperationSnapshot } from '@shared/types'

import { quotationCatalogItemFor, quotationCatalogKindLabels } from './catalog'
import { decodeQuotationDraftRecord, quotationDraftRecordFor } from './draft-codec'
import {
  appendQuotationLine,
  changeQuotationLineQuantity,
  createEmptyQuotationDraft,
  parseQuotationQuantity,
  removeQuotationLine,
  type QuotationDraft,
  type QuotationLineKind,
} from './model'

export type QuotationDraftLocalState =
  | 'idle'
  | 'loading'
  | 'fresh'
  | 'restored'
  | 'dirty'
  | 'saving'
  | 'saved_local'
  | 'save_failed'
  | 'invalid'
  | 'unavailable'

function succeeded(): OperationSnapshot<void> {
  return { state: 'succeeded', data: undefined }
}

function failed(category: 'validation' | 'unsupported_capability' | 'server_terminal', message: string): OperationSnapshot<void> {
  const error = createOperationError(category, message)
  return { state: 'failed_terminal', error }
}

export const useQuotationCompositionStore = defineStore('quotationComposition', () => {
  const draft = ref<QuotationDraft | null>(null)
  const localState = ref<QuotationDraftLocalState>('idle')
  const localStateMessage = ref('')
  const catalogOpen = ref(false)
  const selectedCatalogKind = ref<QuotationLineKind>('package')
  const quantityTextByLine = ref<Readonly<Record<string, string>>>({})
  const quantityErrorByLine = ref<Readonly<Record<string, string>>>({})
  const lines = computed(() => draft.value?.lines ?? [])
  const catalogKindLabels = quotationCatalogKindLabels

  let repository: ActionDraftRepository | null = null
  let identity: ActionDraftIdentity | null = null
  let now: () => string = () => new Date().toISOString()
  let debounceMs = 360
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let activeWrite: { readonly generation: number; readonly promise: Promise<OperationSnapshot<void>> } | null = null

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
    catalogOpen.value = false
    selectedCatalogKind.value = 'package'
    quantityTextByLine.value = {}
    quantityErrorByLine.value = {}
  }

  function inputValuesFor(value: QuotationDraft): Record<string, string> {
    return Object.fromEntries(value.lines.map((line) => [line.lineId, String(line.quantity)]))
  }

  async function initialize(input: {
    readonly identity: ActionDraftIdentity
    readonly repository: ActionDraftRepository
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
    quantityTextByLine.value = {}
    quantityErrorByLine.value = {}
    catalogOpen.value = false

    const stored = await input.repository.read<Readonly<Record<string, unknown>>>(input.identity)
    if (currentGeneration !== generation) return localState.value
    if (stored.state !== 'succeeded') {
      localState.value = 'unavailable'
      localStateMessage.value = '本地草稿存储暂不可用。为避免覆盖未确认的数据，当前无法编辑。'
      return localState.value
    }
    if (!stored.data) {
      draft.value = createEmptyQuotationDraft(String(input.identity.workOrderId), String(input.identity.workflowNodeId))
      quantityTextByLine.value = {}
      localState.value = 'fresh'
      return localState.value
    }

    const decoded = decodeQuotationDraftRecord(stored.data, input.identity)
    if (decoded.state !== 'valid') {
      localState.value = 'invalid'
      localStateMessage.value = decoded.reason
      return localState.value
    }
    draft.value = decoded.draft
    quantityTextByLine.value = inputValuesFor(decoded.draft)
    localState.value = 'restored'
    localStateMessage.value = '已恢复本地报价草稿。'
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

  function addCatalogItem(kind: QuotationLineKind, catalogId: string): OperationSnapshot<void> {
    if (!draft.value || !['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(localState.value)) {
      return failed('unsupported_capability', '报价草稿当前不可编辑')
    }
    const item = quotationCatalogItemFor(kind, catalogId)
    if (!item) return failed('validation', '所选目录项不可用')
    const usedIds = draft.value.lines.flatMap((line) => {
      const match = /^quotation-line-(\d+)$/.exec(line.lineId)
      return match ? [Number(match[1])] : []
    })
    const lineId = `quotation-line-${Math.max(0, ...usedIds) + 1}`
    draft.value = appendQuotationLine(draft.value, item, lineId)
    quantityTextByLine.value = { ...quantityTextByLine.value, [lineId]: '1' }
    quantityErrorByLine.value = { ...quantityErrorByLine.value, [lineId]: '' }
    markDirty()
    return succeeded()
  }

  function setQuantityText(lineId: string, input: string): OperationSnapshot<void> {
    if (!draft.value || !['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(localState.value)) {
      return failed('unsupported_capability', '报价草稿当前不可编辑')
    }
    quantityTextByLine.value = { ...quantityTextByLine.value, [lineId]: input }
    const parsed = parseQuotationQuantity(input)
    if (!parsed.valid) {
      quantityErrorByLine.value = { ...quantityErrorByLine.value, [lineId]: parsed.message }
      return failed('validation', parsed.message)
    }
    const previous = draft.value.lines.find((line) => line.lineId === lineId)
    if (!previous) return failed('validation', '报价明细已不存在')
    quantityErrorByLine.value = { ...quantityErrorByLine.value, [lineId]: '' }
    if (previous.quantity !== parsed.value) {
      draft.value = changeQuotationLineQuantity(draft.value, lineId, parsed.value)
      markDirty()
    }
    return succeeded()
  }

  function removeLine(lineId: string): OperationSnapshot<void> {
    if (!draft.value || !['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(localState.value)) {
      return failed('unsupported_capability', '报价草稿当前不可编辑')
    }
    const next = removeQuotationLine(draft.value, lineId)
    if (next === draft.value) return failed('validation', '报价明细已不存在')
    draft.value = next
    const nextTexts = { ...quantityTextByLine.value }
    const nextErrors = { ...quantityErrorByLine.value }
    delete nextTexts[lineId]
    delete nextErrors[lineId]
    quantityTextByLine.value = nextTexts
    quantityErrorByLine.value = nextErrors
    markDirty()
    return succeeded()
  }

  function openCatalog(kind = selectedCatalogKind.value): void {
    selectedCatalogKind.value = kind
    catalogOpen.value = true
  }

  function closeCatalog(): void {
    catalogOpen.value = false
  }

  function selectCatalogKind(kind: QuotationLineKind): void {
    selectedCatalogKind.value = kind
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
    if (localState.value === 'invalid' || localState.value === 'unavailable') {
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
          localStateMessage.value = '报价草稿已保存在本机。'
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

  async function discardInvalidDraft(): Promise<OperationSnapshot<void>> {
    if (!repository || !identity || localState.value !== 'invalid') {
      return failed('validation', '当前没有需要清理的无效报价草稿')
    }
    const removed = await repository.remove(identity)
    if (removed.state !== 'succeeded') return removed
    draft.value = createEmptyQuotationDraft(String(identity.workOrderId), String(identity.workflowNodeId))
    quantityTextByLine.value = {}
    quantityErrorByLine.value = {}
    localState.value = 'fresh'
    localStateMessage.value = ''
    return succeeded()
  }

  return {
    draft,
    lines,
    localState,
    localStateMessage,
    catalogOpen,
    selectedCatalogKind,
    catalogKindLabels,
    quantityTextByLine,
    quantityErrorByLine,
    initialize,
    clear,
    addCatalogItem,
    setQuantityText,
    removeLine,
    openCatalog,
    closeCatalog,
    selectCatalogKind,
    flushDraft,
    discardInvalidDraft,
  }
})
