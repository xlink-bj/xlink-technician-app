import { createPinia, setActivePinia } from 'pinia'
import { useQuotationCatalogBrowserStore } from '../../src/features/work-orders/quotation/catalog-browser-store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuotationCatalogReadAdapter } from '../../src/adapters/api/quotation-catalog-api'
import { mockScaleCatalogContexts, mockScaleCatalogCounts, mockScaleCatalogRead } from '../../src/adapters/api/mock/quotation-catalog-scale'
import { configuredQuotationPackageCandidateFor, quotationPackageMaterialChoiceFor } from '../../src/features/work-orders/quotation/package-configuration'
import { appendQuotationGroup, appendQuotationSelection, upsertQuotationPackageSelection, createEmptyQuotationDraft, createQuotationGroup } from '../../src/features/work-orders/quotation/model'
import { hydrateQuotationDraft } from '../../src/features/work-orders/quotation/hydration'
import { calculateQuotationPricing } from '../../src/features/work-orders/quotation/pricing'
import { tryMockRead } from '../../src/adapters/api/mock/router'
import { setBusinessMockMode, resetBusinessMockCache } from '../../src/adapters/api/mock'
import { asOpaqueId } from '../../src/shared/types'
import { listRequest } from '../../src/adapters/api/quotation-catalog-mappers'

