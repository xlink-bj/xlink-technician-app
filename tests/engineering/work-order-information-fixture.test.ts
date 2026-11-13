import { describe, expect, it } from 'vitest'
import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'

const origin = 'http://127.0.0.1:5189'
const body = { colName: 'serviceAppointment', 'is:state|integer#and': '1', sortField: 'order', sortOrder: 'asc', page: '1', size: '200' }
function request(overrides: { method?: string; url?: string; body?: string | null } = {}) {
  return { method: () => overrides.method ?? 'POST', url: () => overrides.url ?? origin + '/xlink/wm/biz/extField/query',
    postData: () => overrides.body === undefined ? new URLSearchParams(body).toString() : overrides.body }
}

const changedParameters: readonly Record<string, string>[] = [
  { colName: 'contacts' }, { colName: 'order' }, { colName: 'serviceAppointment/../contacts' },
  { page: '0' }, { page: '2' }, { size: '201' }, { size: '0' },
  { _all: '1' }, { extId: 'survey-form' }, { tenantId: 'other' },
  { sortOrder: 'desc' }, { 'is:state|integer#and': '0' },
]

describe('Survey information fixture recognizes only the fixed optional read', () => {
  it('matches the exact bounded read regardless of form parameter ordering', () => {
    expect(isWorkOrderInformationRead(request(), origin)).toBe(true)
    expect(isWorkOrderInformationRead(request({ body: new URLSearchParams(Object.entries(body).reverse()).toString() }), origin)).toBe(true)
  })
  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('does not consume %s requests', method => {
    expect(isWorkOrderInformationRead(request({ method }), origin)).toBe(false)
  })
  it.each(changedParameters)('leaves changed/extra parameters for the fixture rejection (%j)', changes => {
    expect(isWorkOrderInformationRead(request({ body: new URLSearchParams({ ...body, ...changes }).toString() }), origin)).toBe(false)
  })
  it.each(['&size=200', '&size=201', '&colName=contacts', '&colName=serviceAppointment'])('rejects duplicate parameters %s', suffix => {
    expect(isWorkOrderInformationRead(request({ body: new URLSearchParams(body).toString() + suffix }), origin)).toBe(false)
  })
  it.each([
    origin + '/xlink/wm/biz/extField/upsert', origin + '/xlink/wm/biz/extField/queryById',
    origin + '/xlink/wm/biz/extField/query?_all=1', origin + '/xlink/wm/biz/extField/query#fragment',
    'https://example.invalid/xlink/wm/biz/extField/query',
  ])('leaves other paths, query strings and external origins rejected (%s)', url => {
    expect(isWorkOrderInformationRead(request({ url }), origin)).toBe(false)
  })
  it.each([null, '', JSON.stringify(body), 'colName=serviceAppointment'])('rejects missing/incomplete/non-form bodies (%s)', encoded => {
    expect(isWorkOrderInformationRead(request({ body: encoded }), origin)).toBe(false)
  })
})
