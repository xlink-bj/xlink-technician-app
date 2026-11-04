import { describe, expect, it } from 'vitest'
import {
  isAllowedR1SelectableCatalogPageRequest,
  isAllowedR1SelectableCatalogSkuPageRequest,
  r1BoundedSelectableSkuRequestBody,
} from '../../scripts/r1-selectable-catalog-read-guard.mjs'

const search = new URLSearchParams()
const context = { workOrderId: 'synthetic-work-order', serviceType: 'synthetic-service-type', sourceType: 'synthetic-source-type' }
const catalogBody = {
  page: 1, rows: 20, 'is:state|integer#and': 1,
  'in:serviceType|array#and': context.serviceType, sourceType: context.sourceType,
  sortField: 'order,_id', sortOrder: 'asc',
}

describe('R1 selectable catalog Production read guard — synthetic scope only', () => {
  it('allows only sequential bounded active catalog pages from one WorkOrder context', () => {
    const request = {
      path: 'biz/projPackage/queryWithRank', method: 'POST', search,
      body: catalogBody, context, expectedPage: 1, requestCount: 0,
    }
    expect(isAllowedR1SelectableCatalogPageRequest(request)).toBe(true)
    expect(isAllowedR1SelectableCatalogPageRequest({ ...request, path: 'biz/procedure/queryWithRank' })).toBe(true)
    for (const candidate of [
      { ...request, path: 'basic/order/query' },
      { ...request, search: new URLSearchParams('all=1') },
      { ...request, context: { ...context, sourceType: 'foreign-source-type' } },
      { ...request, body: { ...catalogBody, sourceType: 'foreign-source-type' } },
      { ...request, body: { ...catalogBody, _all: '1' } },
      { ...request, body: { ...catalogBody, rows: 500 } },
      { ...request, expectedPage: 51 },
      { ...request, expectedPage: 2 },
      { ...request, requestCount: 200 },
      { ...request, context: { ...context, workOrderId: '' } },
    ]) expect(isAllowedR1SelectableCatalogPageRequest(candidate)).toBe(false)
  })

  it('allows bounded SKU pages only for SPUs returned by the scoped catalog read', () => {
    const listedSpuIds = new Set(['synthetic-listed-spu'])
    const request = {
      path: 'basic/material/query', method: 'POST', search,
      body: r1BoundedSelectableSkuRequestBody('synthetic-listed-spu'),
      selectedSpuId: 'synthetic-listed-spu', listedSpuIds,
      expectedPage: 1, requestCount: 0,
    }
    expect(r1BoundedSelectableSkuRequestBody('synthetic-listed-spu')).toEqual({
      page: 1, rows: 30, 'is:state|integer#and': 1, spuid: 'synthetic-listed-spu',
    })
    expect(isAllowedR1SelectableCatalogSkuPageRequest(request)).toBe(true)
    expect(isAllowedR1SelectableCatalogSkuPageRequest({
      ...request, body: r1BoundedSelectableSkuRequestBody('synthetic-listed-spu', 2), expectedPage: 2,
    })).toBe(true)
    for (const candidate of [
      { ...request, selectedSpuId: 'synthetic-foreign-spu' },
      { ...request, listedSpuIds: new Set<string>() },
      { ...request, search: new URLSearchParams('include=all') },
      { ...request, body: { ...request.body, _all: '1' } },
      { ...request, body: { ...request.body, rows: 500 } },
      { ...request, body: r1BoundedSelectableSkuRequestBody('synthetic-listed-spu', 2) },
      { ...request, expectedPage: 51 },
      { ...request, requestCount: 1000 },
    ]) expect(isAllowedR1SelectableCatalogSkuPageRequest(candidate)).toBe(false)
  })
})
