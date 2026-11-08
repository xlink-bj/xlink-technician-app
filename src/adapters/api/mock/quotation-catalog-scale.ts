import { mockQuotationCatalogServiceType, mockQuotationCatalogSourceType } from './quotation-catalog'

/** DEV opt-in fixture only. Counts reflect bounded R1 observations; every ID,
 * label and price is arbitrary synthetic test data, never a Production price.
 * The caller owns the DEV/mode/opt-in fence. This module performs no I/O. */
export const mockScaleCatalogContexts = {
  standard: { serviceType: mockQuotationCatalogServiceType, sourceType: mockQuotationCatalogSourceType },
  restricted: { serviceType: 'mock-scale-restricted-service', sourceType: 'mock-scale-restricted-source' },
} as const
export const mockScaleCatalogCounts = { standard: [27, 66, 89, 4], restricted: [1, 0, 14, 0] } as const
const routes = ['biz/projPackage/queryWithRank', 'biz/procedure/queryWithRank', 'basic/material/queryWithRank', 'biz/measure/queryWithRank']
const kinds = ['package', 'procedure', 'material', 'measure'] as const
type ContextName = keyof typeof mockScaleCatalogContexts
function provider(context: ContextName, kind: typeof kinds[number], index: number) {
  const scope = mockScaleCatalogContexts[context]
  const n = index + 1
  return {
    _id: `mock-scale-${context}-${kind}-${String(n).padStart(3, '0')}`,
    name: `${{ package: '防水维修套餐', procedure: '节点密封工序', material: '防水修缮材料', measure: '施工安全措施' }[kind]} ${String(n).padStart(3, '0')}`,
    code: `SYNTHETIC-${kind.toUpperCase()}-${n}`, state: 1, order: n,
    serviceType: [scope.serviceType], sourceTypeList: [scope.sourceType],
    unit: kind === 'material' ? '件' : '项',
    ...(kind === 'package' ? { type: 'mock-package-type', agelimit: 2, price: 100 + index, minimumPrice: 150,
      exts: { repairParts: ['mock-roof'], constructionParts: ['mock-site'], pricingMethod: '0' } } : {}),
    ...(kind === 'procedure' ? { content: '合成节点密封施工', guideUnitPrice: 10 + index, minimumGuideTotalPrice: 25,
      exts: { repairProcedure: ['mock-procedure-waterproof'] } } : {}),
    ...(kind === 'material' ? { type: 1, spec: '10', specUnit: '千克', materialUnit: '件', price: 20 + index,
      servicePrice: 20 + index, exts: {} } : {}),
    ...(kind === 'measure' ? { content: '合成施工安全措施', guideUnitPrice: 5 + index, exts: {} } : {}),
  }
}
function fixture(context: ContextName) {
  const counts = mockScaleCatalogCounts[context]
  const lists = kinds.map((kind, i) => Array.from({ length: counts[i]! }, (_, index) => provider(context, kind, index)))
  // Package-only SPUs are separate from direct material rows: 93 / 15 total.
  const extraMaterials = Array.from({ length: context === 'standard' ? 4 : 1 }, (_, i) => provider(context, 'material', counts[2] + i))
  const details = new Map(lists[0]!.map((item, index) => {
    const component = (kind: 'procedure' | 'material' | 'measure', value: ReturnType<typeof provider>, i: number) => ({
      _id: `${item._id}-${kind}-body-${i + 1}`, [`${kind}Id`]: value._id, [kind]: value,
      coefficient: i + 1, coefficientUnit: value.unit, number: String(i + 1), unit: value.unit, order: i + 1,
    })
    const materials = context === 'standard'
      ? [lists[2]![index % counts[2]]!, extraMaterials[index % 4]!, lists[2]![(index + 1) % counts[2]]!]
      : extraMaterials
    return [item._id, { success: true, entity: {
      ...item,
      procedureList: [component('procedure', lists[1]![index % counts[1]] ?? provider(context, 'procedure', 0), 0)],
      materialList: materials.map((value, i) => ({ ...component('material', value, i),
        exts: { layer: i < 2 ? (i === 0 ? 1 : '01') : 2, price: [5, 12, 3][i] },
      })),
      measureList: context === 'standard' ? [component('measure', lists[3]![index % counts[3]]!, 0)] : [],
    } }] as const
  }))
  return { lists, details, spuIds: new Set([...lists[2]!, ...extraMaterials].map(row => row._id)) }
}
const fixtures = { standard: fixture('standard'), restricted: fixture('restricted') }
function only(data: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(data).every(key => allowed.includes(key))
}

/** undefined means not handled; null means rejected and MUST NOT fall back. */
export function mockScaleCatalogRead(route: string, requestData: Record<string, unknown>): unknown {
  const index = routes.indexOf(route)
  if (index >= 0) {
    const context = (Object.keys(mockScaleCatalogContexts) as ContextName[]).find(key => {
      const scope = mockScaleCatalogContexts[key]
      return requestData['in:serviceType|array#and'] === scope.serviceType && requestData.sourceType === scope.sourceType
    })
    const page = requestData.page
    if (!context || !only(requestData, ['page', 'rows', 'is:state|integer#and', 'in:serviceType|array#and', 'sourceType', 'sortField', 'sortOrder'])
      || typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 50
      || requestData.rows !== 20 || requestData['is:state|integer#and'] !== 1
      || requestData.sortField !== 'order,_id' || requestData.sortOrder !== 'asc') return null
    const list = fixtures[context].lists[index]!
    return { data: structuredClone(list.slice((page - 1) * 20, page * 20)), page, rows: 20, total: list.length }
  }
  const prefix = 'biz/projPackage/findById/'
  if (route.startsWith(prefix)) {
    let id: string
    try { id = decodeURIComponent(route.slice(prefix.length)) } catch { return null }
    if (!id.startsWith('mock-scale-')) return undefined
    if (Object.keys(requestData).length) return null
    const detail = fixtures.standard.details.get(id) ?? fixtures.restricted.details.get(id)
    return detail ? structuredClone(detail) : null
  }
  if (route === 'basic/material/query') {
    const direct = requestData.spuid
    const batch = requestData['in:spuid|array#and']
    const raw = direct ?? batch
    if (typeof raw !== 'string' || !raw.includes('mock-scale-')) return undefined
    const ids = raw.split(',')
    if (!only(requestData, ['spuid', 'in:spuid|array#and', '_all', 'is:state|integer#and'])
      || requestData._all !== '1' || requestData['is:state|integer#and'] !== 1
      || (direct !== undefined && batch !== undefined) || (direct !== undefined && ids.length !== 1)
      || ids.length > 30 || new Set(ids).size !== ids.length
      || !Object.values(fixtures).some(value => ids.every(id => value.spuIds.has(id)))) return null
    return { data: [], page: 1, rows: 20, total: 0 }
  }
  return undefined
}
