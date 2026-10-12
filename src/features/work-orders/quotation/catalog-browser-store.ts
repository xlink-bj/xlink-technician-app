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
import { compareQuotationPackageLayerKeys, quotationPackageLayerKey } from './package-configuration'
import { matchMaterialSkuSelectionPreview, projectMaterialSkuSelectionPreview, type MaterialSkuSelectionPreview } from './material-sku-selection-preview'

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
  const grouped = new Map<string, QuotationPackageMaterialRead[]>()
  for (const material of materials) {
    const key = quotationPackageLayerKey(material.layer)
    const existing = grouped.get(key)
    if (existing) existing.push(material)
    else grouped.set(key, [material])
  }
  // R1 placeOrders.vue:6412,6524-6536 sorts numeric layers before showing
  // their material alternatives. Non-numeric legacy DEV fixture groups keep
  // their original relative order; no source layer or material ID is rewritten.
  return [...grouped]
    .sort(([a], [b]) => compareQuotationPackageLayerKeys(a, b))
    .map(([key, group], index) => ({
      key,
      label: key === 'missing-layer' ? '材料层级信息缺失' : `材料层级 ${index + 1}`,
      materials: group,
    }))
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
  const selectedMaterialId = ref<string | null>(null)
  const materialSkuState = ref<QuotationCatalogBrowserState>('idle')
  const materialSkuPreview = ref<MaterialSkuSelectionPreview | null>(null)
  const materialSkuErrorCopy = ref('')
  const materialSkuSelections = ref<Readonly<Record<string, string>>>({})
  const materialSkuMatch = computed(() => materialSkuPreview.value
    ? matchMaterialSkuSelectionPreview(materialSkuPreview.value, materialSkuSelections.value)
    : { state: 'incomplete' as const })

  const visibleCatalogItems = computed(() => catalogItemsByKind.value[selectedKind.value])
  const packageMaterialLayers = computed(() => quotationPackageMaterialLayersFor(packageDetail.value?.materials ?? []))

  let port: QuotationCatalogReadPort | null = null
  let context: QuotationCatalogContext | null = null
  let generation = 0
  let packageRequestGeneration = 0
  let materialRequestGeneration = 0
  const listRequests: ListRequestsByKind = {}

  function clear(): void {
    generation += 1
    packageRequestGeneration += 1
    materialRequestGeneration += 1
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
    resetMaterialPreview()
  }

  function resetMaterialPreview(): void {
    materialRequestGeneration += 1
    selectedMaterialId.value = null
    materialSkuState.value = 'idle'
    materialSkuPreview.value = null
    materialSkuErrorCopy.value = ''
    materialSkuSelections.value = {}
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
    resetMaterialPreview()
    isOpen.value = true
    selectedKind.value = kind
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
    void loadList(kind)
  }

  function close(): void {
    resetMaterialPreview()
    isOpen.value = false
    selectedPackageId.value = null
    packageDetail.value = null
    packageDetailState.value = 'idle'
    packageDetailErrorCopy.value = ''
  }

  function selectKind(kind: QuotationLineKind): void {
    resetMaterialPreview()
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

  /** Read-only preview on the REAL material catalog surface; it does not
   * add a SKU or mutate the local quotation draft. R1 backend APIs only.
   */
  async function openMaterialSkuPreview(materialId: string): Promise<void> {
    resetMaterialPreview()
    const candidate = catalogItemsByKind.value.material.find(row => row.kind === 'material' && row.id === materialId)
    const item = candidate?.kind === 'material' ? candidate : null
    if (!port?.listMaterialSalesFields || !port.listMaterialSkuVariants
      || !context || !context.workOrderId || !context.serviceType.trim()
      || !isOpen.value || selectedKind.value !== 'material'
      || catalogStatesByKind.value.material !== 'succeeded' || !item) {
      materialSkuState.value = 'blocked'
      materialSkuErrorCopy.value = '当前材料或销售规格只读来源不完整。'
      return
    }
    const requestGeneration = generation
    const requestId = ++materialRequestGeneration
    selectedMaterialId.value = materialId
    materialSkuState.value = 'loading'
    const current = (): boolean => requestGeneration === generation
      && requestId === materialRequestGeneration
      && isOpen.value && selectedMaterialId.value === materialId
      && selectedKind.value === 'material'
    try {
      const fields = await port.listMaterialSalesFields(context)
      if (!current()) return
      if (fields.state !== 'succeeded' || !fields.data) {
        materialSkuState.value = fields.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
        materialSkuErrorCopy.value = '销售属性来源暂不可用，未请求 SKU。'
        return
      }
      const selectedFieldNames = fields.data.items
        .filter(field => item.saleOptionCandidates?.[field.name]?.length)
        .map(field => field.name)
      if (!selectedFieldNames.length) {
        materialSkuPreview.value = { state: 'not_configured', message: '当前材料没有可选择的销售规格。' }
        materialSkuState.value = 'succeeded'
        return
      }
      const skus = await port.listMaterialSkuVariants(context, 'direct_material', [materialId], selectedFieldNames)
      if (!current()) return
      if (skus.state !== 'succeeded' || !skus.data) {
        materialSkuState.value = skus.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
        materialSkuErrorCopy.value = 'SKU 身份或属性读取失败，未执行任何报价操作。'
        return
      }
      materialSkuPreview.value = projectMaterialSkuSelectionPreview(item, fields.data.items, skus.data.items)
      materialSkuState.value = 'succeeded'
    } catch {
      if (!current()) return
      materialSkuState.value = 'failed_retryable'
      materialSkuErrorCopy.value = '规格读取失败，请返回目录重试。'
    }
  }

  function chooseMaterialSkuOption(name: string, value: string): void {
    if (materialSkuState.value !== 'succeeded' || materialSkuPreview.value?.state !== 'ready') return
    const field = materialSkuPreview.value.fields.find(row => row.name === name)
    if (!field?.options.some(row => row.value === value)) return
    materialSkuSelections.value = { ...materialSkuSelections.value, [name]: value }
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
    resetMaterialPreview()
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
    selectedMaterialId,
    materialSkuState,
    materialSkuPreview,
    materialSkuErrorCopy,
    materialSkuSelections,
    materialSkuMatch,
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
    openMaterialSkuPreview,
    chooseMaterialSkuOption,
    backToList,
  }
})
