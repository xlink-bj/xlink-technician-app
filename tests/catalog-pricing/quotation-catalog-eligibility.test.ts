import { describe, expect, it } from 'vitest'
import type { QuotationCatalogItemRead } from '@shared/ports'
import { classifyR1CatalogEligibility, parseR1CatalogFilterCodes } from '@shared/quotation-catalog-eligibility'

const pkg: QuotationCatalogItemRead = {
  kind: 'package', id: 'synthetic-package', name: '合成套餐',
  r1RepairPartsCodes: ['roof'], r1ConstructionPartsCodes: ['site'],
}
const procedure: QuotationCatalogItemRead = {
  kind: 'procedure', id: 'synthetic-proc', name: '合成工序',
  r1RepairProcedureCodes: ['prep', 'coat'],
}
const material: QuotationCatalogItemRead = {
  kind: 'material', id: 'synthetic-material', name: '合成材料', type: 2,
}
describe('source-verified R1 catalog taxonomy classifier: pure/read-only', () => {
  it('normalizes code arrays, JSON and HTML quoted arrays', () => {
    expect(parseR1CatalogFilterCodes(['roof'], 'strict_array')).toEqual(['roof'])
    expect(parseR1CatalogFilterCodes('["roof"]', 'strict_array')).toEqual(['roof'])
    expect(parseR1CatalogFilterCodes('[&quot;roof&quot;]', 'strict_array')).toEqual(['roof'])
  })
  it('never infers missing or invalid package taxonomy from a scalar/object', () => {
    for (const input of [undefined, null, '', 'roof', '{"code":"roof"}', [{ code: 'roof' }]]) {
      expect(parseR1CatalogFilterCodes(input, 'strict_array')).toBeUndefined()
    }
    expect(parseR1CatalogFilterCodes('[]', 'strict_array')).toEqual([])
  })
  it('parses procedure scalar, scalar JSON and arrays without unsafe object coercion', () => {
    expect(parseR1CatalogFilterCodes('prep', 'procedure')).toEqual(['prep'])
    expect(parseR1CatalogFilterCodes('"prep"', 'procedure')).toEqual(['prep'])
    expect(parseR1CatalogFilterCodes('[&quot;prep&quot;,2]', 'procedure')).toEqual(['prep', '2'])
    expect(parseR1CatalogFilterCodes({ x: 1 }, 'procedure')).toBeUndefined()
  })
  it('applies the R1 11/12/40 repair-versus-construction branch', () => {
    for (const serviceType of ['11', '12', '40']) {
      expect(classifyR1CatalogEligibility({ item: pkg, serviceType, selectedCode: 'roof', verifiedOptionCodes: ['roof'] })).toBe('match')
    }
    expect(classifyR1CatalogEligibility({ item: pkg, serviceType: '21', selectedCode: 'roof', verifiedOptionCodes: ['roof'] })).toBe('not_match')
    expect(classifyR1CatalogEligibility({ item: pkg, serviceType: '21', selectedCode: 'site', verifiedOptionCodes: ['site'] })).toBe('match')
  })
  it('stays unverified if options, source metadata, selected-code provenance or context are absent', () => {
    expect(classifyR1CatalogEligibility({ item: pkg, serviceType: '11', selectedCode: 'roof' })).toBe('unverified')
    expect(classifyR1CatalogEligibility({ item: pkg, serviceType: '11', selectedCode: 'invalid', verifiedOptionCodes: ['roof'] })).toBe('unverified')
    expect(classifyR1CatalogEligibility({ item: { kind: 'package', id: 'x', name: 'x' }, serviceType: '11', selectedCode: 'roof', verifiedOptionCodes: ['roof'] })).toBe('unverified')
    expect(classifyR1CatalogEligibility({ item: pkg, serviceType: '', selectedCode: 'roof', verifiedOptionCodes: ['roof'] })).toBe('unverified')
  })
  it('isolates procedure versus material taxonomy and never guesses Material SPU/SKU', () => {
    expect(classifyR1CatalogEligibility({ item: procedure, serviceType: '11', selectedCode: 'prep', verifiedOptionCodes: ['prep'] })).toBe('match')
    expect(classifyR1CatalogEligibility({ item: procedure, serviceType: '11', selectedCode: 'x', verifiedOptionCodes: ['x'] })).toBe('not_match')
    expect(classifyR1CatalogEligibility({ item: material, serviceType: '40', selectedCode: '2', verifiedOptionCodes: ['1', '2'] })).toBe('match')
    expect(classifyR1CatalogEligibility({ item: material, serviceType: '40', selectedCode: '1', verifiedOptionCodes: ['1', '2'] })).toBe('not_match')
    expect(classifyR1CatalogEligibility({ item: material, serviceType: '40', selectedCode: '2' })).toBe('unverified')
    expect(classifyR1CatalogEligibility({ item: { kind: 'measure', id: 'm', name: 'm' }, serviceType: '11', selectedCode: 'x' })).toBe('not_applicable')
  })
  it('does not modify source read models or draft state', () => {
    const before = JSON.stringify(pkg)
    classifyR1CatalogEligibility({ item: pkg, serviceType: '11', selectedCode: 'roof', verifiedOptionCodes: ['roof'] })
    expect(JSON.stringify(pkg)).toBe(before)
  })
})
