import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type {
  QuotationCatalogContext,
  QuotationCatalogReadPort,
  QuotationPackageDetailRead,
  QuotationPackageRead,
  QuotationProcedureRead,
  QuotationMaterialRead,
  QuotationMaterialSkuVariantRead,
  QuotationMeasureRead,
  ReadPage,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { useQuotationCatalogBrowserStore, quotationPackageMaterialLayersFor } from '@features/work-orders/quotation/catalog-browser-store'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

const context: QuotationCatalogContext = { serviceType: 'verified-service-type', sourceType: 'verified-source-type' }
const packageRow: QuotationPackageRead = { kind: 'package', id: 'package-1', name: '方案一', unit: '套' }

function emptyPage<T>(): ReadPage<T> {
  return { items: [], page: 1, pageSize: 20, totalCount: 0 }
}

function catalogPort(overrides: Partial<QuotationCatalogReadPort> = {}): QuotationCatalogReadPort {
  return {
    listPackages: vi.fn(async () => succeeded({ ...emptyPage(), items: [packageRow] })),
    getPackageDetail: vi.fn(async () => succeeded<QuotationPackageDetailRead>({
      package: packageRow,
      procedures: [],
      materials: [],
      measures: [],
    })),
    listProcedures: vi.fn(async () => succeeded(emptyPage<QuotationProcedureRead>())),
    listMaterials: vi.fn(async () => succeeded(emptyPage<QuotationMaterialRead>())),
    listMeasures: vi.fn(async () => succeeded(emptyPage<QuotationMeasureRead>())),
    ...overrides,
  }
}

describe('G4-F Phase 1E quotation catalog browser', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('dispatches each category through the read-only port with Work Order catalog context', async () => {
    const port = catalogPort()
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })

    for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
      await store.loadList(kind)
      expect(store.catalogStatesByKind[kind]).toBe('succeeded')
    }
    expect(port.listPackages).toHaveBeenCalledWith(context)
    expect(port.listProcedures).toHaveBeenCalledWith(context)
    expect(port.listMaterials).toHaveBeenCalledWith(context)
    expect(port.listMeasures).toHaveBeenCalledWith(context)
  })

  it('shows loading, empty, retryable failure, and retry success as distinct read states', async () => {
    let resolveList: ((result: OperationSnapshot<ReadPage<QuotationPackageRead>>) => void) | undefined
    const pending = new Promise<OperationSnapshot<ReadPage<QuotationPackageRead>>>((resolve) => { resolveList = resolve })
    const port = catalogPort({
      listPackages: vi.fn()
        .mockResolvedValueOnce({ state: 'failed_retryable', error: { category: 'network_retryable', retryable: true, message: 'private transport detail' } })
        .mockResolvedValueOnce(succeeded(emptyPage<QuotationPackageRead>()))
        .mockImplementationOnce(() => pending),
    })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })

    const firstOpen = store.loadList('package')
    expect(store.catalogStatesByKind.package).toBe('loading')
    await firstOpen
    expect(store.catalogStatesByKind.package).toBe('failed_retryable')
    expect(store.listErrorCopyByKind.package).not.toContain('private transport detail')

    await store.retryList()
    expect(store.catalogStatesByKind.package).toBe('succeeded')
    expect(store.visibleCatalogItems).toEqual([])

    const refresh = store.loadList('package', true)
    expect(store.catalogStatesByKind.package).toBe('loading')
    resolveList?.(succeeded({ ...emptyPage(), items: [packageRow] }))
    await refresh
    expect(store.catalogStatesByKind.package).toBe('succeeded')
    expect(store.visibleCatalogItems).toEqual([packageRow])
  })

  it('fails closed without service-type context and makes no catalog request', async () => {
    const port = catalogPort()
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: undefined })
    await store.loadList('material')
    expect(store.catalogStatesByKind.material).toBe('blocked')
    expect(port.listMaterials).not.toHaveBeenCalled()
  })

  it('loads package details by selected identity and keeps raw material layers without inferred order', async () => {
    const detail: QuotationPackageDetailRead = {
      package: packageRow,
      procedures: [],
      materials: [
        { kind: 'material', referenceId: 'mat-a', item: null, layer: 'B' },
        { kind: 'material', referenceId: 'mat-b', item: null, layer: 2 },
        { kind: 'material', referenceId: 'mat-c', item: null, layer: 'B' },
        { kind: 'material', referenceId: 'mat-d', item: null },
      ],
      measures: [],
    }
    const port = catalogPort({ getPackageDetail: vi.fn(async () => succeeded(detail)) })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })

    await store.loadList('package')
    await store.openPackageDetail('package-1')
    expect(port.getPackageDetail).toHaveBeenCalledWith('package-1')
    expect(store.packageDetailState).toBe('succeeded')
    expect(store.packageMaterialLayers.map((group) => [group.key, group.label, group.materials.length])).toEqual([
      ['string:B', '材料层级 1', 2],
      ['number:2', '材料层级 2', 1],
      ['missing-layer', '材料层级信息缺失', 1],
    ])
  })

  it('does not request a blank package identity', async () => {
    const port = catalogPort()
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    await store.openPackageDetail('  ')
    expect(store.packageDetailState).toBe('blocked')
    expect(port.getPackageDetail).not.toHaveBeenCalled()
  })

  it('exposes selection candidates only from the open successful category and exact read identity', async () => {
    const procedure: QuotationProcedureRead = { kind: 'procedure', id: 'procedure-1', name: '工序一' }
    const port = catalogPort({ listProcedures: vi.fn(async () => succeeded({ ...emptyPage(), items: [procedure] })) })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })

    expect(store.selectedCatalogItemFor('procedure', 'procedure-1')).toBeNull()
    store.open('procedure')
    await store.loadList('procedure')
    expect(store.selectedCatalogItemFor('procedure', 'procedure-1')).toEqual(procedure)
    expect(store.selectedCatalogItemFor('material', 'procedure-1')).toBeNull()
    expect(store.selectedCatalogItemFor('procedure', 'unlisted-procedure')).toBeNull()
    store.close()
    expect(store.selectedCatalogItemFor('procedure', 'procedure-1')).toBeNull()
  })

  it('does not request a package that is not in the current successful package list', async () => {
    const port = catalogPort()
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    await store.openPackageDetail('unlisted-package')
    expect(store.packageDetailState).toBe('blocked')
    expect(port.getPackageDetail).not.toHaveBeenCalled()
  })

  it('does not expose a successful-looking detail whose Package identity mismatches the current candidate', async () => {
    const port = catalogPort({
      getPackageDetail: vi.fn(async () => succeeded<QuotationPackageDetailRead>({
        package: { ...packageRow, id: 'different-package' },
        procedures: [],
        materials: [],
        measures: [],
      })),
    })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    await store.loadList('package')
    await store.openPackageDetail(packageRow.id)
    expect(store.packageCandidateFor(packageRow.id)).toEqual(packageRow)
    expect(store.packageDetailState).toBe('succeeded')
    expect(store.successfulPackageDetailFor(packageRow.id)).toBeNull()
  })

  it('keeps package-detail retryable errors separate and hides raw transport copy', async () => {
    const port = catalogPort({
      getPackageDetail: vi.fn()
        .mockResolvedValueOnce({ state: 'failed_retryable', error: { category: 'network_retryable', retryable: true, message: 'private detail response' } })
        .mockResolvedValueOnce(succeeded<QuotationPackageDetailRead>({
          package: packageRow,
          procedures: [],
          materials: [],
          measures: [],
        })),
    })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    await store.loadList('package')
    await store.openPackageDetail('package-1')
    expect(store.packageDetailState).toBe('failed_retryable')
    expect(store.packageDetailErrorCopy).not.toContain('private detail response')
    await store.retryPackageDetail()
    expect(store.packageDetailState).toBe('succeeded')
  })

  it('ignores a late list response after the browser is cleared for a different action', async () => {
    let resolveList: ((result: OperationSnapshot<ReadPage<QuotationPackageRead>>) => void) | undefined
    const pending = new Promise<OperationSnapshot<ReadPage<QuotationPackageRead>>>((resolve) => { resolveList = resolve })
    const port = catalogPort({ listPackages: vi.fn(() => pending) })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    const request = store.loadList('package')
    store.clear()
    resolveList?.(succeeded({ ...emptyPage(), items: [packageRow] }))
    await request
    expect(store.catalogStatesByKind.package).toBe('idle')
    expect(store.catalogItemsByKind.package).toEqual([])
  })

  it('follows R1 Number(layer) grouping and ascending layer order for package alternatives', () => {
    const groups = quotationPackageMaterialLayersFor([
      { kind: 'material', item: null, layer: 1 },
      { kind: 'material', item: null, layer: '01' },
      { kind: 'material', item: null, layer: '0' },
      { kind: 'material', item: null, layer: 0 },
      { kind: 'material', item: null, layer: '2' },
    ])
    expect(groups.map((group) => group.key)).toEqual(['number:0', 'number:1', 'number:2'])
    expect(groups.map((group) => group.materials.length)).toEqual([2, 2, 1])
    expect(groups.map((group) => group.label)).toEqual(['材料层级 1', '材料层级 2', '材料层级 3'])
    expect(groups.map((group) => group.label).join(' ')).not.toContain('number:')
  })

  it('S1 Q01: source-matched ordinary Material remains selectable without any active SKU', async () => {
    // Entirely synthetic row SHAPE, informed by #120 Production DB structure;
    // neither the row identity nor its values are copied from Production.
    const ordinary: QuotationMaterialRead = {
      kind: 'material', id: 'synthetic-active-ordinary', name: '普通材料（结构示例）',
      serviceTypes: ['11'], sourceTypeList: ['1', '5'],
    }
    const port = catalogPort({
      listMaterials: vi.fn(async () => succeeded({ ...emptyPage(), items: [ordinary] })),
      listMaterialSalesFields: vi.fn(async () => succeeded({ items: [
        { name: 'color', label: '颜色', options: [{ value: 'black', label: '黑色' }] },
      ] })),
      listMaterialSkuVariants: vi.fn(async () => succeeded(emptyPage<QuotationMaterialSkuVariantRead>())),
    })
    const store = useQuotationCatalogBrowserStore()
    const r1Context: QuotationCatalogContext = {
      workOrderId: 'synthetic-service-appointment', serviceType: '11', sourceType: '1',
    }
    store.configure({ readPort: port, catalogContext: r1Context })
    store.open('material')
    await store.loadList('material')
    expect(port.listMaterials).toHaveBeenCalledWith(r1Context)
    expect(store.catalogStatesByKind.material).toBe('succeeded')
    expect(store.selectedCatalogItemFor('material', ordinary.id)).toEqual(ordinary)
    expect(port.listMaterialSkuVariants).not.toHaveBeenCalled()

    // An optional attempt to view specifications must not retroactively
    // erase or block the already returned ordinary product catalog.
    await store.openMaterialSkuPreview(ordinary.id)
    expect(store.materialSkuPreview?.state).toBe('not_configured')
    expect(port.listMaterialSkuVariants).not.toHaveBeenCalled()
    expect(store.catalogStatesByKind.material).toBe('succeeded')
    expect(store.selectedCatalogItemFor('material', ordinary.id)).toEqual(ordinary)
  })

  it('S1 Q02: unavailable active variants block only SKU preview, never ordinary catalog', async () => {
    const withOptions: QuotationMaterialRead = {
      kind: 'material', id: 'synthetic-spu-with-options', name: '规格链独立结构示例',
      serviceTypes: ['11'], sourceTypeList: ['1'],
      saleOptionCandidates: { color: ['black'] },
    }
    const port = catalogPort({
      listMaterials: vi.fn(async () => succeeded({ ...emptyPage(), items: [withOptions] })),
      listMaterialSalesFields: vi.fn(async () => succeeded({ items: [
        { name: 'color', label: '颜色', options: [{ value: 'black', label: '黑色' }] },
      ] })),
      listMaterialSkuVariants: vi.fn(async () => succeeded(emptyPage<QuotationMaterialSkuVariantRead>())),
    })
    const store = useQuotationCatalogBrowserStore()
    store.configure({
      readPort: port,
      catalogContext: { workOrderId: 'synthetic-service-appointment', serviceType: '11', sourceType: '1' },
    })
    store.open('material')
    await store.loadList('material')
    await store.openMaterialSkuPreview(withOptions.id)
    expect(port.listMaterialSkuVariants).toHaveBeenCalledTimes(1)
    expect(store.materialSkuPreview?.state).toBe('blocked')
    expect(store.materialSkuMatch?.state).toBe('blocked')
    expect(store.catalogStatesByKind.material).toBe('succeeded')
    expect(store.selectedCatalogItemFor('material', withOptions.id)).toEqual(withOptions)
  })
})
