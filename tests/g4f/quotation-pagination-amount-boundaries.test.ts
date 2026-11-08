import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'
import { useQuotationCatalogBrowserStore } from '@features/work-orders/quotation/catalog-browser-store'
import { evaluateQuotationDraft } from '@features/work-orders/quotation/engine'
import { appendQuotationGroup, appendQuotationSelection, createEmptyQuotationDraft, createQuotationGroup, type QuotationDraft, type QuotationLineKind } from '@features/work-orders/quotation/model'

const context = { workOrderId: asOpaqueId<'WorkOrderId'>('audit-order'), serviceType: '11', sourceType: '4' }
const routes: Record<QuotationLineKind, string> = {
  package: 'biz/projPackage/queryWithRank', procedure: 'biz/procedure/queryWithRank',
  material: 'basic/material/queryWithRank', measure: 'biz/measure/queryWithRank',
}
const success = <T>(data: T) => ({ state: 'succeeded' as const, data })
interface WirePage { data: Record<string, unknown>[]; total?: number; page?: number; rows?: number }
function catalog(options: { count?: number; alter?: (page: WirePage, kind: QuotationLineKind, number: number) => WirePage; price?: number } = {}) {
  const execute = vi.fn(async (request: ApiReadRequest) => {
    const kind = (Object.keys(routes) as QuotationLineKind[]).find(k => routes[k] === request.path)!
    expect(kind).toBeDefined()
    expect(request.body).toMatchObject({ rows: 20, 'in:serviceType|array#and': '11', sourceType: '4', 'is:state|integer#and': 1 })
    const number = Number(request.body?.page)
    const count = options.count ?? 21
    const rows = Array.from({ length: count }, (_, index) => ({
      _id: `${kind}-${index}`, name: `Synthetic ${kind} ${index}`, unit: kind === 'material' ? '5' : '2',
      price: options.price ?? (kind === 'package' ? 100 : 330),
      guideUnitPrice: options.price ?? (kind === 'procedure' ? 55 : 7),
      minimumPrice: 0, minimumGuideTotalPrice: options.price === undefined ? 1500 : 0,
      serviceType: ['11'], sourceTypeList: ['4'], spec: '10',
    }))
    const page = { data: rows.slice((number - 1) * 20, number * 20), total: count, page: number, rows: 20 }
    return options.alter ? options.alter(page, kind, number) : page
  })
  const api = createQuotationCatalogReadAdapter({ execute })
  vi.spyOn(api, 'getPackageDetail').mockImplementation(async id => success({
    package: { id, kind: 'package', name: 'Synthetic package', unit: '2', price: options.price ?? 100, pricingMethod: '0' },
    procedures: [], measures: [], materials: [{ id: 'component', referenceId: 'material-0', kind: 'material',
      item: { id: 'material-0', kind: 'material', name: 'Synthetic material', price: 330, unit: '5', specification: '10' },
      layer: 'layer-1', coefficient: 1, coefficientUnit: '2', price: 0 }],
  }))
  return { api, execute }
}
function draft(kind: QuotationLineKind = 'procedure', index = 0, quantity = 18.75): QuotationDraft {
  let d = appendQuotationGroup(createEmptyQuotationDraft(context.workOrderId, 'audit-node'), createQuotationGroup('group', {
    repairParts: ['roof'], partDescription: 'Synthetic roof', maintainAreaNum: '18.75',
  }))
  for (const k of ['procedure', 'material', ...(kind === 'package' || kind === 'measure' ? [kind] : [])] as QuotationLineKind[]) {
    d = appendQuotationSelection(d, 'group', { catalogId: `${k}-${k === kind ? index : 0}`, kind: k, label: `Synthetic ${k}`, unit: k === 'material' ? '5' : '2' }, k)
  }
  return { ...d, groups: d.groups.map(g => ({ ...g,
    procedures: g.procedures.map(s => ({ ...s, quantity: kind === 'procedure' ? quantity : 18.75 })),
    materials: g.materials.map(s => ({ ...s, quantity: kind === 'material' ? quantity : 2 })),
    measures: g.measures.map(s => ({ ...s, quantity })),
    projPackages: g.projPackages.map(s => ({ ...s, quantity, configuration: { procedures: [], measures: [], materials: [{
      providerComponentId: 'component', providerReferenceId: 'material-0', catalogId: 'material-0', label: 'Synthetic material', layer: 'layer-1',
    }] } })),
  })) }
}
const evaluate = (d: QuotationDraft, c = catalog()) => evaluateQuotationDraft({ draft: d, catalogContext: context, catalogRead: c.api })

