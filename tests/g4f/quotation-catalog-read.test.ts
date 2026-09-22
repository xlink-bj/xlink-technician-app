import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiReadRequest } from '@adapters/api/technician-api'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import {
  isMockOwnedRead,
  mockQuotationCatalogServiceType,
  mockQuotationCatalogSourceType,
  resetBusinessMockCache,
  resetMockCommandState,
  setBusinessMockMode,
} from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'

const query = { serviceType: 'service-type-1', sourceType: 'source-type-2' }
const sessionRef = asOpaqueId<'SessionRef'>('synthetic-catalog-session')

function catalogItem(id: string, name: string) {
  return {
    _id: id,
    name,
    unit: '项',
    spec: '结构样例',
    serviceType: [query.serviceType],
    sourceTypeList: query.sourceType ? [query.sourceType] : [],
    repairPart: '["synthetic-repair-part"]',
    order: 2,
    price: 120,
    minimumPrice: '80.5',
    guideUnitPrice: 45,
    minimumGuideTotalPrice: 30,
    servicePrice: 100,
    serviceCostPrice: 55,
    storeCostPrice: 60,
    cost: 50,
  }
}

function detailEntity(id = 'package-1') {
  return {
    ...catalogItem(id, '服务包结构样例'),
    procedureList: [{
      _id: 'procedure-row-1',
      procedureId: 'procedure-1',
      procedure: catalogItem('procedure-1', '工序结构样例'),
      coefficient: 1.5,
      unit: '处',
      order: 1,
    }],
    materialList: [{
      _id: 'material-row-1',
      materialId: 'material-1',
      material: catalogItem('material-1', '材料结构样例'),
      number: '2',
      coefficient: 1,
      coefficientUnit: '支',
      unit: '支',
      order: 2,
      price: 15,
    }],
    measureList: [{
      _id: 'measure-row-1',
      measureId: 'measure-1',
      measure: catalogItem('measure-1', '计措结构样例'),
      unit: '次',
      order: 3,
    }],
  }
}

function mockAdapter(request: ReturnType<typeof vi.fn>) {
  return createQuotationCatalogReadAdapter(createUniApiReadTransport({
    apiBaseUrl: 'https://mock-review.invalid',
    getSessionRef: () => sessionRef,
    request: request as never,
    mockLatencyMs: 0,
  }))
}

