import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mapChoiceDatetimeFixture } from '../support/r1-map-choice-datetime-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { asOpaqueId } from '@shared/types'

beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

function fixture(optional = false, inline = false, multiple?: boolean) {
  const h = mapChoiceDatetimeFixture(inline)
  Object.assign(h.fields[0], { type: 'checkbox', required: optional ? '0' : '1', multiple, preset: 0 })
  for (const record of [h.record, h.other]) {
    record.contactMode = ['onsite']
    record.exts.contactMode = ['onsite']
  }
  return h
}

it.each([undefined, false, true])('edits a source-bound checkbox array in selection order (multiple %s)', async multiple => {
  const h = fixture(false, false, multiple), sibling = structuredClone(h.other), original = structuredClone(h.record)
  const a = h.provider().forSnapshot(await h.load())
  expect(a).not.toBeNull()
  expect(a!.projectFields!({}, 'saved-edit').find(f => f.valueKey === 'contactMode')).toMatchObject({ supported: true, preserveSelectionOrder: true })
  await a!.saveOnly({ ...a!.initialValues!('saved-edit'), contactMode: ['remote', 'onsite'] }, 'saved-edit')
  expect(h.record.contactMode).toEqual(['remote', 'onsite'])
  expect(h.record.exts).toEqual({ ...original.exts, contactMode: ['remote', 'onsite'] })
  expect(h.other).toEqual(sibling)
  expect(h.writes).toHaveLength(1)
})

it.each([false, true])('explicitly persists an optional empty selection instead of keeping the old value (inline %s)', async inline => {
  const h = fixture(true, inline), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  const values = { ...a.initialValues!('saved-edit'), contactMode: [] }
  expect(a.validateDraft!(values, 'saved-edit')).toBe(true)
  await a.saveOnly(values, 'saved-edit')
  expect(JSON.parse(h.writes[0].body.dataStr)).toMatchObject({ contactMode: [], exts: { contactMode: [] } })
  expect(h.record.contactMode).toEqual([])
  expect(h.record.exts.contactMode).toEqual([])
  expect(h.provider().forSnapshot(await h.load())!.canEdit!('saved-edit')).toBe(false)
})

it('clears an optional preset checkbox without introducing an EXTS copy', async () => {
  const h = fixture(true)
  h.fields[0].preset = 1
  for (const r of [h.record, h.other]) delete r.exts.contactMode
  const a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await a.saveOnly({ ...a.initialValues!('saved-edit'), contactMode: [] }, 'saved-edit')
  expect(h.record.contactMode).toEqual([])
  expect(h.record.exts).not.toHaveProperty('contactMode')
})

it.each([30, 31])('retains the bounded checkbox member budget (%s)', async count => {
  const h = fixture(), members = Array.from({ length: count }, (_, i) => 'choice' + i)
  h.setOptions(Object.fromEntries(['onsite', ...members].map(value => [value, value])))
  const a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  const save = a.saveOnly({ ...a.initialValues!('saved-edit'), contactMode: members }, 'saved-edit')
  if (count === 31) { await expect(save).rejects.toThrow(); expect(h.writes).toEqual([]) }
  else { await save; expect(h.record.contactMode).toEqual(members); expect(h.writes).toHaveLength(1) }
})

it.each([[], ['unknown'], ['onsite', 'onsite'], 'onsite', [1], [true], [null]].map(v=>[v]))('rejects invalid/required checkbox value %j before dispatch', async contactMode => {
  const h = fixture(), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await expect(a.saveOnly({ ...a.initialValues!('saved-edit'), contactMode }, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
})

it.each(['provider', 'readonly', 'actor'] as const)('fresh %s changes refuse an array save before dispatch', async change => {
  const h = fixture(), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  const values = { ...a.initialValues!('saved-edit'), contactMode: ['remote'] }
  if (change === 'provider') h.setOptions({ onsite: '现场', remote: '不同选项代次' })
  if (change === 'readonly') {
    h.node.nodeDef.formFieldIdsFill = ['time-field', 'note-field']
    h.node.nodeDef.formFieldIdsReadOnly = ['choice-field']
  }
  if (change === 'actor') h.changeActor()
  await expect(a.saveOnly(values, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
})

it('retains uncertainty after an empty selection save loses its response and does not replay on reentry', async () => {
  const h = fixture(true), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  const execute = h.commands.execute.getMockImplementation()!
  h.commands.execute.mockImplementation(async request => { await execute(request); throw Error('synthetic response lost') })
  await expect(a.saveOnly({ ...a.initialValues!('saved-edit'), contactMode: [] }, 'saved-edit')).rejects.toThrow()
  expect(h.record.exts.contactMode).toEqual([])
  expect(h.writes).toHaveLength(1)
  const next = h.provider().forSnapshot(await h.load())!
  expect(next.canEdit!('saved-edit')).toBe(false)
  await expect(next.saveOnly({ contactMode: ['onsite'] }, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toHaveLength(1)
})

it('empty-array serialization needs one exact optional checkbox storage row and an existing record', () => {
  const base = { sourceNodeType: 'repeat' as const, definitionId: asOpaqueId<'FormDefinitionId'>('definition'),
    workOrderId: asOpaqueId<'WorkOrderId'>('work'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node'),
    workflowRunId: asOpaqueId<'WorkflowRunId'>('run'), state: 1 as const, formData: { flags: [] } }
  const existing = { existingFormDataId: asOpaqueId<'FormDataId'>('record'), authoritativeOriginal: { _id: 'record', state: 1, flags: ['a'] } }
  const field = { fieldId: 'flags', valueKey: 'flags', type: 'checkbox', required: false }
  for (const fields of [undefined, [{ ...field, type: 'cascade' }], [{ ...field, required: true }], [field, field]]) {
    expect(() => r1SpecialFormUpsert({ ...base, ...existing, fieldStorage: fields })).toThrow()
  }
  expect(() => r1SpecialFormUpsert({ ...base, fieldStorage: [field] })).toThrow()
  expect(JSON.parse(String(r1SpecialFormUpsert({ ...base, ...existing, fieldStorage: [field] }).body?.dataStr)).flags).toEqual([])
})
