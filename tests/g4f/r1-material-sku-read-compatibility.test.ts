import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'

const context = {
  workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-current-service-appointment'),
  serviceType: 'r1-service-type',
  sourceType: 'r1-source-type',
}

const sku = (id: string, spuId = 'spu-a') => ({
  _id: id, name: '规格材料（仅身份测试）', spuid: spuId,
  state: 1, spec: '规格 2', unit: '桶',
  price: 9987, storeCostPrice: 4099, inventory: 999,
  exts: { color: 'red', privateText: 'never cross this read boundary' },
})

describe('M1 I2 R1 material SKU single/batch read compatibility', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requests a single SPU on R1 basic/material/query using spuid, never sourceType or serviceType', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [sku('sku-a')], page: 1, rows: 20, total: 1 }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const result = await catalog.listMaterialSkuVariants!(context, 'direct_material', ['spu-a'])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({
      method: 'POST', path: 'basic/material/query',
      body: { _all: '1', 'is:state|integer#and': 1, spuid: 'spu-a' },
    })
    expect(result).toMatchObject({ state: 'succeeded', data: {
      items: [{ id: 'sku-a', spuId: 'spu-a', name: '规格材料（仅身份测试）', specification: '规格 2', unit: '桶' }],
    } })
    const line = result.data!.items[0]!
    expect(line).not.toHaveProperty('price')
    expect(line).not.toHaveProperty('inventory')
    expect(line).not.toHaveProperty('exts')
    expect(line).not.toHaveProperty('attributes')
  })

  it('requests a package batch exactly as R1 in:spuid|array#and comma-separated IDs', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [sku('sku-a', 'spu-a'), sku('sku-b', 'spu-b')] }))
    const result = await createQuotationCatalogReadAdapter({ execute })
      .listMaterialSkuVariants!(context, 'package_materials', ['spu-a', 'spu-b'])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({
      method: 'POST', path: 'basic/material/query',
      body: { _all: '1', 'is:state|integer#and': 1, 'in:spuid|array#and': 'spu-a,spu-b' },
    })
    expect(result.data?.items.map(x => [x.id, x.spuId])).toEqual([
      ['sku-a', 'spu-a'], ['sku-b', 'spu-b'],
    ])
  })

  it('keeps a ONE-SPU Package on the R1 batch query route, not the direct Material route', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [sku('sku-a')] }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const result = await catalog.listMaterialSkuVariants!(context, 'package_materials', ['spu-a'])
    expect(result.state).toBe('succeeded')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({
      method: 'POST', path: 'basic/material/query',
      body: { _all: '1', 'is:state|integer#and': 1, 'in:spuid|array#and': 'spu-a' },
    })
    expect(execute.mock.calls[0]?.[0].body).not.toHaveProperty('spuid')
  })

  it('rejects multiple SPUs passed through direct-material route before any network call', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [] }))
    const result = await createQuotationCatalogReadAdapter({ execute })
      .listMaterialSkuVariants!(context, 'direct_material', ['spu-a', 'spu-b'])
    expect(result.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('treats a verified empty SKU list as empty rather than auto-selecting or inventing variants', async () => {
    const result = await createQuotationCatalogReadAdapter({ execute: async () => ({ data: [] }) })
      .listMaterialSkuVariants!(context, 'direct_material', ['spu-a'])
    expect(result).toMatchObject({ state: 'succeeded', data: { items: [] } })
  })

  it('rejects missing WorkOrder identity, invalid IDs, duplicates and unbounded batch before dispatch', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [] }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const cases = [
      [{ ...context, workOrderId: undefined }, ['spu-a']],
      [context, []],
      [context, ['spu-a', 'spu-a']],
      [context, ['spu-a,spu-b']],
      [context, ['  spu-a']],
      [context, Array.from({ length: 31 }, (_, i) => 'spu-' + i)],
    ] as const
    for (const [scope, ids] of cases) {
      const result = await catalog.listMaterialSkuVariants!(scope, 'package_materials', ids)
      expect(result.state).toBe('failed_terminal')
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects foreign parent, inactive record, duplicated SKU IDs and malformed identity', async () => {
    for (const rows of [
      [sku('foreign', 'spu-other')],
      [{ ...sku('inactive'), state: 0 }],
      [sku('same'), sku('same')],
      [{ ...sku('invalid'), _id: '' }],
    ]) {
      const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: rows }))
      const result = await createQuotationCatalogReadAdapter({ execute })
        .listMaterialSkuVariants!(context, 'direct_material', ['spu-a'])
      expect(result.state).toBe('failed_terminal')
      expect(execute).toHaveBeenCalledTimes(1)
    }
  })

  it('blocks even a syntactically valid material SKU read in Production before HTTP', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_API_BASE_URL', 'https://production.invalid')
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [sku('sku-a')] }))
    const result = await createQuotationCatalogReadAdapter({ execute })
      .listMaterialSkuVariants!(context, 'direct_material', ['spu-a'])
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('authorization_denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it('retains a ServiceAppointment explicitly-present empty sourceType in nonproduction ranked catalog reads', async () => {
    const technician = createTechnicianApiReadAdapter({
      execute: vi.fn(async (request: ApiReadRequest) => request.path === 'biz/action/query.do'
        ? { status: 1, data: [] }
        : { data: {
          serviceAppointment: {
            _id: 'synthetic-current-service-appointment',
            serviceType: 'r1-service-type',
            exts: { sourceType: '' },
          },
        } }),
    })
    const detail = await technician.getWorkOrderDetail(context.workOrderId)
    expect(detail.state).toBe('succeeded')
    expect(detail.data?.quotationCatalogContext).toEqual({ ...context, sourceType: '' })

    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [] }))
    const results = await Promise.all([
      createQuotationCatalogReadAdapter({ execute }).listPackages(detail.data!.quotationCatalogContext!),
      createQuotationCatalogReadAdapter({ execute }).listMaterials(detail.data!.quotationCatalogContext!),
    ])
    expect(results.every(r => r.state === 'succeeded')).toBe(true)
    expect(execute.mock.calls.map(([request]) => request.body)).toEqual([
      expect.objectContaining({ sourceType: '' }),
      expect.objectContaining({ sourceType: '' }),
    ])
  })

  it('preserves missing sourceType as missing; rejects whitespace-only context instead of fabricating a filter', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [] }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const missing = await catalog.listMaterials({ ...context, sourceType: undefined })
    const malformed = await catalog.listMaterials({ ...context, sourceType: '  ' })
    expect(missing.state).toBe('succeeded')
    expect(malformed.state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[0].body).not.toHaveProperty('sourceType')
  })
})