const port = () => createQuotationCatalogReadAdapter({ execute: async request => {
  const result = mockScaleCatalogRead(request.path, request.body ?? {})
  if (result === undefined || result === null) throw new Error('Rejected synthetic request')
  return result
} })
const context = { ...mockScaleCatalogContexts.standard, workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work-order') }

describe('M08 opt-in scale provider through actual catalog adapter', () => {
  afterEach(() => { vi.unstubAllEnvs(); resetBusinessMockCache() })
  it('routes scale only with explicit DEV journey opt-in and preserves the default small fixture', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    setBusinessMockMode('data')
    const route = 'biz/projPackage/queryWithRank'
    const body = listRequest(route, context, false, 1).body!
    vi.stubEnv('VITE_XLINK_R1_CATALOG_SCALE', 'false')
    expect(await tryMockRead(route, body, { latencyMs: 0 })).toMatchObject({ total: 2 })
    vi.stubEnv('VITE_XLINK_R1_CATALOG_SCALE', 'true')
    expect(await tryMockRead(route, body, { latencyMs: 0 })).toMatchObject({ total: 27 })
    expect(await tryMockRead(route, { ...body, sourceType: 'wrong' }, { latencyMs: 0 })).toBeNull()
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(await tryMockRead(route, body, { latencyMs: 0 })).toMatchObject({ total: 2 })
    vi.stubEnv('DEV', false)
    expect(await tryMockRead(route, body, { latencyMs: 0 })).not.toMatchObject({ total: 27 })
  })
  for (const name of ['standard', 'restricted'] as const) {
    it(`pages ${name} exactly, including empty providers and final empty pages`, async () => {
      const api = port()
      const methods = [api.listPackages.bind(api), api.listProcedures.bind(api), api.listMaterials.bind(api), api.listMeasures.bind(api)]
      for (const [index, list] of methods.entries()) {
        const count = mockScaleCatalogCounts[name][index]!
        const ids: string[] = []
        for (let page = 1; page <= Math.ceil(count / 20) + 1; page++) {
          const result = await list(mockScaleCatalogContexts[name], page)
          expect(result.state).toBe('succeeded')
          expect(result.data).toMatchObject({ page, pageSize: 20, totalCount: count })
          expect(result.data!.items.length).toBe(Math.max(0, Math.min(20, count - (page - 1) * 20)))
          ids.push(...result.data!.items.map(item => item.id))
        }
        expect(new Set(ids).size).toBe(count)
        expect(ids).toEqual([...ids].sort())
        for (const id of index === 0 ? ids : []) {
          const detail = await api.getPackageDetail(id)
          expect(detail.state).toBe('succeeded')
          expect(detail.data!.package.id).toBe(id)
          for (const row of [...detail.data!.procedures, ...detail.data!.materials, ...detail.data!.measures]) {
            expect(row.id).toContain(`${id}-`)
            expect(row.referenceId).toBe(row.item?.id)
            expect(row.coefficient).toBeGreaterThan(0)
          }
          expect(detail.data!.materials).toHaveLength(name === 'standard' ? 3 : 1)
          expect(detail.data!.procedures).toHaveLength(1)
          expect(detail.data!.measures).toHaveLength(name === 'standard' ? 1 : 0)
        }
      }
    })
  }

  it('rejects missing, cross-context, malformed and unbounded list requests without fallback', async () => {
    const route = 'biz/projPackage/queryWithRank'
    const body = listRequest(route, context, false, 1).body!
    for (const patch of [ { sourceType: undefined }, { sourceType: '' }, { sourceType: mockScaleCatalogContexts.restricted.sourceType },
      { 'in:serviceType|array#and': undefined }, { rows: 21 }, { page: 0 }, { page: 51 }, { page: 1.5 },
      { 'is:state|integer#and': 0 }, { sortField: '_id' }, { sortOrder: 'desc' }, { _all: '1' }, { unexpected: true }]) {
      expect(mockScaleCatalogRead(route, { ...body, ...patch })).toBeNull()
    }
    expect((await port().listPackages({ serviceType: context.serviceType })).state).not.toBe('succeeded')
    expect(mockScaleCatalogRead('unrelated/query', {})).toBeUndefined()
    expect(mockScaleCatalogRead('biz/projPackage/findById/mock-scale-standard-package-999', {})).toBeNull()
    expect(mockScaleCatalogRead('biz/projPackage/findById/mock-scale-standard-package-001', { sourceType: 'foreign' })).toBeNull()
  })

  it('keeps every context-local SPU genuinely SKU-empty, without fake identities', async () => {
    for (const name of ['standard', 'restricted'] as const) {
      const api = port()
      const ctx = { ...mockScaleCatalogContexts[name], workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work-order') }
      const ids = new Set<string>()
      for (let page = 1; page <= Math.ceil(mockScaleCatalogCounts[name][2] / 20); page++) {
        const result = await api.listMaterials(ctx, page)
        result.data!.items.forEach(row => ids.add(row.id))
      }
      for (let page = 1; page <= Math.ceil(mockScaleCatalogCounts[name][0] / 20); page++) {
        const packages = await api.listPackages(ctx, page)
        for (const item of packages.data!.items) {
          const detail = await api.getPackageDetail(item.id)
          detail.data!.materials.forEach(row => ids.add(row.referenceId!))
        }
      }
      expect(ids.size).toBe(name === 'standard' ? 93 : 15)
      for (const id of ids) {
        const result = await api.listMaterialSkuVariants!(ctx, 'direct_material', [id], [])
        expect(result.state).toBe('succeeded')
        expect(result.data!.items).toEqual([])
      }
    }
    expect(mockScaleCatalogRead('basic/material/query', { _all: '1', 'is:state|integer#and': 1,
      'in:spuid|array#and': 'mock-scale-standard-material-001,mock-scale-restricted-material-001' })).toBeNull()
  })

  it('discards a late standard page after switching the real browser store to restricted context', async () => {
    setActivePinia(createPinia())
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    let held = false
    const api = createQuotationCatalogReadAdapter({ execute: async request => {
      const data = request.body ?? {}
      const result = mockScaleCatalogRead(request.path, data)
      if (request.path === 'biz/projPackage/queryWithRank' && data.page === 2
        && data.sourceType === mockScaleCatalogContexts.standard.sourceType) {
        held = true
        await pending
      }
      if (result === null || result === undefined) throw new Error('Rejected synthetic request')
      return result
    } })
    const store = useQuotationCatalogBrowserStore()
    store.configure({ readPort: api, catalogContext: context })
    store.open('package')
    await store.loadList('package')
    expect(store.catalogItemsByKind.package).toHaveLength(20)
    const late = store.loadNextPage('package')
    await vi.waitFor(() => expect(held).toBe(true))
    expect(store.catalogPageLoadingByKind.package).toBe(true)
    store.configure({ readPort: api, catalogContext: mockScaleCatalogContexts.restricted })
    for (const kind of ['package', 'procedure', 'material', 'measure'] as const) await store.loadList(kind)
    release()
    await late
    expect(store.catalogItemsByKind.package.map(row => row.id)).toEqual(['mock-scale-restricted-package-001'])
    expect(store.catalogItemsByKind.material).toHaveLength(14)
    expect(store.catalogItemsByKind.procedure).toEqual([])
    expect(store.catalogItemsByKind.measure).toEqual([])
    for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
      expect(store.catalogStatesByKind[kind]).toBe('succeeded')
      expect(store.catalogPagesByKind[kind]).toBe(1)
      expect(store.catalogMoreByKind[kind]).toBe(false)
      expect(store.catalogPageLoadingByKind[kind]).toBe(false)
      expect(store.catalogItemsByKind[kind].every(row => row.id.startsWith('mock-scale-restricted-'))).toBe(true)
    }
  })

  it.each([[0, 459], [1, 473]])('prices final-page selections with package alternative %i as %i', async (alternative, amount) => {
    const api = port()
    const item = (await api.listPackages(context, 2)).data!.items[6]!
    const detail = (await api.getPackageDetail(item.id)).data!
    const group = createQuotationGroup('synthetic-group', { repairParts: ['mock-roof'], maintainAreaNum: '2' })
    const configured = configuredQuotationPackageCandidateFor(group, item, detail,
      [detail.materials[alternative]!, detail.materials[2]!].map(row => quotationPackageMaterialChoiceFor(row)!))
    let draft = appendQuotationGroup(createEmptyQuotationDraft('synthetic-work-order', 'synthetic-node'), group)
    draft = upsertQuotationPackageSelection(draft, group.groupId, { catalogId: item.id, label: item.name,
      configuration: configured.data!.configuration, initialQuantity: 2, selectionId: 'last-package' })
    const direct = [(await api.listProcedures(context, 4)).data!.items[5]!,
      (await api.listMaterials(context, 5)).data!.items[8]!, (await api.listMeasures(context)).data!.items[3]!]
    for (const row of direct) draft = appendQuotationSelection(draft, group.groupId,
      { catalogId: row.id, kind: row.kind, label: row.name }, row.id)
    const hydrated = await hydrateQuotationDraft({ draft, context, port: api })
    expect(hydrated.state).toBe('succeeded')
    if (hydrated.state !== 'succeeded') throw new Error('Final-page hydration failed')
    expect(calculateQuotationPricing(hydrated.data)).toMatchObject({ state: 'succeeded', data: {
      calcTotalPrice: { originPrice: amount }, fillOrder: { orderListTotalAmount: amount,
        groups: [{ categoryTotals: { package: alternative === 0 ? 268 : 282, procedure: 75, material: 108, measure: 8 } }] },
    } })
    expect((await api.listMaterialSkuVariants!(context, 'package_materials', detail.materials.map(row => row.referenceId!), [])).data!.items).toEqual([])
  })

  it.each([[0, 1, 150], [1, 1, 150], [0, 2, 216], [1, 2, 230]])('prices synthetic alternative %i at quantity %i as %i with actual normalize/configure/hydrate/engine', async (alternative, quantity, amount) => {
    const api = port()
    const item = (await api.listPackages(context)).data!.items[0]!
    const detail = (await api.getPackageDetail(item.id)).data!
    const group = createQuotationGroup('synthetic-group', { repairParts: ['mock-roof'], maintainAreaNum: String(quantity) })
    const chosen = [detail.materials[alternative]!, detail.materials[2]!]
    const configured = configuredQuotationPackageCandidateFor(group, item, detail, chosen.map(row => quotationPackageMaterialChoiceFor(row)!))
    expect(configured.state).toBe('succeeded')
    let draft = appendQuotationGroup(createEmptyQuotationDraft('synthetic-work-order', 'synthetic-node'), group)
    draft = upsertQuotationPackageSelection(draft, group.groupId, { catalogId: item.id, label: item.name, configuration: configured.data!.configuration, initialQuantity: configured.data!.quantity, selectionId: 'synthetic-selection' })
    const hydrated = await hydrateQuotationDraft({ draft, context, port: api })
    expect(hydrated.state).toBe('succeeded')
    if (hydrated.state !== 'succeeded') throw new Error('Hydration failed')
    expect(calculateQuotationPricing(hydrated.data)).toMatchObject({ state: 'succeeded', data: {
      calcTotalPrice: { originPrice: amount, totalPrice: amount }, fillOrder: { orderListTotalAmount: amount },
    } })
    expect(configuredQuotationPackageCandidateFor(group, item, detail, detail.materials.map(row => quotationPackageMaterialChoiceFor(row)!)).state).toBe('failed_terminal')
  })
})
