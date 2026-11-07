import { expect, it, vi } from 'vitest'
import { createR1ScopedFormReader, type R1ScopedFormScope } from '@adapters/api/r1-scoped-form-read'
const scope: R1ScopedFormScope = { tenantId: 'tenant', workOrderId: 'work', runtimeNodeId: 'node', workflowRunId: 'run', formDefinitionId: 'survey', sourceNodeType: 'repeat' }
const row = (i = 0) => ({ _id: `record-${i}`, tenantId: 'tenant', sid: 'work', nodeId: 'node', workflowId: 'run', state: 1, exts: { remark: 'test' } })
const response = (data = [row()], total = data.length, page = 1, size = 20) => ({ data, total, page, size, dataCount: data.length })
it('reads complete bounded pages, then independently selects discovered ID', async () => {
  const execute = vi.fn().mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => row(i)), 21)).mockResolvedValueOnce(response([row(20)], 21, 2)).mockResolvedValueOnce(response([row(20)], 1, 1, 2))
  const reader = createR1ScopedFormReader({ transport: { execute }, scope, isCurrent: () => true })
  expect(await reader.discover()).toHaveLength(21)
  expect((await reader.select('record-20')).data.values?.remark).toBe('test')
  expect(execute.mock.calls[0]?.[0].body).toMatchObject({ 'is:sid|string#and': 'work', 'is:nodeId|string#and': 'node', 'is:workflowId|string#and': 'run', 'ne:state|integer#and': -1 })
})
it.each(['tenantId', 'sid', 'nodeId', 'workflowId', 'state', 'extId', 'id'])('rejects contradictory %s', async key => {
  const execute = vi.fn().mockResolvedValue(response([{ ...row(), [key]: 'wrong' }]))
  await expect(createR1ScopedFormReader({ transport: { execute }, scope, isCurrent: () => true }).discover()).rejects.toThrow()
  expect(execute).toHaveBeenCalledTimes(1)
})
it('does not request arbitrary selection or missing scope', async () => {
  const execute = vi.fn()
  const reader = createR1ScopedFormReader({ transport: { execute }, scope, isCurrent: () => true })
  await expect(reader.select('arbitrary')).rejects.toThrow()
  await expect(createR1ScopedFormReader({ transport: { execute }, scope: { ...scope, tenantId: '' }, isCurrent: () => true }).discover()).rejects.toThrow()
  expect(execute).not.toHaveBeenCalled()
})
it('rejects staleness after awaited response', async () => {
  let fresh = true
  const execute = vi.fn(async () => { fresh = false; return response() })
  await expect(createR1ScopedFormReader({ transport: { execute }, scope, isCurrent: () => fresh }).discover()).rejects.toThrow()
})
it.each([response([], 1), response([row(), row()]), response([row()], 201), { data: [row()] }])('rejects incomplete or ambiguous pages', async raw => {
  await expect(createR1ScopedFormReader({ transport: { execute: async () => raw }, scope, isCurrent: () => true }).discover()).rejects.toThrow()
})
it('forms independently reads only validated active references', async () => {
  const execute = vi.fn().mockResolvedValue(response([row()], 1, 1, 2))
  const reader = createR1ScopedFormReader({ transport: { execute }, scope: { ...scope, sourceNodeType: 'forms' }, isCurrent: () => true, formList: { source: 'exts.formList', evidence: 'available', truncated: false, entries: [{ id: 'record-0' as never, state: 'active' }] } })
  expect(await reader.discover()).toHaveLength(1)
  expect(execute.mock.calls[0]?.[0].body['is:_id|string#and']).toBe('record-0')
})
it('omits edit provenance instead of emitting a cloned trust-context lookalike', async () => {
  const reader = createR1ScopedFormReader({ transport: { execute: async () => response() }, scope, isCurrent: () => true })
  const [record] = await reader.discover()
  expect(record?.data).not.toHaveProperty('appointmentReplacement')
  expect(Object.isFrozen(record?.data)).toBe(true)
  expect(Object.isFrozen(record?.data.values)).toBe(true)
})