beforeEach(() => setActivePinia(createPinia()))
describe('bounded catalog hydration and browser completeness', () => {
  for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
    it(`hydrates an actually browsed page-two ${kind} through the real adapter and engine`, async () => {
      const c = catalog(), browser = useQuotationCatalogBrowserStore()
      browser.configure({ readPort: c.api, catalogContext: context }); browser.open(kind)
      await browser.loadList(kind); await browser.loadNextPage(kind)
      expect(browser.selectedCatalogItemFor(kind, `${kind}-20`)?.id).toBe(`${kind}-20`)
      const result = await evaluate(draft(kind, 20), c)
      expect(result.state).toBe('ready'); expect(result.payload?.type).toBe(1)
      expect(c.execute.mock.calls.filter(([r]) => r.path === routes[kind] && r.body?.page === 2)).toHaveLength(2)
    })
  }
  it('keeps missing-page state recoverable, then accepts a genuine final page', async () => {
    let missing = true
    const c = catalog({ alter: (p, _kind, n) => n === 2 && missing ? { ...p, data: [] } : p })
    const b = useQuotationCatalogBrowserStore(); b.configure({ readPort: c.api, catalogContext: context }); b.open('procedure')
    await b.loadList('procedure'); await b.loadNextPage('procedure')
    expect(b.catalogPagesByKind.procedure).toBe(1); expect(b.catalogMoreByKind.procedure).toBe(true)
    expect(b.catalogPageErrorByKind.procedure).toBeTruthy(); expect(b.catalogItemsByKind.procedure).toHaveLength(20)
    missing = false; await b.loadNextPage('procedure')
    expect(b.catalogPagesByKind.procedure).toBe(2); expect(b.catalogMoreByKind.procedure).toBe(false)
    expect(b.catalogPageErrorByKind.procedure).toBe(''); expect(b.catalogItemsByKind.procedure).toHaveLength(21)
  })
  const invalidPages: Record<string, (p: WirePage) => WirePage> = {
    missing: p => ({ ...p, data: [] }), wrongPage: p => ({ ...p, page: 3 }),
    changedTotal: p => ({ ...p, total: 22 }), missingTotal: p => { const { total: _, ...rest } = p; return rest },
    duplicateEarlier: p => ({ ...p, data: [{ ...p.data[0], _id: 'procedure-0' }] }),
    duplicateWithin: p => ({ ...p, data: [p.data[0], p.data[0]] }),
    wrongSize: p => ({ ...p, rows: 21 }), invalidId: p => ({ ...p, data: [{ ...p.data[0], _id: '' }] }),
  }
  for (const [name, alter] of Object.entries(invalidPages)) {
    it(`blocks ${name} before ready payload, and retains browser page-one choices`, async () => {
      const c = catalog({ alter: (p, kind, n) => kind === 'procedure' && n === 2 ? alter(p) : p })
      const result = await evaluate(draft('procedure', 20), c)
      expect(result.state).toBe('blocked'); expect(result.payload).toBeUndefined()
      const b = useQuotationCatalogBrowserStore(); b.configure({ readPort: c.api, catalogContext: context }); b.open('procedure')
      await b.loadList('procedure'); await b.loadNextPage('procedure')
      expect(b.catalogPageErrorByKind.procedure).toBeTruthy(); expect(b.catalogPagesByKind.procedure).toBe(1)
      expect(b.selectedCatalogItemFor('procedure', 'procedure-0')).not.toBeNull()
    })
  }
  it('keeps a genuinely empty catalog distinct from an incomplete page', async () => {
    const c = catalog({ count: 0 }), b = useQuotationCatalogBrowserStore()
    b.configure({ readPort: c.api, catalogContext: context }); b.open('procedure'); await b.loadList('procedure')
    expect(b.catalogStatesByKind.procedure).toBe('succeeded'); expect(b.catalogMoreByKind.procedure).toBe(false)
    expect(b.catalogPageErrorByKind.procedure).toBe('')
    expect((await evaluate(draft(), c)).state).toBe('blocked')
  })
  it('does not trust a wrong category or an absent selected identity', async () => {
    const c = catalog({ count: 1 })
    vi.spyOn(c.api, 'listProcedures').mockResolvedValue(success({ items: [{ kind: 'material', id: 'procedure-0', name: 'Wrong category' }] as never }))
    expect((await evaluate(draft(), c)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'catalog.kind_mismatch' })]))
    expect((await evaluate(draft('procedure', 99), catalog({ count: 1 }))).state).toBe('blocked')
  })
  it('accepts the exact 50-page bound but blocks a declared larger provider before unbounded reads', async () => {
    const c = catalog({ count: 1000 }); expect((await evaluate(draft('procedure', 999), c)).state).toBe('ready')
    expect(c.execute.mock.calls.filter(([r]) => r.path === routes.procedure)).toHaveLength(50)
    const large = catalog({ count: 1001 }); expect((await evaluate(draft(), large)).state).toBe('blocked')
    expect(large.execute.mock.calls.every(([r]) => r.body?.page === 1)).toBe(true)
  })
  it('accepts a metadata-free short terminal page but cannot call a full unknown page complete', async () => {
    const legacy = catalog({ count: 1, alter: p => ({ data: p.data }) })
    expect((await evaluate(draft(), legacy)).state).toBe('ready')
    const unknown = catalog({ count: 1000, alter: p => ({ data: p.data }) })
    expect((await evaluate(draft(), unknown)).state).toBe('blocked')
    expect(unknown.execute.mock.calls.every(([r]) => Number(r.body?.page) <= 50)).toBe(true)
  })
})

