import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { existingRecordFixture } from '../support/r1-existing-record-edit-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
import { parseR1RepeatGrant } from '@app/r1-repeat-authorization'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { asOpaqueId } from '@shared/types'

beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

function manyFields(count: number) {
  const h = existingRecordFixture(true)
  h.mapRoute()
  for (let i = h.fields.length; i < count; i++) {
    const f = { ...h.fields[1], _id: `configured-${i}`, name: `configuredValue${i}` }
    h.fields.push(f)
    h.record.exts[f.name] = `原值${i}`
    h.other.exts[f.name] = `原值${i}`
  }
  h.node.nodeDef.formFieldIdsFill = h.fields.map(f => f._id)
  h.grant.fieldIds = [...h.node.nodeDef.formFieldIdsFill]
  h.setGrant()
  return h
}

it.each([51, 200])('changes all %i writable fields of a completely paginated definition without dropping other values', async count => {
  const h = manyFields(count), other = structuredClone(h.other), original = structuredClone(h.record)
  const a = h.provider().forSnapshot(await h.load())
  expect(a).not.toBeNull()
  expect(a!.projectFields!({}, 'saved-edit')).toHaveLength(count)
  const next = Object.fromEntries(h.fields.map(f => [f.name, f.type === 'digit' ? 0 : '更新' + f.name]))
  await a!.saveOnly(next, 'saved-edit')
  expect(h.record.exts).toEqual({ ...original.exts, ...Object.fromEntries(h.fields.filter(f => f.preset === 0).map(f => [f.name, next[f.name]])) })
  const wire = JSON.parse(h.writes[0].body.dataStr)
  for (const f of h.fields) {
    expect(wire[f.name]).toEqual(next[f.name])
    expect(wire[f.name]).not.toEqual(f.preset === 0 ? original.exts[f.name] : original[f.name])
  }
  expect(h.other).toEqual(other)
  expect(h.writes).toHaveLength(1)
  expect(h.transport.execute.mock.calls.filter(([r]) => r.path === 'biz/extField/query').map(([r]) => r.body.page))
    .toContain(Math.ceil(count / 50))
})

it('uses the mapped placeholder and does not require configuration to be empty', async () => {
  const h = existingRecordFixture()
  h.fields[1].frontEndConfig = JSON.stringify({ placeholder: '请输入现场说明' })
  const a = h.provider().forSnapshot(await h.load())
  expect(a).not.toBeNull()
  expect(a!.projectFields!({}, 'saved-edit').find(f => f.fieldId === 'configured-1'))
    .toMatchObject({ placeholder: '请输入现场说明', supported: true })
  await a!.saveOnly({ ...a!.initialValues!('saved-edit'), memo: '现场说明' }, 'saved-edit')
  expect(h.writes).toHaveLength(1)
})

