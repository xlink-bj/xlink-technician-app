import { describe, expect, it, vi } from 'vitest'
import { createQuotationCatalogReadAdapter } from '../../src/adapters/api/quotation-catalog-api'
import type { ApiReadRequest } from '../../src/adapters/api/technician-api'

// Volume only comes from scoped observations. IDs, labels and prices are synthetic.
// This tests the real read adapter; it does not claim the App fixture/router has
// all these products, or that historical price freshness has been verified.
describe('M08 synthetic R1 catalog pagination at observed context volumes', () => {
  for (const [context, counts] of [['standard', [27, 66, 89, 4]], ['restricted', [1, 0, 14, 0]]] as const) {
    it(`preserves ${context} scope, unique identities and page totals across all four providers`, async () => {
      const routes = ['biz/projPackage/queryWithRank','biz/procedure/queryWithRank','basic/material/queryWithRank','biz/measure/queryWithRank']
      const execute = vi.fn(async (request: ApiReadRequest) => {
        const index = routes.indexOf(request.path)
        expect(index).toBeGreaterThanOrEqual(0)
        expect(request.body).toMatchObject({ rows: 20, 'is:state|integer#and': 1, 'in:serviceType|array#and': context, sourceType: `source-${context}` })
        expect(request.body).not.toHaveProperty('_all')
        const page = Number(request.body?.page)
        const rows = Array.from({ length: counts[index]! }, (_, n) => ({
          _id: `synthetic-${context}-${index}-${n}`, name: `合成产品 ${n}`, unit: '项',
          price: 100 + n, guideUnitPrice: 100 + n, minimumPrice: 0, minimumGuideTotalPrice: 0,
          serviceType: [context], sourceTypeList: [`source-${context}`], order: n,
        }))
        return { data: rows.slice((page - 1) * 20, page * 20), total: rows.length, page, rows: 20 }
      })
      const catalog = createQuotationCatalogReadAdapter({ execute })
      const methods = [catalog.listPackages.bind(catalog), catalog.listProcedures.bind(catalog), catalog.listMaterials.bind(catalog), catalog.listMeasures.bind(catalog)]
      for (const [index, list] of methods.entries()) {
        const ids: string[] = []
        const pages = Math.max(1, Math.ceil(counts[index]! / 20))
        for (let page = 1; page <= pages + 1; page++) {
          const result = await list({ serviceType: context, sourceType: `source-${context}` }, page)
          expect(result.state).toBe('succeeded')
          expect(result.data).toMatchObject({ page, pageSize: 20, totalCount: counts[index] })
          if (page > pages) expect(result.data?.items).toHaveLength(0)
          ids.push(...result.data!.items.map(row => row.id))
        }
        expect(ids).toHaveLength(counts[index]!)
        expect(new Set(ids).size).toBe(counts[index])
        expect(ids.every(id => id.startsWith(`synthetic-${context}-${index}-`))).toBe(true)
      }
    })
  }
})
