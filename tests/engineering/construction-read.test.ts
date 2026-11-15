import { describe, it, expect } from 'vitest'
import { constructionReadRequest, parseConstructionLogs, constructionPartLabels } from '../../src/shared/construction-read-contract'
const dictionary = [{ type: 'parts', children: [{ value: 'roof', name: '屋面', children: [{ value: 'joint', name: '接缝' }] }] }]
const row = { _id: 'log1', serviceAppointmentId: 'wo1', state: 1, orderId: 'O1', repairParts: [['roof', 'joint']], data: [{ content: '基层检查' }, { content: '节点复核' }] }
describe('R1 construction readonly contract', () => {
  it('keeps exact same-WorkOrder R1 query and deleted filter', () => expect(constructionReadRequest('wo1')).toEqual({ path: 'biz/extForm/query/9190357980804726357', body: { sortField: 'createTime', sortOrder: 'asc', 'is:serviceAppointmentId|string#and': 'wo1', 'ne:state|integer#and': -1 } }))
  it('maps source fields and hierarchical dictionary paths', () => expect(parseConstructionLogs({ data: [row] }, 'wo1', dictionary)[0]).toMatchObject({ id: 'log1', orderId: 'O1', repairParts: ['屋面 / 接缝'], procedures: ['基层检查', '节点复核'] }))
  it('supports zero records without inferring completion', () => expect(parseConstructionLogs({ data: [] }, 'wo1', dictionary)).toEqual([]))
  it.each([{ ...row, serviceAppointmentId: 'other' }, { ...row, state: -1 }, { ...row, data: [{}] }, { ...row, _id: '' }])('rejects out-of-scope or invalid records %j', bad => expect(() => parseConstructionLogs({ data: [bad] }, 'wo1', dictionary)).toThrow())
  it('rejects duplicates and malformed/failure envelopes', () => { for (const response of [{ data: [row, row] }, { data: null }, { success: false, data: [] }]) expect(() => parseConstructionLogs(response, 'wo1', dictionary)).toThrow() })
  it('omits unknown or incomplete dictionary paths rather than guessing', () => expect(constructionPartLabels([['roof', 'unknown'], ['roof', 'joint']], dictionary)).toEqual(['屋面 / 接缝']))
  it('rejects blank or padded scope', () => { for (const id of ['', ' wo1']) expect(() => constructionReadRequest(id)).toThrow() })
})
