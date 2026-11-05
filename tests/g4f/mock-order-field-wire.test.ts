import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockOrderFieldsRead } from '../../src/adapters/api/mock/order-fields'
import { dynamicCodeOptions, cascadeCodeOptions } from '../../src/adapters/api/read-models/code-options'
afterEach(() => vi.unstubAllEnvs())
describe('R1-shaped Mock quotation field providers', () => {
  it('uses existing R1 Code and multistage response envelopes', () => {
    vi.stubEnv('VITE_XLINK_ORDER_FIELDS_QA', 'true')
    const code = mockOrderFieldsRead('i/code/selectCode.do', { jsonPara: JSON.stringify([{ codeId: 'mock-order-mode-code', eleid: 'mock-order-mode-code' }]) })
    expect(dynamicCodeOptions(code, 'mock-order-mode-code').items).toEqual([{ value: 'yes', label: '是' }, { value: 'no', label: '否' }])
    const cascade = mockOrderFieldsRead('i/code/selectMultistageCode.do', { types: 'mock-order-region-code' })
    expect(cascadeCodeOptions(cascade, 'mock-order-region-code').items[0]?.children?.[0]?.value).toBe('mock-site')
  })
  it('does not handle expanded schema requests or activate without the fixture gate', () => {
    const body = { colName: 'order', 'is:state|integer#and': '1', 'in:showList|string#and': '4', page: 1, size: 50, sortField: 'order', sortOrder: 'asc' }
    vi.stubEnv('VITE_XLINK_ORDER_FIELDS_QA', 'false')
    expect(mockOrderFieldsRead('biz/extField/query', body)).toBeUndefined()
    vi.stubEnv('VITE_XLINK_ORDER_FIELDS_QA', 'true')
    expect(mockOrderFieldsRead('biz/extField/query', { ...body, _all: 1 })).toBeUndefined()
    expect(mockOrderFieldsRead('biz/extField/query', body)).toMatchObject({ total: 4 })
  })
})
