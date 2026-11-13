import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mapConditionalCascadeFixture } from '../support/r1-map-conditional-cascade-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('uses the actual R1 condition dependency slot (EXTS %s)', async ext => {
  const h = mapConditionalCascadeFixture(false, ext), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  expect(a.projectFields!({}, 'saved-edit').find(f => f.valueKey === 'conditionalValue')?.visible).toBe(true)
  await a.saveOnly({ ...a.initialValues!('saved-edit'), operationMode: 'hide' }, 'saved-edit')
  expect(h.record.operationMode).toBe('hide')
  expect(h.record.conditionalValue).toBe('原始说明')
  expect(h.record.exts.conditionalValue).toBe('原始说明')
  if (ext) expect(h.record.exts.operationMode).toBe('hide')
})

it('reads root for showFieldPreset=1 even when the dependency writes both non-preset slots', async () => {
  const h = mapConditionalCascadeFixture(false, true)
  h.fields[1].showFieldPreset = 1
  const s = await h.load(), evidence = h.reader.currentRecordEdit!(s, 'saved-edit')!, a = h.provider().forSnapshot(s)!
  expect(a).not.toBeNull()
  expect(evidence.storage.conditions).toEqual([{fieldId:'time-field',dependencyFieldId:'choice-field',valueKey:'operationMode',slot:'root'}])
  expect(h.reader.isCurrentRecordEdit!(s, 'saved-edit', {...evidence,storage:{...evidence.storage,
    conditions:[{...evidence.storage.conditions![0]!,slot:'exts'}]}})).toBe(false)
  await a.saveOnly({...a.initialValues!('saved-edit'),operationMode:'hide'},'saved-edit')
  expect(h.record.operationMode).toBe('hide')
  expect(h.record.exts.operationMode).toBe('hide')
  expect(h.record.conditionalValue).toBe('原始说明')
})

it('invalidates a changed condition-read slot even when values and visible projection are equal', async () => {
  const h=mapConditionalCascadeFixture(false,true),a=h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  const values=a.initialValues!('saved-edit')!
  h.fields[1].showFieldPreset=1
  await expect(a.saveOnly({...values,conditionalValue:'不能保存旧来源'},'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
})

it('does not substitute EXTS when a condition explicitly reads a missing non-preset root', async () => {
  const h=mapConditionalCascadeFixture(false,true)
  h.fields[1].showFieldPreset=1
  delete h.record.operationMode
  expect(h.provider().forSnapshot(await h.load())?.canEdit?.('saved-edit')??false).toBe(false)
  expect(h.writes).toEqual([])
})

it.each(['wrong-slot', 'missing-metadata', 'missing-value', 'missing-exts-slot', 'unknown-value', 'exists', 'nested'] as const)(
  'never turns an unverified condition dependency into default-hidden: %s', async mode => {
    const h = mapConditionalCascadeFixture(false, mode === 'missing-exts-slot')
    if (mode === 'wrong-slot') delete h.fields[1].showFieldPreset
    if (mode === 'missing-metadata') h.fields[1].showField = 'undeclared'
    if (mode === 'missing-value') delete h.record.operationMode
    if (mode === 'missing-exts-slot') delete h.record.exts.operationMode
    if (mode === 'unknown-value') h.record.operationMode = 'unknown'
    if (mode === 'exists') h.fields[1].showType = '2'
    if (mode === 'nested') h.fields[1].showField = 'exts.operationMode'
    expect(h.provider().forSnapshot(await h.load())?.canEdit?.('saved-edit') ?? false).toBe(false)
    expect(h.writes).toEqual([])
  })

it.each([[], ['a']].map(value => [value]))('retains an untouched hidden optional checkbox %j instead of applying the clear sentinel', async value => {
  const h = mapConditionalCascadeFixture(true)
  h.record.operationMode = 'hide'
  h.record.conditionalValue = value
  h.record.exts.conditionalValue = structuredClone(value)
  const before = structuredClone(h.record), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await a.saveOnly({ ...a.initialValues!('saved-edit'), locationPath: ['south', 'lower', 'right'] }, 'saved-edit')
  expect(h.record.exts.conditionalValue).toEqual(before.exts.conditionalValue)
  expect(h.record.conditionalValue).toEqual(before.conditionalValue)
})

it('refuses an explicit hidden optional checkbox clear before dispatch', async () => {
  const h = mapConditionalCascadeFixture(true)
  h.record.operationMode = 'hide'
  const a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await expect(a.saveOnly({ ...a.initialValues!('saved-edit'), conditionalValue: [] }, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
})

it.each([['south'], ['south', 'lower'], ['south', 'lower', 'right']])('retains the shared runtime legal-prefix contract: %j', async (...path) => {
  const h = mapConditionalCascadeFixture(), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await a.saveOnly({ ...a.initialValues!('saved-edit'), locationPath: path }, 'saved-edit')
  expect(h.record.locationPath).toEqual(path)
  expect(h.record.exts.locationPath).toEqual(path)
})

it.each([[], '', ['north', 'lower', 'right']].map(value => [value]))('does not invent a cascade clear or cross-branch contract: %j', async value => {
  const h = mapConditionalCascadeFixture(), a = h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await expect(a.saveOnly({ ...a.initialValues!('saved-edit'), locationPath: value }, 'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
})

it('keeps multiple-path cascades out of the single-path capability', async () => {
  const h = mapConditionalCascadeFixture()
  h.fields[2].multiple = true
  expect(h.provider().forSnapshot(await h.load())).toBeNull()
  expect(h.writes).toEqual([])
})
