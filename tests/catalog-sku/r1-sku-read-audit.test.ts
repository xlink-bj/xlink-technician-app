import { describe, expect, it } from 'vitest'
import {
  isAllowedR1ListedOrderDetailRead,
  isAllowedR1MaterialCodeOptionsRequest,
  isAllowedR1MaterialSalesFieldsRequest,
  isAllowedR1OrderDerivedSpuMaterialSkuRequest,
  isAllowedR1SingleSpuMaterialSkuRequest,
  r1MaterialCodeOptionsRequestBody,
  r1MaterialSalesFieldsRequestBody,
  r1MaterialSkuRequestBody,
} from '../../scripts/r1-sku-read-guard.mjs'
import {
  firstOrderMaterialSkuIdentity,
  firstOrderMaterialSpuIdentity,
  inspectActiveSkuCatalogPage,
  orderDetailMaterialSkuIdentities,
  orderMaterialSpuIdentities,
  parseCodeDictionaries,
  parseSalesFieldDefinitions,
  summarizeOrderMaterialIdentities,
  summarizeSkuRead,
} from '../../scripts/r1-sku-read-evidence.mjs'

const search = new URLSearchParams()
const syntheticSpuId = 'synthetic-spu-a'
const syntheticSkuId = 'synthetic-sku-a'
const extFieldRows = [
  { colName: 'material', state: 1, name: 'finish', nameDisp: 'Synthetic finish', valueOption: 'synthetic-finish-codes', frontEndConfig: '{"salesAttribute":true}' },
  { colName: 'material', state: 1, name: 'internalNote', valueOption: 'synthetic-internal-codes', frontEndConfig: '{"salesAttribute":false}' },
]

