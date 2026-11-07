import { describe, expect, it } from 'vitest'
import type { QuotationMaterialRead, QuotationProcedureRead } from '@shared/ports'
import { localCatalogDescription, localCatalogMinimumCharge, localSelectionMinimumCharge } from '@features/work-orders/quotation/local-catalog-presentation'
import { createQuotationGroup, type QuotationDraft } from '@features/work-orders/quotation/model'
import type { QuotationEngineResult } from '@features/work-orders/quotation/engine'
import { calculateQuotationPricing } from '@features/work-orders/quotation/pricing'
import { encodeR1OfficialOrderType1 } from '@features/work-orders/quotation/order-encoder'

function fixture(quantity = 18.75, minimum: number | undefined = 1500) {
  const procedure: QuotationProcedureRead = { id: 'synthetic-procedure', kind: 'procedure', name: '测试工序', unit: 'synthetic-unit',
    guideUnitPrice: 55, minimumGuideTotalPrice: minimum, description: '<p>原始工序说明</p>' }
  const material: QuotationMaterialRead = { id: 'synthetic-material', kind: 'material', name: '测试材料', price: 330,
    unit: 'synthetic-material-unit', materialUnit: 'synthetic-material-unit', specUnit: 'synthetic-spec-unit',
    description: '<p><span style="color: rgb(102, 102, 102);">材料&nbsp;说明</span></p>' }
  const selection = { selectionId: 'selection-p', kind: 'procedure' as const, catalogId: procedure.id, label: procedure.name, quantity }
  const materialSelection = { selectionId: 'selection-m', kind: 'material' as const, catalogId: material.id, label: material.name, quantity: 2 }
  const group = { ...createQuotationGroup('group', { repairParts: ['test-part'], partDescription: '测试部位', maintainAreaNum: '18.75' }),
    procedures: [selection], materials: [materialSelection] }
  const draft: QuotationDraft = { workOrderId: 'synthetic-order', workflowNodeId: 'synthetic-node', draftVersion: 1, groups: [group] }
  const hydrated = { ...draft, groups: [{ group, selections: [
    { kind: 'procedure' as const, selection, item: procedure },
    { kind: 'material' as const, selection: materialSelection, item: material },
  ] }] }
  const pricing = calculateQuotationPricing(hydrated)
  if (pricing.state !== 'succeeded') throw Error('Synthetic pricing failed')
  const encode = () => encodeR1OfficialOrderType1({ draft: hydrated, pricing: pricing.data,
    catalogContext: { serviceType: 'synthetic-service', sourceType: 'synthetic-source' } })
  const encoded = encode()
  if (encoded.state !== 'ready') throw Error('Synthetic encoding failed')
  const result: QuotationEngineResult = { state: 'ready', draftVersion: 1, validation: { state: 'ready', issues: [] },
    pricing: pricing.data, payload: encoded.payload, issues: [] }
  return { procedure, material, draft, hydrated, result, selection, encode }
}

function copy(input: ReturnType<typeof fixture>, verifiedLocalScope = true) {
  return localSelectionMinimumCharge({ ...input, verifiedLocalScope, groupId: 'group' })
}

describe('verified local-only catalog presentation', () => {
  it('renders description text without markup, attributes, scripts or styles and decodes text entities', () => {
    expect(localCatalogDescription('<p><span style="color:red" title="a>b">材料&nbsp;说明</span></p><p>第二行<br/>涂刷</p>', true)).toBe('材料 说明 第二行 涂刷')
    expect(localCatalogDescription('前<script>alert(1)</script><style>.a{color:red}</style><!-- comment -->后', true)).toBe('前后')
    expect(localCatalogDescription('&quot;A&amp;B&quot; &#x6D4B;&#35797; &lt; 3', true)).toBe('"A&B" 测试 < 3')
    expect(localCatalogDescription('2 < 3，4 > 1', true)).toBe('2 < 3，4 > 1')
    expect(localCatalogDescription(undefined, true)).toBe('')
  })
  it('does not change any description or show minimum pricing outside verified local scope', () => {
    const value = '<p>材料&nbsp;说明</p>'
    expect(localCatalogDescription(value, false)).toBe(value)
    const input = fixture()
    expect(localCatalogMinimumCharge(input.procedure, false)).toBe('')
    expect(copy(input, false)).toBe('')
  })
  it('uses the actual catalog minimum and explains an applied minimum only from matching current priced snapshot', () => {
    const input = fixture()
    expect(localCatalogMinimumCharge(input.procedure, true)).toBe('最低收费 ¥1,500.00')
    expect(copy(input)).toBe('最低收费 ¥1,500.00 · 本项按最低收费计价')
    expect(copy(fixture(30))).toBe('最低收费 ¥1,500.00')
    expect(copy(fixture(10, 500))).toBe('最低收费 ¥500.00')
    expect(localCatalogMinimumCharge(input.material, true)).toBe('')
    for (const value of [undefined, 0, -1, Infinity, NaN]) {
      expect(localCatalogMinimumCharge({ ...input.procedure, minimumGuideTotalPrice: value }, true)).toBe('')
    }
  })
  it('never guesses a minimum from totals, stale drafts or mismatched source rows', () => {
    const input = fixture()
    expect(copy({ ...input, result: { ...input.result, draftVersion: 0 } })).toBe('')
    expect(copy({ ...input, selection: { ...input.selection, quantity: 2 } })).toBe('')
    expect(copy({ ...input, result: { ...input.result, payload: undefined } })).toBe('')
    for (const patch of [{ minimumGuideTotalPrice: undefined }, { minimumGuideTotalPrice: -1 },
      { number: 9 }, { totalAmount: 999 }, { guideUnitPrice: 66 }, { _id: 'foreign' }]) {
      const payload = JSON.parse(input.result.payload!.bjProducts)
      Object.assign(payload.orderList[0].procedures.data[0], patch)
      expect(copy({ ...input, result: { ...input.result,
        payload: { ...input.result.payload!, bjProducts: JSON.stringify(payload) } } })).toBe('')
    }
  })
  it('preserves raw catalogue, draft, unit codes and encoded description/desc byte-for-byte', () => {
    const input = fixture()
    const before = JSON.stringify({ procedure: input.procedure, material: input.material, draft: input.draft, hydrated: input.hydrated })
    const wire = input.encode()
    expect(localCatalogDescription(input.material.description, true)).toBe('材料 说明')
    expect(copy(input)).toContain('本项按最低收费计价')
    expect(JSON.stringify({ procedure: input.procedure, material: input.material, draft: input.draft, hydrated: input.hydrated })).toBe(before)
    expect(input.encode()).toEqual(wire)
    const row = JSON.parse(input.result.payload!.bjProducts).orderList[0].procedures.data[0]
    expect(row).toMatchObject({ describe: '<p>原始工序说明</p>', desc: '<p>原始工序说明</p>', unit: 'synthetic-unit', minimumGuideTotalPrice: 1500 })
  })
})