describe('G4-F Phase 1C quotation catalog read foundation', () => {
  beforeEach(() => {
    resetBusinessMockCache()
    resetMockCommandState()
    setBusinessMockMode('off')
  })

  it('uses the R1-ranked read routes and exact provider context filters', async () => {
    const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [catalogItem('catalog-1', '结构样例')], page: 1, rows: 20, total: 1 }))
    const catalog = createQuotationCatalogReadAdapter({ execute })

    const results = await Promise.all([
      catalog.listPackages(query),
      catalog.listProcedures(query),
      catalog.listMaterials(query),
      catalog.listMeasures(query),
    ])

    expect(execute.mock.calls.map(([request]) => request)).toEqual([
      {
        method: 'POST',
        path: 'biz/projPackage/queryWithRank',
        body: {
          _all: '1',
          'is:state|integer#and': 1,
          'in:serviceType|array#and': query.serviceType,
          sourceType: query.sourceType,
          sortField: 'order,_id',
          sortOrder: 'asc',
        },
      },
      {
        method: 'POST',
        path: 'biz/procedure/queryWithRank',
        body: {
          _all: '1',
          'is:state|integer#and': 1,
          'in:serviceType|array#and': query.serviceType,
          sourceType: query.sourceType,
          sortField: 'order,_id',
          sortOrder: 'asc',
        },
      },
      {
        method: 'POST',
        path: 'basic/material/queryWithRank',
        body: {
          _all: '1',
          'is:state|integer#and': 1,
          'in:serviceType|array#and': query.serviceType,
          sourceType: query.sourceType,
          sortField: 'order,_id',
          sortOrder: 'asc',
        },
      },
      {
        method: 'POST',
        path: 'biz/measure/queryWithRank',
        body: {
          _all: '1',
          'is:state|integer#and': 1,
          'in:serviceType|array#and': query.serviceType,
          sourceType: query.sourceType,
          sortField: 'order,_id',
          sortOrder: 'asc',
        },
      },
    ])
    for (const result of results) {
      expect(result.state).toBe('succeeded')
      expect(result.data?.items[0]).toMatchObject({
        id: 'catalog-1',
        name: '结构样例',
        unit: '项',
        specification: '结构样例',
        serviceTypes: [query.serviceType],
        sourceTypeList: [query.sourceType],
        repairPart: '["synthetic-repair-part"]',
        price: 120,
        minimumPrice: 80.5,
        guideUnitPrice: 45,
        minimumGuideTotalPrice: 30,
      })
    }
  })

  it('omits sourceType only when the active context does not provide it', async () => {
    const execute = vi.fn(async () => ({ data: [] }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    await catalog.listPackages({ serviceType: 'service-type-1' })
    expect(execute).toHaveBeenCalledWith({
      method: 'POST',
      path: 'biz/projPackage/queryWithRank',
      body: {
        _all: '1',
        'is:state|integer#and': 1,
        'in:serviceType|array#and': 'service-type-1',
        sortField: 'order,_id',
        sortOrder: 'asc',
      },
    })
  })

  it('maps package detail child relations and fails closed on identity or shape conflicts', async () => {
    const execute = vi.fn(async () => ({ success: true, entity: detailEntity() }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const result = await catalog.getPackageDetail('package-1')

    expect(execute).toHaveBeenCalledWith({ method: 'POST', path: 'biz/projPackage/findById/package-1' })
    expect(result).toMatchObject({
      state: 'succeeded',
      data: {
        package: { id: 'package-1', name: '服务包结构样例' },
        procedures: [{ referenceId: 'procedure-1', item: { id: 'procedure-1' }, coefficient: 1.5 }],
        materials: [{ referenceId: 'material-1', item: { id: 'material-1' }, number: '2', coefficientUnit: '支', price: 15 }],
        measures: [{ referenceId: 'measure-1', item: { id: 'measure-1' } }],
      },
    })

    const mismatch = await createQuotationCatalogReadAdapter({
      execute: async () => ({ success: true, entity: detailEntity('different-package') }),
    }).getPackageDetail('package-1')
    expect(mismatch.state).toBe('failed_terminal')

    const incomplete = await createQuotationCatalogReadAdapter({
      execute: async () => ({ success: true, entity: { ...detailEntity(), measureList: undefined } }),
    }).getPackageDetail('package-1')
    expect(incomplete.state).toBe('failed_terminal')
  })

  it('rejects an embedded child whose identity disagrees with the package reference', async () => {
    const entity = detailEntity()
    entity.materialList[0].material._id = 'different-material'
    const result = await createQuotationCatalogReadAdapter({
      execute: async () => ({ entity }),
    }).getPackageDetail('package-1')
    expect(result.state).toBe('failed_terminal')
  })

  it('preserves unresolved package child references without inventing embedded catalog data', async () => {
    const entity = detailEntity()
    entity.materialList[0].material = null as never
    const result = await createQuotationCatalogReadAdapter({
      execute: async () => ({ entity }),
    }).getPackageDetail('package-1')
    expect(result).toMatchObject({
      state: 'succeeded',
      data: { materials: [{ referenceId: 'material-1', item: null }] },
    })
  })

  it('does not issue an unscoped catalog request when serviceType is missing', async () => {
    const execute = vi.fn(async () => ({ data: [] }))
    const result = await createQuotationCatalogReadAdapter({ execute }).listMaterials({ serviceType: ' ' })
    expect(result.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs all catalog reads through deterministic Mock transport without real network access', async () => {
    setBusinessMockMode('data')
    const realRequest = vi.fn()
    const catalog = mockAdapter(realRequest)
    const mockQuery = {
      serviceType: mockQuotationCatalogServiceType,
      sourceType: mockQuotationCatalogSourceType,
    }

    const [packages, procedures, materials, measures, detail] = await Promise.all([
      catalog.listPackages(mockQuery),
      catalog.listProcedures(mockQuery),
      catalog.listMaterials(mockQuery),
      catalog.listMeasures(mockQuery),
      catalog.getPackageDetail('mock-catalog-package-basic'),
    ])
    expect(packages.data?.items[0]).toMatchObject({ id: 'mock-catalog-package-basic', name: 'Mock 服务方案 A' })
    expect(procedures.data?.items[0].id).toBe('mock-catalog-procedure-seal')
    expect(materials.data?.items[0].id).toBe('mock-catalog-material-sealant')
    expect(measures.data?.items[0].id).toBe('mock-catalog-measure-inspection')
    expect(detail.data?.materials[0].item?.id).toBe('mock-catalog-material-sealant')
    expect([packages, procedures, materials, measures, detail].every((result) => result.state === 'succeeded')).toBe(true)
    expect(realRequest).not.toHaveBeenCalled()
  })

  it('restores authenticated Real read transport when Mock is off without contacting a live host in the test', async () => {
    const realRequest = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({
        statusCode: 200,
        data: { data: [catalogItem('real-read-catalog-1', '读取样例')] },
      } as unknown as UniNamespace.RequestSuccessCallbackResult)
    })
    const catalog = createQuotationCatalogReadAdapter(createUniApiReadTransport({
      apiBaseUrl: 'https://read-adapter.test.invalid',
      getSessionRef: () => sessionRef,
      request: realRequest,
      mockLatencyMs: 0,
    }))
    const result = await catalog.listPackages(query)
    const request = realRequest.mock.calls[0]?.[0]
    const requestBody = new URLSearchParams(String(request?.data))

    expect(result.data?.items[0].id).toBe('real-read-catalog-1')
    expect(realRequest).toHaveBeenCalledTimes(1)
    expect(request).toMatchObject({
      url: 'https://read-adapter.test.invalid/biz/projPackage/queryWithRank',
      method: 'POST',
      header: { Cookie: `JSESSIONID=${sessionRef}` },
    })
    expect(requestBody.get('_all')).toBe('1')
    expect(requestBody.get('in:serviceType|array#and')).toBe(query.serviceType)
    expect(requestBody.get('sourceType')).toBe(query.sourceType)
    expect(requestBody.get('sortField')).toBe('order,_id')
    expect(requestBody.get('sortOrder')).toBe('asc')
  })

  it('keeps Mock-empty reads empty and prevents synthetic catalog identities from reaching Real transport', async () => {
    setBusinessMockMode('empty')
    const realRequest = vi.fn()
    const catalog = mockAdapter(realRequest)
    const empty = await catalog.listPackages({
      serviceType: mockQuotationCatalogServiceType,
      sourceType: mockQuotationCatalogSourceType,
    })
    expect(empty).toMatchObject({ state: 'succeeded', data: { items: [], totalCount: 0 } })

    setBusinessMockMode('off')
    const syntheticDetail = await catalog.getPackageDetail('mock-catalog-package-basic')
    const syntheticList = await catalog.listPackages({ serviceType: mockQuotationCatalogServiceType })
    expect(syntheticDetail.state).toBe('failed_terminal')
    expect(syntheticList.state).toBe('failed_terminal')
    expect(realRequest).not.toHaveBeenCalled()
    expect(isMockOwnedRead('biz/projPackage/findById/mock-catalog-package-basic')).toBe(true)
    expect(isMockOwnedRead('biz/projPackage/queryWithRank', {
      'in:serviceType|array#and': mockQuotationCatalogServiceType,
    })).toBe(true)
  })

  it('keeps package detail independent from the Phase 1B flat draft model', async () => {
    const { readFile } = await import('node:fs/promises')
    const [composition, content] = await Promise.all([
      readFile(new URL('../../src/features/work-orders/quotation/model.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../src/features/work-orders/quotation/QuotationActionContent.vue', import.meta.url), 'utf8'),
    ])
    expect(composition).toContain('lines:')
    expect(composition).not.toContain('QuotationCatalogReadPort')
    expect(content).not.toContain('quotationCatalogRead')
  })
})
