import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiReadRequest } from '@adapters/api/technician-api'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
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
    code: 'catalog-code-1',
    type: 2,
    agelimit: 4,
    materialUnit: '支',
    specUnit: '毫米',
    serviceType: [query.serviceType],
    sourceTypeList: query.sourceType ? [query.sourceType] : [],
    repairPart: '["synthetic-repair-part"]',
    exts: { repairParts: '[&quot;roof&quot;]', constructionParts: '["site-a"]', repairProcedure: '["prep","coat"]' },
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
      price: 999,
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
      price: 999,
      guideUnitPrice: 888,
      exts: { layer: 'layer-2', price: 15 },
    }],
    measureList: [{
      _id: 'measure-row-1',
      measureId: 'measure-1',
      measure: catalogItem('measure-1', '机措结构样例'),
      price: 777,
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
          page: 1,
        rows: 20,
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
          page: 1,
        rows: 20,
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
          page: 1,
        rows: 20,
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
          page: 1,
        rows: 20,
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
      })
    }
    expect(results.map((result) => result.data?.items[0]?.kind)).toEqual([
      'package',
      'procedure',
      'material',
      'measure',
    ])
    expect(results[0].data?.items[0]).toMatchObject({
      kind: 'package',
      type: '2',
      code: 'catalog-code-1',
      ageLimit: 4,
      repairPart: '["synthetic-repair-part"]',
      r1RepairPartsCodes: ['roof'],
      r1ConstructionPartsCodes: ['site-a'],
    })
    expect(results[1].data?.items[0]).toMatchObject({ kind: 'procedure', r1RepairProcedureCodes: ['prep', 'coat'] })
    expect(results[2].data?.items[0]).toMatchObject({
      kind: 'material',
      code: 'catalog-code-1',
      materialUnit: '支',
      specUnit: '毫米',
      type: 2,
    })
    expect(results[1].data?.items[0]).not.toHaveProperty('materialUnit')

    const [packageItem, procedureItem, materialItem, measureItem] = results.map((result) => result.data!.items[0]!)
    expect(packageItem).toMatchObject({ price: 120, minimumPrice: 80.5, cost: 50 })
    expect(procedureItem).toMatchObject({ guideUnitPrice: 45, minimumGuideTotalPrice: 30 })
    expect(materialItem).toMatchObject({
      price: 120,
      servicePrice: 100,
      serviceCostPrice: 55,
      storeCostPrice: 60,
      cost: 50,
    })
    expect(measureItem).toMatchObject({ guideUnitPrice: 45, cost: 50 })

    const fieldsByKind = [
      { item: packageItem, absent: ['guideUnitPrice', 'minimumGuideTotalPrice', 'servicePrice', 'serviceCostPrice', 'storeCostPrice'] },
      { item: procedureItem, absent: ['price', 'minimumPrice', 'servicePrice', 'serviceCostPrice', 'storeCostPrice', 'cost'] },
      { item: materialItem, absent: ['minimumPrice', 'guideUnitPrice', 'minimumGuideTotalPrice'] },
      { item: measureItem, absent: ['price', 'minimumPrice', 'minimumGuideTotalPrice', 'servicePrice', 'serviceCostPrice', 'storeCostPrice'] },
    ] as const
    for (const { item, absent } of fieldsByKind) {
      for (const field of absent) expect(item).not.toHaveProperty(field)
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
        page: 1,
        rows: 20,
        'is:state|integer#and': 1,
        'in:serviceType|array#and': 'service-type-1',
        sortField: 'order,_id',
        sortOrder: 'asc',
      },
    })
  })

  it('preserves R1 Package pricingMethod and Material spuid as explicit fail-closed pricing inputs', async () => {
    const execute = vi.fn(async (request: ApiReadRequest) => {
      if (request.path === 'biz/projPackage/queryWithRank') {
        return { data: [{ _id: 'package-with-sku-method', name: 'Synthetic package', price: 100, exts: { pricingMethod: '1' } }] }
      }
      if (request.path === 'basic/material/queryWithRank') {
        return { data: [{ _id: 'material-with-spu', name: 'Synthetic SKU material', price: 12, spuid: 'synthetic-spu' }] }
      }
      return { data: [] }
    })
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const packages = await catalog.listPackages(query)
    const materials = await catalog.listMaterials(query)
    expect(packages.data?.items[0]).toMatchObject({ kind: 'package', pricingMethod: '1' })
    expect(materials.data?.items[0]).toMatchObject({ kind: 'material', spuId: 'synthetic-spu' })
  })

  it('carries the catalog scope from normalized WorkOrderDetail into the exact read filters', async () => {
    const workOrderApi = createTechnicianApiReadAdapter({
      execute: vi.fn(async (request) => request.path === 'biz/action/query.do'
        ? { status: 1, data: [] }
        : {
            data: {
              serviceAppointment: {
                _id: 'sanitized-work-order',
                serviceType: 'verified-service-type',
                exts: { sourceType: 'verified-source-type' },
              },
            },
          }),
    })
    const workOrder = await workOrderApi.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('sanitized-work-order'))
    expect(workOrder.state).toBe('succeeded')
    expect(workOrder.data?.quotationCatalogContext).toEqual({
      workOrderId: asOpaqueId<'WorkOrderId'>('sanitized-work-order'),
      serviceType: 'verified-service-type',
      sourceType: 'verified-source-type',
    })

    const execute = vi.fn(async () => ({ data: [] }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    await catalog.listPackages(workOrder.data!.quotationCatalogContext!)

    expect(execute).toHaveBeenCalledWith({
      method: 'POST',
      path: 'biz/projPackage/queryWithRank',
      body: {
        page: 1,
        rows: 20,
        'is:state|integer#and': 1,
        'in:serviceType|array#and': 'verified-service-type',
        sourceType: 'verified-source-type',
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
        package: { id: 'package-1', name: '服务包结构样例', kind: 'package', ageLimit: 4 },
        procedures: [{ referenceId: 'procedure-1', item: { id: 'procedure-1' }, coefficient: 1.5 }],
        materials: [{
          kind: 'material',
          referenceId: 'material-1',
          item: {
            id: 'material-1',
            kind: 'material',
            code: 'catalog-code-1',
            materialUnit: '支',
            specUnit: '毫米',
            type: 2,
          },
          layer: 'layer-2',
          number: '2',
          coefficientUnit: '支',
          price: 15,
        }],
        measures: [{ referenceId: 'measure-1', item: { id: 'measure-1' } }],
      },
    })
    const detail = result.data!
    expect(detail.package).toMatchObject({ price: 120, minimumPrice: 80.5, cost: 50 })
    expect(detail.package).not.toHaveProperty('guideUnitPrice')
    expect(detail.procedures[0]?.item).toMatchObject({ guideUnitPrice: 45, minimumGuideTotalPrice: 30 })
    expect(detail.procedures[0]?.item).not.toHaveProperty('price')
    expect(detail.procedures[0]).not.toHaveProperty('price')
    expect(detail.materials[0]?.item).toMatchObject({
      price: 120,
      servicePrice: 100,
      serviceCostPrice: 55,
      storeCostPrice: 60,
      cost: 50,
    })
    expect(detail.measures[0]?.item).toMatchObject({ guideUnitPrice: 45, cost: 50 })
    expect(detail.measures[0]?.item).not.toHaveProperty('minimumGuideTotalPrice')
    expect(detail.measures[0]).not.toHaveProperty('price')
    expect(detail.materials[0]).not.toHaveProperty('guideUnitPrice')

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

  it('keeps package material layer optional and never derives it from list position', async () => {
    const entity = detailEntity()
    Reflect.deleteProperty(entity.materialList[0], 'exts')
    const result = await createQuotationCatalogReadAdapter({
      execute: async () => ({ entity }),
    }).getPackageDetail('package-1')

    expect(result.state).toBe('succeeded')
    expect(result.data?.materials[0]).not.toHaveProperty('layer')
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
    expect(packages.data?.items[0]).toMatchObject({
      kind: 'package',
      id: 'mock-catalog-package-basic',
      name: '屋面防水修缮方案（示例）',
      code: 'DEMO-PKG-001',
      type: 'mock-package-type',
      ageLimit: 2,
    })
    expect(procedures.data?.items[0].id).toBe('mock-catalog-procedure-seal')
    expect(materials.data?.items[0]).toMatchObject({
      kind: 'material',
      id: 'mock-catalog-material-sealant',
      code: 'DEMO-MAT-001',
      materialUnit: '支',
      specUnit: '支',
      type: 1,
    })
    expect(measures.data?.items[0]).toMatchObject({
      kind: 'measure',
      id: 'mock-catalog-measure-inspection',
      name: '高处作业防护（示例）',
    })
    expect(detail.data?.materials[0].item?.id).toBe('mock-catalog-material-sealant')
    expect(detail.data?.materials[0]).toMatchObject({ kind: 'material', layer: 'mock-layer-1' })
    expect([packages, procedures, materials, measures, detail].every((result) => result.state === 'succeeded')).toBe(true)
    expect(realRequest).not.toHaveBeenCalled()
  })

  it('keeps catalog context derived from a synthetic WorkOrder Mock-owned after Mock is disabled', async () => {
    setBusinessMockMode('data')
    const realRequest = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://mock-review.invalid',
      getSessionRef: () => sessionRef,
      request: realRequest as never,
      mockLatencyMs: 0,
    })
    const workOrder = await createTechnicianApiReadAdapter(transport).getWorkOrderDetail(
      asOpaqueId<'WorkOrderId'>('mock-work-order-001'),
    )
    expect(workOrder.data?.quotationCatalogContext).toEqual({
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-001'),
      serviceType: mockQuotationCatalogServiceType,
      sourceType: mockQuotationCatalogSourceType,
    })

    setBusinessMockMode('off')
    const result = await createQuotationCatalogReadAdapter(transport)
      .listPackages(workOrder.data!.quotationCatalogContext!)

    expect(result.state).toBe('failed_terminal')
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
    expect(requestBody.get('_all')).toBeNull()
    expect(requestBody.get('page')).toBe('1')
    expect(requestBody.get('rows')).toBe('20')
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

  it('keeps package detail read-only and independent from the Phase 1D grouped draft model', async () => {
    const { readFile } = await import('node:fs/promises')
    const [composition, content] = await Promise.all([
      readFile(new URL('../../src/features/work-orders/quotation/model.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../src/features/work-orders/quotation/QuotationActionContent.vue', import.meta.url), 'utf8'),
    ])
    expect(composition).toContain('groups:')
    expect(composition).not.toContain('QuotationCatalogReadPort')
    expect(content).not.toContain('quotationCatalogRead')
  })
  it('S1 Q01: bounded page 2 preserves R1 filters and never requests all rows', async () => {
    const execute = vi.fn(async (request: ApiReadRequest) => ({
      data: request.body?.page === 2 ? [catalogItem('catalog-page-2', '页二样例')] : [],
      page: request.body?.page, rows: 20, total: 21,
    }))
    const catalog = createQuotationCatalogReadAdapter({ execute })
    const result = await catalog.listMaterials(query, 2)
    expect(result).toMatchObject({ state: 'succeeded', data: { page: 2, pageSize: 20, totalCount: 21 } })
    expect(result.data?.items[0]?.id).toBe('catalog-page-2')
    expect(execute).toHaveBeenCalledWith({ method: 'POST', path: 'basic/material/queryWithRank', body: {
      page: 2, rows: 20, 'is:state|integer#and': 1,
      'in:serviceType|array#and': query.serviceType, sourceType: query.sourceType,
      sortField: 'order,_id', sortOrder: 'asc',
    } })
    for (const invalidPage of [0, 51, -1, 1.5, Number.NaN]) {
      const oldCalls = execute.mock.calls.length
      const invalid = await catalog.listMaterials(query, invalidPage)
      expect(invalid.state).toBe('failed_terminal')
      expect(execute).toHaveBeenCalledTimes(oldCalls)
    }
  })

  it('S1 Q01: the real Mock adapter returns page-aware data and never calls network', async () => {
    setBusinessMockMode('data')
    const network = vi.fn()
    const catalog = mockAdapter(network)
    const ctx = { serviceType: mockQuotationCatalogServiceType, sourceType: mockQuotationCatalogSourceType }
    const first = await catalog.listPackages(ctx, 1)
    const second = await catalog.listPackages(ctx, 2)
    expect(first.data?.items).toHaveLength(2)
    expect(second).toMatchObject({ state: 'succeeded', data: { items: [], page: 2, pageSize: 20, totalCount: 2 } })
    expect(network).not.toHaveBeenCalled()
  })

})