describe('bounded R1 SKU read route guard', () => {
  it('allows bounded SKU catalog reads only for unique SPUs derived from scoped Order lines', () => {
    const orderDerivedSpuIds = new Set([syntheticSpuId])
    const lookedUpSpuIds = new Set<string>()
    const request = {
      path: 'basic/material/query', method: 'POST', search,
      body: r1MaterialSkuRequestBody(syntheticSpuId), requestCount: 0,
      maxRequestCount: 100, selectedSpuId: syntheticSpuId,
      orderDerivedSpuIds, lookedUpSpuIds,
    }
    expect(isAllowedR1OrderDerivedSpuMaterialSkuRequest(request)).toBe(true)
    for (const candidate of [
      { ...request, body: r1MaterialSkuRequestBody('synthetic-foreign-spu') },
      { ...request, selectedSpuId: 'synthetic-foreign-spu' },
      { ...request, requestCount: 100 },
      { ...request, lookedUpSpuIds: new Set([syntheticSpuId]) },
      { ...request, search: new URLSearchParams('include=all') },
      { ...request, body: { ...r1MaterialSkuRequestBody(syntheticSpuId), _all: '1' } },
    ]) expect(isAllowedR1OrderDerivedSpuMaterialSkuRequest(candidate)).toBe(false)
  })

  it('allows exact detail reads only for a type=1 Order ID proven by the current listed WorkOrder query', () => {
    const orderWorkOrderById = new Map([['synthetic-order', 'synthetic-work-order']])
    const lookedUpOrderIds = new Set<string>()
    const request = {
      path: 'basic/order/queryById', method: 'POST', search,
      body: { id: 'synthetic-order' }, requestCount: 0,
      selectedOrderId: 'synthetic-order', selectedWorkOrderId: 'synthetic-work-order',
      orderWorkOrderById, lookedUpOrderIds,
      workOrderDetailReadCount: 0, maxPerWorkOrder: 3,
    }
    expect(isAllowedR1ListedOrderDetailRead(request)).toBe(true)
    for (const candidate of [
      { ...request, path: 'basic/order/query' },
      { ...request, body: { id: 'synthetic-foreign-order' } },
      { ...request, selectedWorkOrderId: 'synthetic-other-work-order' },
      { ...request, search: new URLSearchParams('include=all') },
      { ...request, body: { id: 'synthetic-order', _all: '1' } },
      { ...request, workOrderDetailReadCount: 3 },
      { ...request, requestCount: 100 },
      { ...request, orderWorkOrderById: new Map() },
    ]) expect(isAllowedR1ListedOrderDetailRead(candidate)).toBe(false)
    expect(isAllowedR1ListedOrderDetailRead({
      ...request, lookedUpOrderIds: new Set(['synthetic-order']),
    })).toBe(false)
  })

  it('accepts only one bounded material sales ExtField page with the exact R1 filters', () => {
    const body = r1MaterialSalesFieldsRequestBody()
    expect(body).toEqual({
      page: 1, rows: 50, sortField: 'order', sortOrder: 'asc', colName: 'material',
      'is:state|integer#and': 1,
    })
    expect(isAllowedR1MaterialSalesFieldsRequest({
      path: 'biz/extField/query', method: 'POST', search, body, requestCount: 0,
    })).toBe(true)
    for (const candidate of [
      { ...body, _all: '1' },
      { ...body, page: 2 },
      { ...body, rows: 500 },
      { ...body, sourceType: 'synthetic-unapproved-filter' },
    ]) {
      expect(isAllowedR1MaterialSalesFieldsRequest({
        path: 'biz/extField/query', method: 'POST', search, body: candidate, requestCount: 0,
      })).toBe(false)
    }
    expect(isAllowedR1MaterialSalesFieldsRequest({
      path: 'biz/extField/query', method: 'POST', search, body, requestCount: 1,
    })).toBe(false)
  })

  it('accepts only the exact R1 tenant Code dictionary request for returned sales field IDs', () => {
    const body = r1MaterialCodeOptionsRequestBody(['synthetic-finish-codes'])
    expect(isAllowedR1MaterialCodeOptionsRequest({
      path: 'i/code/selectCode.do', method: 'POST', search, body, requestCount: 0,
      expectedValueOptionIds: ['synthetic-finish-codes'],
    })).toBe(true)
    expect(isAllowedR1MaterialCodeOptionsRequest({
      path: 'i/code/selectCode.do', method: 'POST', search,
      body: { ...body, tenantId: 'synthetic-other-tenant' }, requestCount: 0,
      expectedValueOptionIds: ['synthetic-finish-codes'],
    })).toBe(false)
    expect(isAllowedR1MaterialCodeOptionsRequest({
      path: 'i/code/selectCode.do', method: 'POST', search,
      body: r1MaterialCodeOptionsRequestBody(['synthetic-unlisted-codes']), requestCount: 0,
      expectedValueOptionIds: ['synthetic-finish-codes'],
    })).toBe(false)
    expect(isAllowedR1MaterialCodeOptionsRequest({
      path: 'i/code/selectCode.do', method: 'POST', search, body, requestCount: 1,
      expectedValueOptionIds: ['synthetic-finish-codes'],
    })).toBe(false)
  })

  it('accepts only one bounded active SKU page for the SPU found in a current role-visible Order', () => {
    const body = r1MaterialSkuRequestBody(syntheticSpuId)
    expect(body).toEqual({ page: 1, rows: 30, 'is:state|integer#and': 1, spuid: syntheticSpuId })
    expect(isAllowedR1SingleSpuMaterialSkuRequest({
      path: 'basic/material/query', method: 'POST', search, body, requestCount: 0, selectedSpuId: syntheticSpuId,
    })).toBe(true)
    for (const candidate of [
      { ...body, _all: '1' },
      { ...body, sourceType: 'synthetic-unapproved-filter' },
      { ...body, spuid: 'synthetic-other-spu' },
      { ...body, rows: 300 },
    ]) {
      expect(isAllowedR1SingleSpuMaterialSkuRequest({
        path: 'basic/material/query', method: 'POST', search, body: candidate,
        requestCount: 0, selectedSpuId: syntheticSpuId,
      })).toBe(false)
    }
    expect(isAllowedR1SingleSpuMaterialSkuRequest({
      path: 'basic/material/query', method: 'POST', search, body, requestCount: 1, selectedSpuId: syntheticSpuId,
    })).toBe(false)
  })
})

