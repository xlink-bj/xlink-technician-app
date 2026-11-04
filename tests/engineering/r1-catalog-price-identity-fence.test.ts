import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import type { QuotationCatalogReadAuthorizationScope } from '@adapters/api/quotation-catalog-api'
import { asOpaqueId } from '@shared/types'

const ctx = {
  workOrderId: asOpaqueId<'WorkOrderId'>('own-listed-work-order'),
  serviceType: 'service-a',
  sourceType: 'source-a',
}
const current: QuotationCatalogReadAuthorizationScope = {
  sessionRef: 'synthetic-session',
  userId: 'synthetic-user',
  roleId: 'synthetic-role',
  roleVersion: '1',
}
const row = {
  _id: 'material-a',
  name: 'Authorized-price-shaped material',
  state: 1,
  price: 123.5,
  serviceType: ['service-a'],
  sourceTypeList: ['source-a'],
}

afterEach(() => vi.unstubAllEnvs())

describe('R1 catalog price reads: current identity and WorkOrder scope fence', () => {
  it('denies every price-bearing list without an active role scope before dispatch', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const execute = vi.fn(async () => ({ data: [row] }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    for (const read of [
      catalog.listPackages(ctx),
      catalog.listProcedures(ctx),
      catalog.listMaterials(ctx),
      catalog.listMeasures(ctx),
    ]) {
      expect((await read).state).toBe('failed_terminal')
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('requires a current identity and role-listed WorkOrder context before exposing catalog prices', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const execute = vi.fn(async () => ({ data: [row] }))
    for (const incompleteScope of [
      { ...current, sessionRef: '' },
      { ...current, userId: '' },
      { ...current, roleId: null },
    ]) {
      const incomplete = createQuotationCatalogReadAdapter({ execute }, () => incompleteScope, undefined, () => true)
      expect((await incomplete.listMaterials(ctx)).state).toBe('failed_terminal')
    }
    const complete = createQuotationCatalogReadAdapter({ execute }, () => ({ ...current, roleVersion: null }), undefined, () => true)
    expect((await complete.listMaterials(ctx)).state).toBe('succeeded')
    expect((await complete.listMaterials({ serviceType: ctx.serviceType, sourceType: ctx.sourceType })).state).toBe('failed_terminal')
    expect((await complete.listMaterials({ ...ctx, sourceType: '' })).state).toBe('failed_terminal')
    const unlisted = createQuotationCatalogReadAdapter({ execute }, () => current, undefined, () => false)
    expect((await unlisted.listMaterials(ctx)).state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('allows an authorized scoped adapter projection without inventing effective SKU pricing', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const execute = vi.fn(async () => ({ data: [row], page: 1, rows: 20, total: 1 }))
    const catalog = createQuotationCatalogReadAdapter({ execute }, () => current, undefined, id => id === String(ctx.workOrderId))
    const read = await catalog.listMaterials(ctx)
    expect(read.state).toBe('succeeded')
    expect(read.data?.items[0]).toMatchObject({ id: 'material-a', price: 123.5 })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      path: 'basic/material/queryWithRank',
      body: expect.objectContaining({ sourceType: 'source-a', 'in:serviceType|array#and': 'service-a' }),
    }))
    const sku = await catalog.listMaterialSkuVariants?.(ctx, 'direct_material', ['material-a'])
    expect(sku?.state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ path: 'basic/material/query' }))
  })

  it('discards returned monetary rows when the current identity changes in flight', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let finish!: (body: unknown) => void
    const execute = vi.fn(() => new Promise<unknown>(resolve => { finish = resolve }))
    let scope = current
    const catalog = createQuotationCatalogReadAdapter({ execute }, () => scope, undefined, () => true)
    const pending = catalog.listMaterials(ctx)
    scope = { ...current, roleId: 'rotated-role' }
    finish({ data: [row] })
    const result = await pending
    expect(result.state).toBe('failed_terminal')
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
