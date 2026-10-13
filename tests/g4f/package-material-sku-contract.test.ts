import { describe, expect, it } from 'vitest'
import {
  matchR1PackageMaterialSku, projectR1PackageMaterialSku, type PackageSkuChoice,
} from '@shared/package-material-sku-contract'
import {
  syntheticPackageId, syntheticPackageMaterialLinks as links,
  syntheticPackageSkuRows as skuRows, syntheticPackageSalesFields as salesFields,
} from '@adapters/api/mock/package-material-sku'

const project = (extra: Partial<Parameters<typeof projectR1PackageMaterialSku>[0]> = {}) =>
  projectR1PackageMaterialSku({
    packageId: syntheticPackageId, pricingMethod: '1',
    materialLinks: links, salesFields, skuRows, ...extra,
  })
const selections: PackageSkuChoice[] = [
  { layer: '1', linkId: 'synthetic-link-l1-roof', attributes: { thickness: '2', color: 'grey' } },
  { layer: '2', linkId: 'synthetic-link-l2-coating', attributes: { thickness: '3', color: 'black' } },
]
describe('R1 package material SKU: layer + body link + SPU + unique SKU pure contract', () => {
  it('accepts R1 source codes as numbers or strings without inventing layer labels or pricing', () => {
    const linksWithNumericLayer = [
      { ...links[0], exts: { layer: 1 } },
      { ...links[1], exts: { layer: 1 } },
      ...links.slice(2),
    ]
    const x = project({ materialLinks: linksWithNumericLayer, pricingMethod: 1 })
    expect(x.state).toBe('ready')
    if (x.state !== 'ready') return
    expect(x.layers[0].layer).toBe('1')
    expect(x.packageId).toBe(syntheticPackageId)
    expect(project({ pricingMethod: 2 }).state).toBe('not_applicable')
  })
  it('preserves original two layers with alternative material links', () => {
    const x = project()
    expect(x.state).toBe('ready')
    if (x.state !== 'ready') return
    expect(x.layers.map(l => l.layer)).toEqual(['1', '2'])
    expect(x.layers[0].options.map(o => o.linkId)).toEqual([
      'synthetic-link-l1-roof', 'synthetic-link-l1-alternative',
    ])
    expect(x.layers[1].options[0].skuRead.state).toBe('ready')
  })
  it('requires explicit unique SKU per layer, retaining distinct link and parent ids', () => {
    const r = matchR1PackageMaterialSku(project(), selections)
    expect(r.state).toBe('ready')
    if (r.state !== 'ready') return
    expect(r.rows).toEqual([
      { layer: '1', linkId: 'synthetic-link-l1-roof',
        materialId: 'synthetic-spu-roof', skuId: 'synthetic-sku-2-grey', historicalQuantity: 3 },
      { layer: '2', linkId: 'synthetic-link-l2-coating',
        materialId: 'synthetic-spu-coating', skuId: 'synthetic-sku-coat-3-black', historicalQuantity: 1 },
    ])
  })
  it('keeps alternatives independent; switching link requires matching its own attributes', () => {
    const alt: PackageSkuChoice[] = [
      { layer: '1', linkId: 'synthetic-link-l1-alternative', attributes: { thickness: '2', color: 'grey' } },
      selections[1],
    ]
    const r = matchR1PackageMaterialSku(project(), alt)
    expect(r.state).toBe('ready')
    if (r.state !== 'ready') return
    expect(r.rows[0].skuId).toBe('synthetic-sku-alt-2-grey')
    expect(r.rows[1].skuId).toBe('synthetic-sku-coat-3-black')
  })
  it('distinguishes missing layer and unconfigured sales attributes from usable rows', () => {
    expect(matchR1PackageMaterialSku(project(), selections.slice(0, 1)).state).toBe('incomplete')
    expect(matchR1PackageMaterialSku(project(), [
      { ...selections[0], attributes: { thickness: '2' } }, selections[1],
    ]).state).toBe('incomplete')
    expect(matchR1PackageMaterialSku(project(), [
      { ...selections[0], attributes: { thickness: '2', color: 'black' } }, selections[1],
    ]).state).toBe('unavailable')
    expect(project({ materialLinks: links.slice(0, 1), skuRows: skuRows.slice(0, 2) }).state).toBe('ready')
  })
  it('rejects duplicate package body identities or mismatched materialId/SPU', () => {
    expect(project({ materialLinks: [links[0], links[0]] })).toEqual({ state: 'blocked', reason: 'duplicate_link_id' })
    expect(project({ materialLinks: [{ ...links[0], materialId: 'wrong' }] }).state).toBe('blocked')
    expect(project({ materialLinks: [{ ...links[0], exts: { layer: '' } }] }).state).toBe('blocked')
  })
  it('refuses unexpected SKU parents, duplicate SKU IDs, malformed row state', () => {
    expect(project({ skuRows: [...skuRows, { ...skuRows[0], _id: 'foreign-sku-unique-id', spuid: 'foreign' }] }))
      .toEqual({ state: 'blocked', reason: 'orphan_sku_parent' })
    expect(project({ skuRows: [...skuRows, skuRows[0]] }))
      .toEqual({ state: 'blocked', reason: 'duplicate_sku_id' })
    expect(project({ skuRows: [{ ...skuRows[0], state: 0 }, ...skuRows.slice(1)] }).state).toBe('blocked')
  })
  it('never treats non-SKU pricingMethod or missing pricing method as SKU path', () => {
    expect(project({ pricingMethod: '2' })).toEqual({ state: 'not_applicable', packageId: syntheticPackageId })
    expect(project({ pricingMethod: undefined })).toEqual({ state: 'blocked', reason: 'unsupported_pricing_method' })
    expect(matchR1PackageMaterialSku(project({ pricingMethod: '2' }), selections).state).toBe('not_applicable')
  })
  it('does not accept duplicate, unknown layer or forged body-link selections', () => {
    expect(matchR1PackageMaterialSku(project(), [selections[0], selections[0]]).state).toBe('blocked')
    expect(matchR1PackageMaterialSku(project(), [{ ...selections[0], layer: '9' }, selections[1]]).state).toBe('blocked')
    expect(matchR1PackageMaterialSku(project(), [{ ...selections[0], linkId: 'other-body' }, selections[1]]).state).toBe('blocked')
  })
  it('fails ambiguous exact matches and does not silently select first SKU', () => {
    const other = { ...skuRows[0], _id: 'second-id-identical-attrs' }
    expect(matchR1PackageMaterialSku(project({ skuRows: [...skuRows, other] }), selections).state).toBe('ambiguous')
  })
  it('is read-only, immutable and never projects price, calculated quantity or official Order', () => {
    const before = JSON.stringify({ links, skuRows, salesFields })
    const result = matchR1PackageMaterialSku(project(), selections)
    expect(JSON.stringify({ links, skuRows, salesFields })).toBe(before)
    if (result.state !== 'ready') return
    expect('price' in result.rows[0]).toBe(false)
    expect('quantity' in result.rows[0]).toBe(false)
    expect('orderId' in result.rows[0]).toBe(false)
  })
})
