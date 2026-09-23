import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  QuotationCatalogContext,
  QuotationCatalogItemRead,
  QuotationCatalogReadPort,
  QuotationPackageDetailRead,
  QuotationPackageMaterialRead,
  ReadPage,
} from '@shared/ports'
import type { OperationState } from '@shared/types'
import type { QuotationLineKind } from './model'
import { quotationPackageLayerKey } from './package-configuration'

export type QuotationCatalogBrowserState = Extract<OperationState, 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'> | 'blocked'

const quotationCatalogKinds: readonly QuotationLineKind[] = ['package', 'procedure', 'material', 'measure']

type CatalogItemsByKind = Record<QuotationLineKind, readonly QuotationCatalogItemRead[]>
type CatalogStatesByKind = Record<QuotationLineKind, QuotationCatalogBrowserState>
type ListRequestsByKind = Partial<Record<QuotationLineKind, Promise<void>>>

const emptyItems = (): CatalogItemsByKind => ({ package: [], procedure: [], material: [], measure: [] })
const idleStates = (): CatalogStatesByKind => ({ package: 'idle', procedure: 'idle', material: 'idle', measure: 'idle' })

export interface QuotationPackageMaterialLayerGroup {
  readonly key: string
  readonly label: string
  readonly materials: readonly QuotationPackageMaterialRead[]
}

function catalogListFor(
  port: QuotationCatalogReadPort,
  kind: QuotationLineKind,
  context: QuotationCatalogContext,
): Promise<import('@shared/types').OperationSnapshot<ReadPage<QuotationCatalogItemRead>>> {
  switch (kind) {
    case 'package': return port.listPackages(context)
    case 'procedure': return port.listProcedures(context)
    case 'material': return port.listMaterials(context)
    case 'measure': return port.listMeasures(context)
  }
}

export function quotationPackageMaterialLayersFor(
  materials: readonly QuotationPackageMaterialRead[],
): readonly QuotationPackageMaterialLayerGroup[] {
  const grouped = new Map<string, { label: string; materials: QuotationPackageMaterialRead[] }>()
  for (const material of materials) {
    const key = quotationPackageLayerKey(material.layer)
    const label = material.layer === undefined ? '层级未提供' : `层级：${String(material.layer)}`
    const existing = grouped.get(key)
    if (existing) existing.materials.push(material)
    else grouped.set(key, { label, materials: [material] })
  }
  return [...grouped].map(([key, group]) => ({ key, label: group.label, materials: group.materials }))
}

