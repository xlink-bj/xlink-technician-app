import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { existingRecordFixture } from '../support/r1-existing-record-edit-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())
function fixture(type='switch'){
  const h=existingRecordFixture(true)
  h.mapRoute()
  Object.assign(h.fields[0],{type,required:'0',preset:0})
  for(const r of[h.record,h.other]){r.width=type==='switch'?'1':3;r.exts.width=r.width}
  return h
}
it('retains an unchanged legacy empty optional switch without adding a mirror or default',async()=>{
  const h=fixture()
  for(const r of[h.record,h.other]){r.width='';delete r.exts.width}
  const a=h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await a.saveOnly({...a.initialValues!('saved-edit'),visitComment:'保留空状态'},'saved-edit')
  expect(h.record.width).toBe('')
  expect(h.record.exts).not.toHaveProperty('width')
  expect(h.writes).toHaveLength(1)
})
it('retains an absent optional switch without inventing a default false value',async()=>{
  const h=fixture()
  for(const r of[h.record,h.other]){delete r.width;delete r.exts.width}
  const a=h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await a.saveOnly({...a.initialValues!('saved-edit'),visitComment:'仍未选择'},'saved-edit')
  expect(h.record).not.toHaveProperty('width')
  expect(h.record.exts).not.toHaveProperty('width')
})
it.each(['count','allowHalf','half','step','options','activeValue','inactiveValue','min','max'])('refuses unsupported raw custom default-control setting %s',async key=>{
  const h=fixture(key.includes('Value')?'switch':'rate')
  h.fields[0][key]=key==='allowHalf'?true:key.includes('Value')?'custom':10
  expect(h.provider().forSnapshot(await h.load())).toBeNull()
  expect(h.writes).toEqual([])
})
it.each(['count','allowHalf','half','step','options','activeValue','inactiveValue','min','max'])('refuses unsupported frontEndConfig custom default-control setting %s',async key=>{
  const h=fixture(key.includes('Value')?'switch':'rate')
  h.fields[0].frontEndConfig=JSON.stringify({[key]:key==='allowHalf'?true:key.includes('Value')?'custom':10})
  expect(h.provider().forSnapshot(await h.load())).toBeNull()
  expect(h.writes).toEqual([])
})
it.each(['switch','rate'])('does not accept an ACK which coerces the %s literal and never replays',async type=>{
  const h=fixture(type),a=h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  const execute=h.commands.execute.getMockImplementation()!
  h.commands.execute.mockImplementation(async req=>{
    await execute(req)
    h.record.width=h.record.exts.width=type==='switch'?false:'5'
    return{success:true,status:1,data:structuredClone(h.record)}
  })
  await expect(a.saveOnly({...a.initialValues!('saved-edit'),width:type==='switch'?'0':5},'saved-edit')).rejects.toThrow()
  expect(h.writes).toHaveLength(1)
  const next=h.provider().forSnapshot(await h.load())!
  expect(next.canEdit!('saved-edit')).toBe(false)
  expect(next.editProblem!('saved-edit')).toContain('上次保存结果尚未核实')
})
it('does not let hidden optional rating clearing bypass the original-value guard',async()=>{
  const h=fixture('rate')
  Object.assign(h.fields[0],{showType:'3',showField:'visitComment',showFieldPreset:0,showValue:'允许评分'})
  const a=h.provider().forSnapshot(await h.load())!
  expect(a).not.toBeNull()
  await expect(a.saveOnly({...a.initialValues!('saved-edit'),width:''},'saved-edit')).rejects.toThrow()
  expect(h.writes).toEqual([])
})