describe('R1 SKU and sales attribute redacted evidence projection', () => {
  it('extracts exact direct SKU rows and R1 package SKU identities from a verified Order detail', () => {
    const detail = orderDetailMaterialSkuIdentities({ data: {
      _id: 'synthetic-order', id: 'synthetic-order', type: 1,
      serviceAppointmentId: 'synthetic-work-order',
      bjProducts: JSON.stringify({ orderList: [{
        materials: { data: [
          { _id: syntheticSkuId, spuid: syntheticSpuId, number: 2, price: 9876 },
          { _id: 'synthetic-ambiguous-row-id' },
          { skuId: 'synthetic-explicit-sku-only' },
          { spuid: 'synthetic-spu-only' },
          {},
        ] },
        projPackages: { data: [{ materialList: [
          { materialId: 'synthetic-package-spu', material: { _id: 'synthetic-package-spu', exts: { skuCode: 'SYNTHETIC-CODE' } }, skus: [
            { _id: 'synthetic-package-saved-sku', spuid: 'synthetic-package-spu', number: 2 },
            { _id: 'synthetic-zero-sku', spuid: 'synthetic-package-spu', number: 0 },
          ] },
          { materialId: 'synthetic-package-spu-without-sku', material: { _id: 'synthetic-package-spu-without-sku' } },
        ] }] },
      }] }),
    } }, 'synthetic-order', 'synthetic-work-order')
    expect(detail.verified).toBe(true)
    if (!detail.verified) throw new Error('expected verified synthetic R1 Order detail')
    expect(detail.identities).toEqual([
      { orderId: 'synthetic-order', skuId: syntheticSkuId, spuId: syntheticSpuId, source: 'direct_order_material_row' },
      { orderId: 'synthetic-order', spuId: 'synthetic-ambiguous-row-id', source: 'direct_order_material_row' },
      { orderId: 'synthetic-order', skuId: 'synthetic-explicit-sku-only', source: 'direct_order_material_row' },
      { orderId: 'synthetic-order', spuId: 'synthetic-spu-only', source: 'direct_order_material_row' },
      { orderId: 'synthetic-order', skuId: 'synthetic-package-saved-sku', spuId: 'synthetic-package-spu', source: 'package_saved_sku_row' },
      { orderId: 'synthetic-order', spuId: 'synthetic-package-spu', source: 'package_material_spu' },
      { orderId: 'synthetic-order', spuId: 'synthetic-package-spu-without-sku', source: 'package_material_spu' },
    ])
    expect(detail.summary).toMatchObject({
      verifiedOrderDetails: 1,
      materialLines: 5,
      materialLinesWithSkuId: 2,
      materialLinesWithSpuId: 3,
      materialLinesWithBothSkuAndSpuIds: 1,
      materialLinesWithSkuIdOnly: 1,
      materialLinesWithSpuIdOnly: 2,
      materialLinesWithNeitherId: 1,
      packageMaterialLines: 2,
      packageSavedSkuRows: 1,
      packageSavedSkuRowsWithBothIds: 1,
      packageMaterialLinesWithSpuId: 2,
      directMaterialRowsWithTopLevelId: 2,
      directMaterialRowsWithSkuIdField: 1,
      directMaterialRowsWithSpuField: 2,
      directMaterialRowsWithMaterialIdField: 0,
      directMaterialRowsWithNestedMaterial: 0,
      directMaterialRowsWithNestedMaterialId: 0,
      directMaterialRowsWithNestedMaterialSpu: 0,
      directMaterialRowsWithSkuCode: 0,
      directMaterialRowsWithNestedSkuCode: 0,
      packageMaterialRowsWithTopLevelId: 0,
      packageMaterialRowsWithMaterialId: 2,
      packageMaterialRowsWithNestedMaterialId: 2,
      packageMaterialRowsWithNestedMaterialSpu: 0,
      packageMaterialRowsWithSkuArray: 1,
      packageMaterialRowsWithNestedSkuArray: 0,
      packageMaterialRowsWithSkuCode: 0,
      packageMaterialRowsWithNestedSkuCode: 1,
    })
    for (const privateValue of [
      'synthetic-order', 'synthetic-work-order', syntheticSkuId, syntheticSpuId,
      'synthetic-ambiguous-row-id', 'synthetic-explicit-sku-only', 'synthetic-spu-only', '9876',
      'synthetic-package-spu', 'synthetic-package-saved-sku', 'synthetic-package-spu-without-sku',
      'synthetic-zero-sku', 'SYNTHETIC-CODE',
    ]) expect(JSON.stringify(detail.summary)).not.toContain(privateValue)
  })

  it('rejects Order detail identity, WorkOrder ownership, type, and alias conflicts', () => {
    const base = {
      _id: 'synthetic-order', id: 'synthetic-order', type: 1,
      serviceAppointmentId: 'synthetic-work-order',
      bjProducts: { orderList: [{ materials: { data: [{ _id: syntheticSkuId, spuid: syntheticSpuId }] } }] },
    }
    expect(orderDetailMaterialSkuIdentities(base, 'synthetic-foreign-order', 'synthetic-work-order'))
      .toMatchObject({ verified: false, reason: 'order_detail_identity_or_ownership_mismatch' })
    expect(orderDetailMaterialSkuIdentities(base, 'synthetic-order', 'synthetic-foreign-work-order'))
      .toMatchObject({ verified: false, reason: 'order_detail_identity_or_ownership_mismatch' })
    expect(orderDetailMaterialSkuIdentities({ ...base, type: 0 }, 'synthetic-order', 'synthetic-work-order'))
      .toMatchObject({ verified: false, reason: 'order_detail_identity_or_ownership_mismatch' })
    expect(orderDetailMaterialSkuIdentities({ ...base, id: 'synthetic-other-order' }, 'synthetic-order', 'synthetic-work-order'))
      .toMatchObject({ verified: false, reason: 'order_detail_identity_or_ownership_mismatch' })
    expect(orderDetailMaterialSkuIdentities({ ...base, bjProducts: { orderList: [{ materials: null }] } }, 'synthetic-order', 'synthetic-work-order'))
      .toMatchObject({ verified: false, reason: 'order_detail_material_rows_invalid' })
  })

  it('selects only material SKU/SPU identity from an already validated scoped type=1 Order projection', () => {
    const candidate = firstOrderMaterialSkuIdentity([{
      id: 'synthetic-order',
      groups: [{ lines: [
        { kind: 'package', identity: { skuId: 'synthetic-package-sku', spuId: 'synthetic-package-spu' } },
        { kind: 'material', identity: { spuId: 'synthetic-spu-parent-only' } },
        { kind: 'material', identity: { skuId: syntheticSkuId, spuId: syntheticSpuId }, unitPrice: 11 },
      ] }],
    }])
    expect(candidate).toEqual({
      orderId: 'synthetic-order', skuId: syntheticSkuId, spuId: syntheticSpuId, unitPrice: 11,
    })
    expect(firstOrderMaterialSkuIdentity([{
      id: 'synthetic-order-without-material-sku',
      groups: [{ lines: [{ kind: 'package', identity: { skuId: 'synthetic-package-sku', spuId: 'synthetic-package-spu' } }] }],
    }])).toBeUndefined()
  })

  it('can select the exact Order SPU for a bounded catalog read without requiring a SKU ID', () => {
    const order = {
      id: 'synthetic-order',
      groups: [{ lines: [
        { kind: 'package', identity: { spuId: 'synthetic-package-spu' }, children: [] },
        { kind: 'material', identity: { spuId: syntheticSpuId, skuCode: 'SYNTHETIC-SKU-CODE' }, children: [] },
        { kind: 'material', identity: { spuId: 'synthetic-second-spu' }, children: [] },
      ] }],
    }
    expect(firstOrderMaterialSpuIdentity([order])).toEqual({
      orderId: 'synthetic-order', spuId: syntheticSpuId, skuCode: 'SYNTHETIC-SKU-CODE', unitPrice: undefined,
    })
    expect(orderMaterialSpuIdentities([order]).map(({ spuId, skuId, skuCode }) => ({ spuId, skuId, skuCode })))
      .toEqual([
        { spuId: syntheticSpuId, skuId: undefined, skuCode: 'SYNTHETIC-SKU-CODE' },
        { spuId: 'synthetic-second-spu', skuId: undefined, skuCode: undefined },
      ])
    expect(firstOrderMaterialSpuIdentity([{
      id: 'synthetic-order-without-spu', groups: [{ lines: [
        { kind: 'material', identity: { skuId: syntheticSkuId }, children: [] },
      ] }],
    }])).toBeUndefined()
  })

  it('counts Order, SKU and SPU availability independently without retaining business identities', () => {
    const summary = summarizeOrderMaterialIdentities([{
      id: 'synthetic-order', type: 1, groups: [{ lines: [
        { kind: 'material', identity: { skuId: 'synthetic-sku-only' }, children: [] },
        { kind: 'material', identity: { spuId: 'synthetic-spu-only', skuCode: 'SKU-CODE' }, children: [] },
        { kind: 'material', identity: { skuId: syntheticSkuId, spuId: syntheticSpuId, spuCode: 'SPU-CODE' }, children: [] },
        { kind: 'material', identity: {}, children: [] },
        { kind: 'package', identity: {}, children: [
          { kind: 'material', identity: { spuId: 'synthetic-nested-spu' }, children: [] },
        ] },
      ] }],
    }])
    expect(summary).toEqual({
      verified: true,
      typeOneOrderRowsReturned: 1,
      orderRowsWithMaterialLines: 1,
      materialLines: 5,
      materialLinesWithSkuId: 2,
      materialLinesWithSpuId: 3,
      materialLinesWithBothSkuAndSpuId: 1,
      materialLinesWithSkuIdOnly: 1,
      materialLinesWithSpuIdOnly: 2,
      materialLinesWithNeitherSkuNorSpuId: 1,
      materialLinesWithSkuCode: 1,
      materialLinesWithSpuCode: 1,
    })
    const redacted = JSON.stringify(summary)
    for (const privateValue of [
      'synthetic-order', 'synthetic-sku-only', 'synthetic-spu-only', syntheticSkuId, syntheticSpuId,
      'synthetic-nested-spu', 'SKU-CODE', 'SPU-CODE',
    ]) expect(redacted).not.toContain(privateValue)
  })

  it('requires a complete sales-field page and exact Code options before SKU attribute matching', () => {
    expect(parseSalesFieldDefinitions({ data: extFieldRows, totalCount: 2 })).toEqual({
      complete: true,
      fields: [{ name: 'finish', valueOption: 'synthetic-finish-codes' }],
      valueOptionIds: ['synthetic-finish-codes'],
    })
    expect(parseSalesFieldDefinitions({ data: extFieldRows })).toEqual({
      complete: false, reason: 'sales_field_page_not_complete',
    })
    const fields = [{ name: 'finish', valueOption: 'synthetic-finish-codes' }]
    expect(parseCodeDictionaries([{ eleid: 'synthetic-finish-codes', options: { matte: 'Matte' } }], fields))
      .toMatchObject({ complete: true })
    expect(parseCodeDictionaries([], fields)).toEqual({
      complete: false, reason: 'code_dictionary_shape_invalid',
    })
  })

  it('correlates exact Order SKU identity, raw R1 attributes and Code values without exposing data', () => {
    const fields = [{ name: 'finish', valueOption: 'synthetic-finish-codes' }]
    const dictionaries = new Map([['synthetic-finish-codes', new Map([['matte', true]])]])
    const rawSku = {
      _id: syntheticSkuId, spuid: syntheticSpuId, state: 1, price: 23,
      exts: { finish: 'matte', commonName: 'Synthetic material' },
    }
    const result = summarizeSkuRead(
      { data: [rawSku], totalCount: 1 }, fields, dictionaries,
      { skuId: syntheticSkuId, spuId: syntheticSpuId, unitPrice: 21 },
    )
    expect(result).toMatchObject({
      verified: true,
      pageComplete: true,
      selectedSkuIdentityReturned: true,
      selectedSkuHasPrice: true,
      selectedSkuHasEverySalesAttribute: true,
      selectedSkuAttributesMatchCodeOptions: true,
      rawR1AttributeCombinationMatches: 1,
      rawR1AttributeCombinationStatus: 'EXACT_SINGLE_MATCH',
      pinnedR1ProjectionSimulation: 'NO_MATCH_AFTER_PINNED_R1_GETMATERIALSKU_PROJECTION',
      capturedOrderVsCurrentCatalogSkuUnitPrice: 'DIFFERS_FROM_CAPTURED_ORDER_UNIT_PRICE',
      priceMeaning: 'CATALOG_SKU_UNIT_INPUT_NOT_FINAL_QUOTE_AMOUNT',
    })
    const report = JSON.stringify(result)
    for (const privateValue of [syntheticSkuId, syntheticSpuId, 'matte', 'Synthetic material', '23', '21', 'finish']) {
      expect(report).not.toContain(privateValue)
    }
  })

  it('does not infer uniqueness from a truncated SKU page or a missing sales attribute', () => {
    const fields = [{ name: 'finish', valueOption: 'synthetic-finish-codes' }]
    const dictionaries = new Map([['synthetic-finish-codes', new Map([['matte', true]])]])
    const rawSku = { _id: syntheticSkuId, spuid: syntheticSpuId, state: 1, exts: { finish: 'matte' } }
    const truncated = summarizeSkuRead(
      { data: [rawSku], totalCount: 2 }, fields, dictionaries,
      { skuId: syntheticSkuId, spuId: syntheticSpuId },
    )
    expect(truncated).toMatchObject({ pageComplete: false, rawR1AttributeCombinationStatus: 'BOUNDED_UNVERIFIED' })
    const missing = summarizeSkuRead(
      { data: [{ ...rawSku, exts: {} }], totalCount: 1 }, fields, dictionaries,
      { skuId: syntheticSkuId, spuId: syntheticSpuId },
    )
    expect(missing).toMatchObject({
      selectedSkuHasEverySalesAttribute: false,
      selectedSkuAttributesMatchCodeOptions: false,
      rawR1AttributeCombinationStatus: 'UNKNOWN_INCOMPLETE_EVIDENCE',
    })
    const noSkuId = summarizeSkuRead(
      { data: [{ ...rawSku, _id: 'catalog-row-with-spu-only-target', exts: { finish: 'matte' } }], totalCount: 1 },
      fields, dictionaries, { spuId: syntheticSpuId },
    )
    expect(noSkuId).toMatchObject({
      verified: true,
      pageComplete: true,
      selectedSkuIdentityReturned: false,
      selectedSkuHasEverySalesAttribute: false,
      rawR1AttributeCombinationStatus: 'UNKNOWN_INCOMPLETE_EVIDENCE',
    })
  })

  it('validates SKU rows against only the exact order-derived SPU and hides IDs from summaries', () => {
    const page = inspectActiveSkuCatalogPage({
      data: [{ _id: syntheticSkuId, spuid: syntheticSpuId, state: 1 }], totalCount: 1,
    }, syntheticSpuId)
    expect(page).toMatchObject({
      verified: true,
      skuIds: [syntheticSkuId],
      summary: { activeSkuRowsReturned: 1, totalSkuRows: 1, pageComplete: true },
    })
    if (!page.verified) throw new Error('expected a verified synthetic SKU page')
    for (const privateValue of [syntheticSkuId, syntheticSpuId]) {
      expect(JSON.stringify(page.summary)).not.toContain(privateValue)
    }
    expect(inspectActiveSkuCatalogPage({
      data: [{ _id: syntheticSkuId, spuid: 'synthetic-foreign-spu', state: 1 }], totalCount: 1,
    }, syntheticSpuId)).toMatchObject({ verified: false, reason: 'sku_identity_or_state_invalid' })
  })

  it('fails closed on foreign parents, inactive rows, duplicate SKU IDs and attribute collisions', () => {
    const fields = [{ name: 'finish', valueOption: 'synthetic-finish-codes' }]
    const dictionaries = new Map([['synthetic-finish-codes', new Map([['matte', true]])]])
    const base = { _id: syntheticSkuId, spuid: syntheticSpuId, state: 1, exts: { finish: 'matte' } }
    for (const rows of [
      [{ ...base, spuid: 'synthetic-foreign-spu' }],
      [{ ...base, state: 0 }],
      [base, base],
    ]) {
      expect(summarizeSkuRead(
        { data: rows, totalCount: rows.length }, fields, dictionaries,
        { skuId: syntheticSkuId, spuId: syntheticSpuId },
      )).toMatchObject({ verified: false, reason: 'sku_identity_or_state_invalid' })
    }
    const ambiguous = summarizeSkuRead(
      { data: [base, { ...base, _id: 'synthetic-sku-b' }], totalCount: 2 }, fields, dictionaries,
      { skuId: syntheticSkuId, spuId: syntheticSpuId },
    )
    expect(ambiguous).toMatchObject({
      rawR1AttributeCombinationMatches: 2,
      rawR1AttributeCombinationStatus: 'AMBIGUOUS_MULTIPLE_MATCHES',
    })
  })
})