it.each([undefined, 1])('preserves a node-readonly Map switch (raw readonly %s) while editing text', async readOnly => {
  const h = existingRecordFixture(true)
  h.mapRoute()
  h.fields[0].type = 'switch'
  h.fields[0].readOnly = readOnly
  h.record.width = '1'
  h.other.width = '1'
  h.node.nodeDef.formFieldIdsReadOnly = ['configured-0']
  h.node.nodeDef.formFieldIdsFill = ['configured-1']
  h.grant.fieldIds = ['configured-1']
  h.setGrant()
  const a = h.provider().forSnapshot(await h.load())
  expect(a).not.toBeNull()
  expect(a!.projectFields!({}, 'saved-edit').find(f => f.fieldId === 'configured-0'))
    .toMatchObject({ readOnly: true, supported: false })
  await expect(a!.saveOnly({ ...a!.initialValues!('saved-edit'), width: '0' }, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
  await a!.saveOnly({ ...a!.initialValues!('saved-edit'), visitComment: '只修改说明' }, 'saved-edit')
  expect(h.record.width).toBe('1')
  expect(h.record.exts).not.toHaveProperty('width')
  expect(h.record.exts.visitComment).toBe('只修改说明')
  expect(h.writes).toHaveLength(1)
})

it.each([{ verify: 'custom' }, { placeholder: 123 }, { placeholder: '说明', success: 'done' }, { mpDetailHide: true }])(
  'keeps unknown or malformed frontEndConfig closed: %j', async config => {
    const h = existingRecordFixture()
    h.fields[1].frontEndConfig = JSON.stringify(config)
    expect(h.provider().forSnapshot(await h.load())).toBeNull()
    expect(h.writes).toEqual([])
  })

it('does not promote a writable switch or an unknown readonly type to a supported storage strategy', async () => {
  for (const type of ['switch', 'unknown-control']) {
    const h = existingRecordFixture(true)
    h.mapRoute()
    h.fields[0].type = type
    if (type === 'unknown-control') {
      h.node.nodeDef.formFieldIdsReadOnly = ['configured-0']
      h.node.nodeDef.formFieldIdsFill = ['configured-1']
      h.grant.fieldIds = ['configured-1']
      h.setGrant()
    }
    expect(h.provider().forSnapshot(await h.load())).toBeNull()
    expect(h.writes).toEqual([])
  }
})

it('keeps the 200-row metadata bound and the older grant limits', async () => {
  const h = manyFields(201)
  expect(parseR1RepeatGrant(h.env.VITE_XLINK_R1_REPEAT_GRANT)).toBeNull()
  await expect(h.load()).rejects.toThrow()
  const fiftyOne = manyFields(51)
  const old = { ...fiftyOne.grant, version: 2 }
  delete old.synthetic
  delete old.profile
  expect(parseR1RepeatGrant(JSON.stringify(old))).toBeNull()
})

it('rejects a truncated second metadata page before issuing an editor', async () => {
  const h = manyFields(51), execute = h.transport.execute.getMockImplementation()!
  h.transport.execute.mockImplementation(async req => {
    const result: any = await execute(req)
    if (req.path === 'biz/extField/query' && req.body.page === 2) result.data = []
    return result
  })
  await expect(h.load()).rejects.toThrow()
  expect(h.writes).toEqual([])
})

it('preserves a readonly checkbox array through the controller and rejects tampering before dispatch', async () => {
  const h = existingRecordFixture(true)
  h.mapRoute()
  Object.assign(h.fields[0], { type: 'checkbox', multiple: true, readOnly: 1, preset: 0,
    options: [{ value: 'b', label: '乙' }, { value: 'a', label: '甲' }] })
  delete h.record.width
  delete h.other.width
  h.record.exts.width = ['b', 'a']
  h.other.exts.width = ['b', 'a']
  h.node.nodeDef.formFieldIdsReadOnly = ['configured-0']
  h.node.nodeDef.formFieldIdsFill = ['configured-1']
  h.grant.fieldIds = ['configured-1']
  h.setGrant()
  const a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await expect(a.saveOnly({ ...a.initialValues!('saved-edit'), width: ['a', 'b'] }, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
  await a.saveOnly({ ...a.initialValues!('saved-edit'), visitComment: '保留只读选项' }, 'saved-edit')
  expect(h.record.exts.width).toEqual(['b', 'a'])
  expect(h.record).not.toHaveProperty('width')
  expect(h.writes).toHaveLength(1)
})

it('does not enlarge new-record or unconfigured patch budgets when an existing schema can hold 200 rows', () => {
  const formData = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`v${i}`, '值']))
  const fieldStorage = Object.keys(formData).map(valueKey => ({ fieldId: valueKey, valueKey, preset: true }))
  const base = { sourceNodeType: 'repeat' as const, definitionId: asOpaqueId<'FormDefinitionId'>('definition'),
    workOrderId: asOpaqueId<'WorkOrderId'>('work'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node'),
    workflowRunId: asOpaqueId<'WorkflowRunId'>('run'), state: 1 as const, formData }
  const existing = { existingFormDataId: asOpaqueId<'FormDataId'>('record'), authoritativeOriginal: { _id: 'record', state: 1 } }
  expect(() => r1SpecialFormUpsert({ ...base, fieldStorage })).toThrow('field patch')
  expect(() => r1SpecialFormUpsert({ ...base, ...existing })).toThrow('field patch')
  expect(() => r1SpecialFormUpsert({ ...base, ...existing, fieldStorage: fieldStorage.slice(1) })).toThrow('field patch')
  expect(() => r1SpecialFormUpsert({ ...base, ...existing, fieldStorage: [...fieldStorage, fieldStorage[0]!] })).toThrow('field patch')
  expect(r1SpecialFormUpsert({ ...base, ...existing, fieldStorage }).body?.dataStr).toContain('"v50":"值"')
})

it('keeps a Map with contradictory root and EXTS copies readonly', async () => {
  const h = existingRecordFixture(true)
  h.mapRoute()
  h.record.exts.width = 99
  const a = h.provider().forSnapshot(await h.load())
  expect(a?.canEdit?.('saved-edit') ?? false).toBe(false)
  expect(h.writes).toEqual([])
})
