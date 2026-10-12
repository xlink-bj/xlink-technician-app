import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  QuotationCatalogReadPort, QuotationMaterialRead, QuotationMaterialSaleFieldRead,
  QuotationMaterialSkuVariantRead,
} from '@shared/ports'
import { useQuotationCatalogBrowserStore } from '@features/work-orders/quotation/catalog-browser-store'
import { matchMaterialSkuSelectionPreview, projectMaterialSkuSelectionPreview } from '@features/work-orders/quotation/material-sku-selection-preview'

const context = { workOrderId: 'synthetic-wo-current', serviceType: 'waterproof', sourceType: 'normal' }
const material: QuotationMaterialRead = {
  kind: 'material', id: 'spu-current', name: '当前材料',
  saleOptionCandidates: { thickness: ['2', '3'], color: ['black', 'grey'] },
}
const fields: readonly QuotationMaterialSaleFieldRead[] = [
  { name: 'thickness', label: '厚度', valueOption: 'thickness',
    options: [{ value: '2', label: '2毫米' }, { value: '3', label: '3毫米' }] },
  { name: 'color', label: '颜色', valueOption: 'color',
    options: [{ value: 'black', label: '黑色' }, { value: 'grey', label: '灰色' }] },
]
const variants: readonly QuotationMaterialSkuVariantRead[] = [
  { id: 'sku-b2', spuId: material.id, name: '黑色 2mm', saleAttributeValues: { thickness: '2', color: 'black' } },
  { id: 'sku-g3', spuId: material.id, name: '灰色 3mm', saleAttributeValues: { thickness: '3', color: 'grey' } },
]
const success = <T>(data: T) => ({ state: 'succeeded' as const, data })

function reader(overrides: Partial<QuotationCatalogReadPort> = {}): QuotationCatalogReadPort {
  const empty = async () => success({ items: [] })
  return {
    listPackages: empty, listProcedures: empty, listMeasures: empty,
    listMaterials: async () => success({ items: [material] }),
    getPackageDetail: async () => ({ state: 'failed_terminal' as const }),
    listMaterialSalesFields: async () => success({ items: [...fields] }),
    listMaterialSkuVariants: async () => success({ items: [...variants] }),
    ...overrides,
  } as QuotationCatalogReadPort
}

