import { describe, expect, it } from 'vitest'
import {
  isAllowedR1MaterialCodeOptionsRequest,
  isAllowedR1MaterialSalesFieldsRequest,
  isAllowedR1SingleSpuMaterialSkuRequest,
  r1MaterialCodeOptionsRequestBody,
  r1MaterialSalesFieldsRequestBody,
  r1MaterialSkuRequestBody,
} from '../../scripts/r1-sku-read-guard.mjs'
import {
  firstOrderMaterialSkuIdentity,
  parseCodeDictionaries,
  parseSalesFieldDefinitions,
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
      selectedOrderSkuIdentityReturned: true,
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
