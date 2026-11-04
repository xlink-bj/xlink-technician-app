export function isAllowedR1SelectableCatalogPageRequest(input: {
  path: string
  method: string
  search: URLSearchParams
  body: unknown
  context: { workOrderId: string; serviceType: string; sourceType: string } | null
  expectedPage: number
  requestCount: number
  maxRequestCount?: number
}): boolean

export function r1BoundedSelectableCatalogPageBody(
  context: { workOrderId: string; serviceType: string; sourceType: string },
  page?: number,
): {
  page: number
  rows: 20
  'is:state|integer#and': 1
  'in:serviceType|array#and': string
  sourceType: string
  sortField: 'order,_id'
  sortOrder: 'asc'
}

export function r1BoundedSelectableSkuRequestBody(spuId: string, page?: number): {
  page: number
  rows: 30
  'is:state|integer#and': 1
  spuid: string
}

export function isAllowedR1SelectableCatalogSkuPageRequest(input: {
  path: string
  method: string
  search: URLSearchParams
  body: unknown
  selectedSpuId: string | null
  listedSpuIds: ReadonlySet<string>
  expectedPage: number
  requestCount: number
  maxRequestCount?: number
}): boolean