describe('engine monetary boundary without fabricated zero-price success', () => {
  it('preserves normal no-SKU SPU, raw units and 1500 + 660 minimum-price control', async () => {
    const r = await evaluate(draft()); expect(r.state).toBe('ready'); expect(r.pricing?.calcTotalPrice.totalPrice).toBe(2160)
    expect(r.payload?.type).toBe(1); expect(JSON.stringify(r.payload)).not.toContain('skuId')
    expect(r.pricing?.fillOrder.groups[0].selectionAmounts.map(x => x.catalogUnitPrice)).toEqual([55, 330])
  })
  for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
    for (const quantity of [1e21, Number.MAX_VALUE, Infinity, NaN]) {
      it(`blocks ${kind} invalid/out-of-range quantity ${String(quantity)} before a type1 payload`, async () => {
        const r = await evaluate(draft(kind, 0, quantity)); expect(r.state).toBe('blocked'); expect(r.payload).toBeUndefined()
      })
    }
  }
  for (const price of [NaN, Infinity, -1, 1e21]) {
    it(`rejects invalid provider price ${String(price)} rather than treating it as free`, async () => {
      const r = await evaluate(draft(), catalog({ price })); expect(r.state).toBe('blocked'); expect(r.payload).toBeUndefined()
    })
  }
  it('blocks aggregate overflow even when individual row products are in range', async () => {
    const d = draft('procedure', 0, 6e20)
    const two = { ...d, groups: d.groups.map(g => ({ ...g, materials: g.materials.map(s => ({ ...s, quantity: 6e20 })) })) }
    const r = await evaluate(two, catalog({ price: 1 })); expect(r.state).toBe('blocked'); expect(r.payload).toBeUndefined()
  })
  it('blocks the sum of individually valid repair groups at the same monetary boundary', async () => {
    const d = draft('procedure', 0, 6e20), g = d.groups[0]
    const r = await evaluate({ ...d, groups: [g, { ...g, groupId: 'second',
      procedures: g.procedures.map(s => ({ ...s, selectionId: 'second-procedure' })),
      materials: g.materials.map(s => ({ ...s, selectionId: 'second-material' })),
    }] }, catalog({ price: 1 }))
    expect(r.state).toBe('blocked'); expect(r.payload).toBeUndefined()
    expect(r.issues.some(i => i.code === 'pricing.order_total_invalid')).toBe(true)
  })
  for (const [quantity, expected] of [[1e21 - 131072, 'ready'], [1e21, 'blocked'], [1e21 + 131072, 'blocked']] as const) {
    it(`checks the actual rounding-domain boundary ${quantity}`, async () => {
      const r = await evaluate(draft('procedure', 0, quantity), catalog({ price: 1 }))
      expect(r.state).toBe(expected)
      if (expected === 'blocked') expect(r.payload).toBeUndefined()
      else expect(r.pricing!.calcTotalPrice.totalPrice).toBeGreaterThan(0)
    })
  }
  it('retains supported finite large values and legitimate zero-price rows without invented limits', async () => {
    const large = await evaluate(draft('procedure', 0, 1e18), catalog({ price: 1 }))
    expect(large.state).toBe('ready'); expect(large.pricing!.calcTotalPrice.totalPrice).toBeGreaterThan(0)
    const zero = await evaluate(draft(), catalog({ price: 0 }))
    expect(zero.state).toBe('ready'); expect(zero.payload?.totalPrice).toBe(0)
  })
  it('blocks nonfinite package markup even though NaN would otherwise be ignored by a >0 check', async () => {
    const c = catalog()
    vi.mocked(c.api.getPackageDetail).mockImplementation(async id => {
      // Build a fresh legitimate detail; this test changes only its markup input.
      return success({ package: { id, kind: 'package', name: 'Package', price: 100 }, procedures: [], measures: [], materials: [{
        id: 'component', referenceId: 'material-0', kind: 'material', item: { id: 'material-0', kind: 'material', name: 'Material', specification: '10' },
        layer: 'layer-1', coefficient: 1, coefficientUnit: '2', price: NaN,
      }] })
    })
    const r = await evaluate(draft('package', 0, 1), c); expect(r.state).toBe('blocked'); expect(r.payload).toBeUndefined()
    expect(r.issues.some(i => i.code === 'pricing.package_markup_invalid')).toBe(true)
  })
})
