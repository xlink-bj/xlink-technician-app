import { describe, expect, it } from 'vitest'
import type { QuotationCatalogItemRead } from '@shared/ports'
import { quotationCatalogSearchScopeKey } from '@features/work-orders/quotation/catalog-search'
import {
  syntheticCatalogFilterOptions,
  syntheticCatalogFilterEligibility,
  syntheticCatalogFilterSelectable,
  syntheticCatalogFilterVisible,
} from '@features/work-orders/quotation/mock-catalog-filter'

const roof: QuotationCatalogItemRead = { kind: 'package', id: 'roof', name: '合成屋面', r1RepairPartsCodes: ['synthetic-roof'] }
const wall: QuotationCatalogItemRead = { kind: 'package', id: 'wall', name: '合成外墙', r1RepairPartsCodes: ['synthetic-wall'] }
const unknown: QuotationCatalogItemRead = { kind: 'package', id: 'unknown', name: '合成未知' }
const material: QuotationCatalogItemRead = { kind: 'material', id: 'mat', name: '合成材料', type: 1 }

describe('G4-F DEV Mock-only filter, independent of backend code and current work order', () => {
  it('has explicitly synthetic, separated source dictionary options', () => {
    expect(syntheticCatalogFilterOptions('package').map((o) => o.code)).toEqual(['synthetic-roof', 'synthetic-wall'])
    expect(syntheticCatalogFilterOptions('procedure').map((o) => o.code)).toEqual(['synthetic-prep', 'synthetic-seal'])
    expect(syntheticCatalogFilterOptions('material').map((o) => o.code)).toEqual(['1', '2'])
    expect(syntheticCatalogFilterOptions('measure')).toEqual([])
  })
  it('hides known mismatches without treating missing filter metadata as safe', () => {
    expect(syntheticCatalogFilterEligibility(roof, 'synthetic-roof')).toBe('match')
    expect(syntheticCatalogFilterEligibility(wall, 'synthetic-roof')).toBe('not_match')
    expect(syntheticCatalogFilterEligibility(unknown, 'synthetic-roof')).toBe('unverified')
    expect(syntheticCatalogFilterVisible(wall, 'synthetic-roof')).toBe(false)
    expect(syntheticCatalogFilterVisible(unknown, 'synthetic-roof')).toBe(true)
    expect(syntheticCatalogFilterSelectable(unknown, 'synthetic-roof')).toBe(false)
  })
  it('keeps the original all-category browse behavior and never infers SKU', () => {
    expect(syntheticCatalogFilterSelectable(unknown, '')).toBe(true)
    expect(syntheticCatalogFilterSelectable(material, '2')).toBe(false)
    expect(syntheticCatalogFilterSelectable(material, '1')).toBe(true)
  })
  it('separates scope by actual quotation group and kind', () => {
    expect(quotationCatalogSearchScopeKey('group1', 'package')).not.toBe(quotationCatalogSearchScopeKey('group2', 'package'))
    expect(quotationCatalogSearchScopeKey('group1', 'package')).not.toBe(quotationCatalogSearchScopeKey('group1', 'material'))
  })
})
