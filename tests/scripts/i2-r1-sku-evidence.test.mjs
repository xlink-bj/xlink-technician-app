import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildI2ReadPlan, buildI2CodeRequest, inspectI2Fields,
  reduceI2SkuEvidence, I2_LIMITS,
} from '../../scripts/lib/i2-r1-sku-evidence.mjs'

const spuId = 'synthetic-spu-1'
const saleFields = [
  { _id: 'hidden-source-1', name: 'thickness', valueOption: 'THICKNESS',
    colName: 'material', state: 1, frontEndConfig: '{"salesAttribute":true}', nameDisp: '厚度' },
  { _id: 'hidden-source-2', name: 'color', valueOption: 'COLOR',
    colName: 'material', state: 1, frontEndConfig: '{"salesAttribute":true}', nameDisp: '颜色' },
]
const codes = [
  { eleid: 'THICKNESS', options: { '2': '2毫米', '3': '3毫米' } },
  { eleid: 'COLOR', options: { black: '黑色', grey: '灰色' } },
]
const sku = [
  { _id: 'sensitive-sku-1', spuid: spuId, state: 1,
    price: 999.23, exts: { thickness: '2', color: 'black' } },
  { _id: 'sensitive-sku-2', spuid: spuId, state: 1,
    exts: { thickness: '3', color: 'grey' } },
]
const input = (patch = {}) => ({
  spuId, fieldsRaw: { data: saleFields, total: saleFields.length },
  codesRaw: codes, skuRaw: { data: sku, total: sku.length }, ...patch,
})

test('default evidence plan permits only two bounded paginated R1 reads', () => {
  const plan = buildI2ReadPlan(spuId)
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.steps.map(step => step.route),
    ['biz/extField/query', 'basic/material/query'])
  for (const step of plan.steps) {
    assert.equal(step.body.page, '1')
    assert.equal(Object.hasOwn(step.body, '_all'), false)
    assert.ok(Number(step.body.rows) <= I2_LIMITS.sku)
  }
  assert.equal(buildI2ReadPlan('../../basic/order/create').ok, false)
  assert.equal(buildI2ReadPlan('id,foreign').ok, false)
})

test('Code lookup is fixed to R1 tenant and the exact field identities', () => {
  const fields = inspectI2Fields({ data: saleFields, total: 2 })
  assert.equal(fields.ok, true)
  const request = buildI2CodeRequest(fields.fields)
  assert.equal(request.ok, true)
  assert.equal(request.step.route, 'i/code/selectCode.do')
  assert.equal(request.step.body.tenantId, '1340835581184723420')
  assert.deepEqual(JSON.parse(request.step.body.jsonPara), [
    { codeId: 'THICKNESS', eleid: 'THICKNESS' },
    { codeId: 'COLOR', eleid: 'COLOR' },
  ])
  assert.equal(buildI2CodeRequest([{ valueOption: '' }]).ok, false)
})

test('a complete source shape remains a non-authorizing redacted observation', () => {
  const result = reduceI2SkuEvidence(input())
  assert.equal(result.status, 'RAW_R1_SHAPE_MATCHABLE_NOT_UI_PARITY')
  assert.equal(result.rawMatchableCount, 2)
  assert.equal(result.activeSkuCount, 2)
  assert.equal(result.r1UiAndBackendEquivalence, 'NOT_VERIFIED')
  const serialized = JSON.stringify(result)
  for (const secret of ['sensitive-sku-1', '999.23', 'THICKNESS', 'thickness', 'black', '黑色', spuId]) {
    assert.equal(serialized.includes(secret), false, 'no identity/price/attribute leaks')
  }
})

test('missing SKU exts never becomes a fabricated exact match', () => {
  const result = reduceI2SkuEvidence(input({
    skuRaw: { data: [{ _id: 'no-attributes', spuid: spuId, state: 1 }], total: 1 },
  }))
  assert.equal(result.status, 'NOT_PROVEN')
  assert.equal(result.missingExtsCount, 1)
  assert.equal(result.rawMatchableCount, 0)
})

test('wrong/duplicate SKU parent identity is fail-closed', () => {
  for (const rows of [
    [{ ...sku[0], spuid: 'foreign-spu' }],
    [sku[0], sku[0]],
    [{ ...sku[0], state: 0 }],
  ]) {
    assert.equal(reduceI2SkuEvidence(input({ skuRaw: { data: rows } })).status, 'BLOCKED')
  }
})

test('foreign Code dictionaries, unknown codes and oversized pagination never qualify as proof', () => {
  const rogueCode = reduceI2SkuEvidence(input({
    codesRaw: [...codes, { eleid: 'UNKNOWN', options: {} }],
  }))
  assert.equal(rogueCode.status, 'BLOCKED')
  const unknownCode = reduceI2SkuEvidence(input({
    skuRaw: { data: [{ ...sku[0], exts: { thickness: 'unrecognized', color: 'black' } }] },
  }))
  assert.equal(unknownCode.status, 'NOT_PROVEN')
  const truncated = reduceI2SkuEvidence(input({
    fieldsRaw: { data: saleFields, total: 80 },
  }))
  assert.equal(truncated.status, 'NOT_PROVEN')
  assert.equal(truncated.pageIncomplete, true)
  const tooMany = reduceI2SkuEvidence(input({
    skuRaw: { data: Array.from({ length: 31 }, (_, i) => ({ ...sku[0], _id: String(i) })) },
  }))
  assert.equal(tooMany.status, 'BLOCKED')
})

test('non-sales fields excluded and malformed configurations rejected', () => {
  const nonSale = inspectI2Fields({ data: [
    { ...saleFields[0], frontEndConfig: '{"salesAttribute":false}' },
  ] })
  assert.equal(nonSale.ok, true)
  assert.equal(nonSale.fields.length, 0)
  const bad = inspectI2Fields({ data: [
    { ...saleFields[0], frontEndConfig: 'not JSON' },
  ] })
  assert.equal(bad.ok, false)
})
