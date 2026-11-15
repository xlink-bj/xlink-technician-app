import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { asOpaqueId } from '@shared/types'
import type { QuotationCatalogReadPort, QuotationMaterialSaleFieldRead } from '@shared/ports'
import { materialSkuSummary } from '@features/work-orders/quotation/material-sku-selection-preview'
import { useQuotationCatalogBrowserStore } from '@features/work-orders/quotation/catalog-browser-store'

const fields: readonly QuotationMaterialSaleFieldRead[] = [
  { name: 'thickness', label: '厚度', valueOption: 'thickness', options: [{ value: '2', label: '2毫米' }] },
  { name: 'color', label: '颜色', valueOption: 'color', options: [{ value: 'black', label: '黑色' }] },
]
describe('quotation material summary labels', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('uses only exact schema labels without modifying raw draft attributes', () => {
    const raw = { thickness: '2', color: 'black' }
    expect(materialSkuSummary(raw, fields)).toBe('厚度：2毫米 / 颜色：黑色')
    expect(raw).toEqual({ thickness: '2', color: 'black' })
  })
  it('preserves unknown, unavailable and ambiguous values explicitly', () => {
    expect(materialSkuSummary({ color: 'violet', other: 'abc' }, fields)).toBe('color：violet（未识别） / other：abc（未识别）')
    expect(materialSkuSummary({ color: 'black' }, null)).toBe('color：black（标签暂不可用）')
    expect(materialSkuSummary({ color: 'black' }, [...fields, fields[1]!])).toBe('color：black（未识别）')
    expect(materialSkuSummary({ color: 'black' }, [{ ...fields[1]!, options: [{ value: 'black', label: '黑色' }, { value: 'black', label: '另一标签' }] }])).toBe('color：black（未识别）')
  })
  it('deduplicates reads and discards late metadata after context changes', async () => {
    let resolve!: (value: { state: 'succeeded'; data: { items: readonly QuotationMaterialSaleFieldRead[] } }) => void
    const read = vi.fn(() => new Promise<{ state: 'succeeded'; data: { items: readonly QuotationMaterialSaleFieldRead[] } }>(r => { resolve = r }))
    const store = useQuotationCatalogBrowserStore()
    const context = { workOrderId: asOpaqueId<'WorkOrderId'>('mock-old'), serviceType: 'mock-service', sourceType: 'mock-source' }
    store.configure({ readPort: { listMaterialSalesFields: read } as unknown as QuotationCatalogReadPort, catalogContext: context })
    const pending = store.loadMaterialSummaryFields()
    const duplicate = store.loadMaterialSummaryFields()
    expect(read).toHaveBeenCalledTimes(1)
    store.configure({ readPort: null, catalogContext: { ...context, workOrderId: asOpaqueId<'WorkOrderId'>('mock-new') } })
    resolve({ state: 'succeeded', data: { items: fields } })
    await Promise.all([pending, duplicate])
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(context)
    expect(store.materialSummaryFields).toBeNull()
  })
  it('keeps unavailable labels honest and allows a later read to recover', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ state: 'succeeded', data: { items: fields } })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: { listMaterialSalesFields: read } as unknown as QuotationCatalogReadPort, catalogContext: { serviceType: 'mock-service', sourceType: 'mock-source' } })
    await store.loadMaterialSummaryFields()
    expect(store.materialSummaryFields).toBeNull()
    await store.loadMaterialSummaryFields()
    expect(materialSkuSummary({ color: 'black' }, store.materialSummaryFields)).toBe('颜色：黑色')
  })
})