describe('M1 I2: three-way real material SPU + R1 Code + raw SKU preview', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('matches ONLY an exact complete combination; never resolves by SKU order or label', () => {
    const preview = projectMaterialSkuSelectionPreview(material, fields, variants)
    expect(preview.state).toBe('ready')
    expect(matchMaterialSkuSelectionPreview(preview, {})).toEqual({ state: 'incomplete' })
    expect(matchMaterialSkuSelectionPreview(preview, { thickness: '2', color: 'black' }))
      .toEqual({ state: 'matched', skuId: 'sku-b2' })
    expect(matchMaterialSkuSelectionPreview(preview, { thickness: '2', color: 'grey' }))
      .toEqual({ state: 'unavailable' })
    expect(matchMaterialSkuSelectionPreview(preview, { thickness: '2', color: '黑色' }))
      .toEqual({ state: 'blocked' })
    expect(matchMaterialSkuSelectionPreview(preview, { thickness: '2', color: 'black', foreign: 'x' }))
      .toEqual({ state: 'blocked' })
  })

  it('blocks incomplete Code dictionaries, missing SKU exts, foreign SKUs and ambiguous combinations', () => {
    expect(projectMaterialSkuSelectionPreview(material, [
      { ...fields[0]!, options: [{ value: '3', label: '3毫米' }] }, fields[1]!,
    ], variants).state).toBe('blocked')
    expect(projectMaterialSkuSelectionPreview(material, fields,
      [{ ...variants[0]!, saleAttributeValues: { thickness: '2' } }]).state).toBe('blocked')
    expect(projectMaterialSkuSelectionPreview(material, fields,
      [{ ...variants[0]!, spuId: 'foreign-spu' }]).state).toBe('blocked')
    const ambiguous = projectMaterialSkuSelectionPreview(material, fields,
      [variants[0]!, { ...variants[0]!, id: 'another-sku' }])
    expect(matchMaterialSkuSelectionPreview(ambiguous, { thickness: '2', color: 'black' }).state)
      .toBe('ambiguous')
  })

  it('preserves R1 per-SPU option whitelist and cannot treat a global Code dictionary as purchasable options', () => {
    const preview = projectMaterialSkuSelectionPreview({ ...material,
      saleOptionCandidates: { thickness: ['2'], color: ['black'] },
    }, fields, [variants[0]!])
    expect(preview.state).toBe('ready')
    if (preview.state !== 'ready') throw new Error('test fixture must be ready')
    expect(preview.fields.map(f => f.options.map(o => o.value))).toEqual([['2'], ['black']])
    expect(matchMaterialSkuSelectionPreview(preview, { thickness: '3', color: 'black' }).state).toBe('blocked')
  })

  it('uses actual catalog-selected SPU and only the R1 existing SKU endpoints; no draft mutation', async () => {
    const port = reader({
      listMaterialSalesFields: vi.fn(async () => success({ items: [...fields] })),
      listMaterialSkuVariants: vi.fn(async () => success({ items: [...variants] })),
    })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    store.open('material')
    await store.loadList('material')
    await store.openMaterialSkuPreview(material.id)
    expect(port.listMaterialSalesFields).toHaveBeenCalledWith(context)
    expect(port.listMaterialSkuVariants).toHaveBeenCalledWith(context, 'direct_material',
      ['spu-current'], ['thickness', 'color'])
    expect(store.materialSkuState).toBe('succeeded')
    expect(store.materialSkuPreview?.state).toBe('ready')
    store.chooseMaterialSkuOption('thickness', '2')
    store.chooseMaterialSkuOption('color', 'black')
    expect(store.materialSkuMatch).toEqual({ state: 'matched', skuId: 'sku-b2' })
    store.backToList()
    expect(store.selectedMaterialId).toBeNull()
    expect(store.materialSkuSelections).toEqual({})
    expect(store.materialSkuPreview).toBeNull()
  })

  it('discards a stale SKU response when returning from material preview', async () => {
    let resolveSku: ((v: ReturnType<typeof success<{ items: QuotationMaterialSkuVariantRead[] }>>) => void) | null = null
    const pending = new Promise<ReturnType<typeof success<{ items: QuotationMaterialSkuVariantRead[] }>>>(resolve => { resolveSku = resolve })
    const port = reader({ listMaterialSkuVariants: vi.fn(async () => pending) })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: port, catalogContext: context })
    store.open('material')
    await store.loadList('material')
    const opening = store.openMaterialSkuPreview(material.id)
    await Promise.resolve()
    store.backToList()
    if (!resolveSku) throw new Error('test did not reach SKU transport')
    resolveSku(success({ items: [...variants] }))
    await opening
    expect(store.selectedMaterialId).toBeNull()
    expect(store.materialSkuPreview).toBeNull()
    expect(store.materialSkuSelections).toEqual({})
  })

  it('refuses to request Code or SKU when selected ID did not originate in the current material listing', async () => {
    const p = reader({
      listMaterialSalesFields: vi.fn(async () => success({ items: [...fields] })),
      listMaterialSkuVariants: vi.fn(async () => success({ items: [...variants] })),
    })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: p, catalogContext: context })
    store.open('material')
    await store.loadList('material')
    await store.openMaterialSkuPreview('foreign-material')
    expect(store.materialSkuState).toBe('blocked')
    expect(p.listMaterialSalesFields).not.toHaveBeenCalled()
    expect(p.listMaterialSkuVariants).not.toHaveBeenCalled()
  })
})
