import { describe, expect, it } from 'vitest'
import type { QuotationPackageDetailRead, QuotationPackageMaterialRead } from '@shared/ports'
import {
  configuredQuotationPackageCandidateFor,
  quotationPackageLayerKey,
  quotationPackageMaterialChoiceFor,
  quotationPackageMaterialMatchesChoice,
} from '@features/work-orders/quotation/package-configuration'
import { quotationPackageMaterialLayersFor } from '@features/work-orders/quotation/catalog-browser-store'
import { createQuotationGroup } from '@features/work-orders/quotation/model'

const packageRow = { kind: 'package' as const, id: 'r1-package-01', name: 'R1 reference package' }
const material = (layer: string | number, id: string): QuotationPackageMaterialRead => ({
  kind: 'material',
  id: 'body-' + id,
  referenceId: 'mat-' + id,
  layer,
  item: { kind: 'material', id: 'mat-' + id, name: '材料 ' + id },
})
const detail = (rows: QuotationPackageMaterialRead[]): QuotationPackageDetailRead => ({
  package: packageRow,
  procedures: [], measures: [], materials: rows,
})

describe('M1 R1 Package choice UI parity: numeric layer identity, raw value preservation', () => {
  it('coalesces 1, "1", "01", zero and "0" per R1 Number(exts.layer)', () => {
    expect(quotationPackageLayerKey(1)).toBe('number:1')
    expect(quotationPackageLayerKey('1')).toBe('number:1')
    expect(quotationPackageLayerKey('01')).toBe('number:1')
    expect(quotationPackageLayerKey(0)).toBe('number:0')
    expect(quotationPackageLayerKey('0')).toBe('number:0')
    expect(quotationPackageLayerKey(undefined)).toBe('missing-layer')
    // The old DEV fixture labels are not asserted to be valid numeric R1 layers.
    expect(quotationPackageLayerKey('mock-layer-1')).toBe('string:mock-layer-1')
  })

  it('one choice covers alternative material bodies that differ only in layer JSON type', () => {
    const list = [material(1, 'a'), material('01', 'b'), material('2', 'c')]
    const layers = quotationPackageMaterialLayersFor(list)
    expect(layers.map(group => group.key)).toEqual(['number:1', 'number:2'])
    expect(layers[0].materials.map(row => row.referenceId)).toEqual(['mat-a', 'mat-b'])

    const choice = quotationPackageMaterialChoiceFor(list[1])!
    expect(choice.layer).toBe('01')
    expect(quotationPackageMaterialMatchesChoice(list[1], choice)).toBe(true)
    expect(quotationPackageMaterialMatchesChoice(list[0], choice)).toBe(false)
    const result = configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-1', { repairParts: ['roof'], maintainAreaNum: '12' }),
      packageRow, detail(list),
      [choice, quotationPackageMaterialChoiceFor(list[2])!],
    )
    expect(result).toMatchObject({
      state: 'succeeded',
      data: {
        quantity: 12,
        configuration: { materials: [
          { catalogId: 'mat-b', providerComponentId: 'body-b', layer: '01' },
          { catalogId: 'mat-c', providerComponentId: 'body-c', layer: '2' },
        ] },
      },
    })
    const payload = JSON.stringify(result)
    expect(payload).not.toContain('price')
    expect(payload).not.toContain('skuCode')
  })

  it('rejects duplicate selections for the same R1 numeric layer and does not auto-pick materials', () => {
    const list = [material('1', 'a'), material(1, 'b')]
    const group = createQuotationGroup('group-1', { repairParts: ['roof'] })
    const both = list.map(row => quotationPackageMaterialChoiceFor(row)!)
    expect(configuredQuotationPackageCandidateFor(group, packageRow, detail(list), both).state).toBe('failed_terminal')
    expect(configuredQuotationPackageCandidateFor(group, packageRow, detail(list), []).state).toBe('failed_terminal')
    const one = configuredQuotationPackageCandidateFor(group, packageRow, detail(list), [both[1]])
    expect(one).toMatchObject({
      state: 'succeeded',
      data: { configuration: { materials: [{ catalogId: 'mat-b', layer: 1 }] } },
    })
  })

  it('does not let unknown body identity cross a numerically matching layer', () => {
    const list = [material(1, 'a'), material('1', 'b')]
    const invalid = {
      layer: '01',
      componentId: 'body-foreign',
      referenceId: 'mat-foreign',
    }
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-1', { repairParts: ['roof'] }),
      packageRow, detail(list), [invalid],
    ).state).toBe('failed_terminal')
  })

  it('does not mistake a missing or malformed source layer for numeric zero', () => {
    const rows = [material('0', 'a'), { ...material(1, 'b'), layer: undefined }]
    const groups = quotationPackageMaterialLayersFor(rows)
    expect(groups.map(g => g.key)).toEqual(['number:0', 'missing-layer'])
    expect(quotationPackageMaterialChoiceFor(rows[1])).toBeNull()
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-1', { repairParts: ['roof'] }),
      packageRow, detail(rows), [quotationPackageMaterialChoiceFor(rows[0])!],
    ).state).toBe('failed_terminal')
  })
})