export const useQuotationCatalogBrowserStore = defineStore('quotationCatalogBrowser', () => {
  const catalogItemsByKind = ref<CatalogItemsByKind>(emptyItems())
  const catalogStatesByKind = ref<CatalogStatesByKind>(idleStates())
  const selectedKind = ref<QuotationLineKind>('package')
  const isOpen = ref(false)
  const listErrorCopyByKind = ref<Partial<Record<QuotationLineKind, string>>>({})
  const selectedPackageId = ref<string | null>(null)
  const packageDetail = ref<QuotationPackageDetailRead | null>(null)
  const packageDetailState = ref<QuotationCatalogBrowserState>('idle')
  const packageDetailErrorCopy = ref('')

  const visibleCatalogItems = computed(() => catalogItemsByKind.value[selectedKind.value])
  const packageMaterialLayers = computed(() => quotationPackageMaterialLayersFor(packageDetail.value?.materials ?? []))

  let port: QuotationCatalogReadPort | null = null
  let context: QuotationCatalogContext | null = null
  let generation = 0
  let packageRequestGeneration = 0
  const listRequests: ListRequestsByKind = {}

  function clear(): void {
    generation += 1
    packageRequestGeneration += 1
    port = null
    context = null
    for (const kind of quotationCatalogKinds) delete listRequests[kind]
    catalogItemsByKind.value = emptyItems()
    catalogStatesByKind.value = idleStates()
    selectedKind.value = 'package'
    isOpen.value = false
    listErrorCopyByKind.value = {}
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
  }

  function configure(input: {
    readonly readPort: QuotationCatalogReadPort | null
    readonly catalogContext: QuotationCatalogContext | null | undefined
  }): void {
    clear()
    port = input.readPort
    context = input.catalogContext ?? null
  }

  function open(kind: QuotationLineKind): void {
    isOpen.value = true
    selectedKind.value = kind
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
    void loadList(kind)
  }

  function close(): void {
    isOpen.value = false
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
  }

  function selectKind(kind: QuotationLineKind): void {
    selectedKind.value = kind
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
    void loadList(kind)
  }

  /** Returns only an item from the currently open, successfully-read category. */
  function selectedCatalogItemFor(kind: QuotationLineKind, catalogId: string): QuotationCatalogItemRead | null {
    if (
      !isOpen.value
      || selectedKind.value !== kind
      || catalogStatesByKind.value[kind] !== 'succeeded'
      || !catalogId.trim()
    ) return null
    return catalogItemsByKind.value[kind].find((item) => item.kind === kind && item.id === catalogId) ?? null
  }

  /** Current successfully-read Package candidate; never accepts caller-owned provider objects. */
  function packageCandidateFor(packageId: string): Extract<QuotationCatalogItemRead, { kind: 'package' }> | null {
    if (!packageId.trim() || catalogStatesByKind.value.package !== 'succeeded') return null
    const item = catalogItemsByKind.value.package.find((candidate) => candidate.kind === 'package' && candidate.id === packageId)
    return item?.kind === 'package' ? item : null
  }

  /** Detail is usable only while it is the successful detail for this current list candidate. */
  function successfulPackageDetailFor(packageId: string): QuotationPackageDetailRead | null {
    const candidate = packageCandidateFor(packageId)
    if (
      !candidate
      || packageDetailState.value !== 'succeeded'
      || selectedPackageId.value !== packageId
      || packageDetail.value?.package.id !== candidate.id
      || packageDetail.value.package.kind !== 'package'
    ) return null
    return packageDetail.value
  }

  async function loadList(kind: QuotationLineKind, force = false): Promise<void> {
    if (listRequests[kind]) return listRequests[kind]
    if (!force && catalogStatesByKind.value[kind] === 'succeeded') return
    if (!port || !context || !context.serviceType.trim()) {
      catalogStatesByKind.value = { ...catalogStatesByKind.value, [kind]: 'blocked' }
      listErrorCopyByKind.value = {
        ...listErrorCopyByKind.value,
        [kind]: !port
          ? '目录只读服务暂不可用，未发送请求。'
          : '缺少当前工单的目录适用范围，未请求目录服务。',
      }
      return
    }

    const requestGeneration = generation
    catalogStatesByKind.value = { ...catalogStatesByKind.value, [kind]: 'loading' }
    listErrorCopyByKind.value = { ...listErrorCopyByKind.value, [kind]: '' }
    const request = catalogListFor(port, kind, context).then((result) => {
      if (requestGeneration !== generation) return
      if (result.state === 'succeeded' && result.data) {
        catalogItemsByKind.value = { ...catalogItemsByKind.value, [kind]: result.data.items }
        catalogStatesByKind.value = { ...catalogStatesByKind.value, [kind]: 'succeeded' }
        return
      }
      catalogStatesByKind.value = {
        ...catalogStatesByKind.value,
        [kind]: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal',
      }
      listErrorCopyByKind.value = {
        ...listErrorCopyByKind.value,
        [kind]: result.state === 'failed_retryable'
          ? '暂时无法读取目录，请检查网络后重试。'
          : '当前目录暂不可用，请稍后重试或返回工单。',
      }
    }).catch(() => {
      if (requestGeneration !== generation) return
      catalogStatesByKind.value = { ...catalogStatesByKind.value, [kind]: 'failed_retryable' }
      listErrorCopyByKind.value = { ...listErrorCopyByKind.value, [kind]: '暂时无法读取目录，请检查网络后重试。' }
    }).finally(() => {
      if (listRequests[kind] === request) delete listRequests[kind]
    })
    listRequests[kind] = request
    return request
  }

  async function openPackageDetail(packageId: string): Promise<void> {
    if (!port || !context || !context.serviceType.trim() || !packageId.trim()) {
      packageDetailState.value = 'blocked'
      packageDetailErrorCopy.value = !port
        ? '目录只读服务暂不可用。'
        : '当前工单目录适用范围或套餐身份不可用。'
      return
    }
    if (
      catalogStatesByKind.value.package !== 'succeeded'
      || !catalogItemsByKind.value.package.some((item) => item.id === packageId && item.kind === 'package')
    ) {
      packageDetailState.value = 'blocked'
      packageDetailErrorCopy.value = '套餐不属于当前已读取的目录结果，未请求详情。'
      return
    }
    const requestId = ++packageRequestGeneration
    const requestGeneration = generation
    selectedPackageId.value = packageId
    packageDetail.value = null
    packageDetailState.value = 'loading'
    packageDetailErrorCopy.value = ''
    try {
      const result = await port.getPackageDetail(packageId)
      if (requestGeneration !== generation || requestId !== packageRequestGeneration) return
      if (result.state === 'succeeded' && result.data) {
        packageDetail.value = result.data
        packageDetailState.value = 'succeeded'
        return
      }
      packageDetailState.value = result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
      packageDetailErrorCopy.value = result.state === 'failed_retryable'
        ? '暂时无法读取套餐详情，请检查网络后重试。'
        : '套餐详情暂不可用，请稍后重试或返回目录。'
    } catch {
      if (requestGeneration !== generation || requestId !== packageRequestGeneration) return
      packageDetailState.value = 'failed_retryable'
      packageDetailErrorCopy.value = '暂时无法读取套餐详情，请检查网络后重试。'
    }
  }

  function retryList(): Promise<void> {
    return loadList(selectedKind.value, true)
  }

  function retryPackageDetail(): Promise<void> {
    return selectedPackageId.value ? openPackageDetail(selectedPackageId.value) : Promise.resolve()
  }

  function backToList(): void {
    packageRequestGeneration += 1
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
  }

  return {
    catalogItemsByKind,
    catalogStatesByKind,
    selectedKind,
    isOpen,
    listErrorCopyByKind,
    selectedPackageId,
    packageDetail,
    packageDetailState,
    packageDetailErrorCopy,
    visibleCatalogItems,
    packageMaterialLayers,
    configure,
    clear,
    open,
    close,
    selectKind,
    selectedCatalogItemFor,
    packageCandidateFor,
    successfulPackageDetailFor,
    loadList,
    retryList,
    openPackageDetail,
    retryPackageDetail,
    backToList,
  }
})
