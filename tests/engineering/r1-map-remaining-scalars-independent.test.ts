import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import {normalizeFieldValue} from '@runtimes/dynamic-form'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

type Kind='phone'|'IDNumber'|'date'|'time'|'select'
const examples:Record<Kind,{before:string;after:string}>={
 phone:{before:'13800138000',after:'13900139000'},
 IDNumber:{before:'000100200300400500',after:'00010020030040050X'},
 date:{before:'2028-02-28',after:'2028-02-29'},
 time:{before:'08:09',after:'23:59'},
 select:{before:'a',after:'b'},
}

function fixture(kind:Kind,typed=false){
 const h=existingRecordFixture()
 if(!typed)h.mapRoute()
 const key=typed?'memo':'renamedConfiguredValue'
 const providerId='configured-scalar-options'
 Object.assign(h.fields[1],{
  name:key,type:kind,multiple:false,preset:typed?1:0,required:'0',
 })
 if(kind==='select')h.fields[1].valueOption=providerId
 for(const r of [h.record,h.other]){
  r[key]=examples[kind].before
  if(!typed)r.exts[key]=examples[kind].before
 }
 let options:Record<string,string>={a:'Alpha',b:'Beta'}
 const execute=h.transport.execute.getMockImplementation()!
 h.transport.execute.mockImplementation(async req=>{
  if(req.path==='i/code/selectCode.do'){
   expect(req.body).toEqual({
    tenantId:h.scope.tenantId,
    jsonPara:JSON.stringify([{codeId:providerId,eleid:providerId}]),
   })
   h.events.push(req.path)
   return JSON.stringify([{codeId:providerId,eleid:providerId,options}])
  }
  return execute(req)
 })
 return {...h,key,setOptions:(next:Record<string,string>)=>{options=next}}
}

async function edit(h:ReturnType<typeof fixture>){
 const s=await h.load(),a=h.provider().forSnapshot(s)
 expect(a?.canEdit?.(h.record._id)).toBe(true)
 if(!a)throw Error('Actual source-bound Map control capability is not implemented')
 return a
}

it('shared codec representation checks are distinct from controller authorization',()=>{
 expect(normalizeFieldValue('IDNumber',examples.IDNumber.after))
  .toEqual({ok:true,value:examples.IDNumber.after})
 expect(normalizeFieldValue('date',examples.date.after))
  .toEqual({ok:true,value:'2028-02-29'})
 expect(normalizeFieldValue('time',examples.time.after))
  .toEqual({ok:true,value:'23:59'})
 expect(normalizeFieldValue('select','b',[
  {value:'a',label:'A'},{value:'b',label:'B'},
 ],false)).toEqual({ok:true,value:'b'})
})

it.each(['phone','IDNumber','date','time','select'] as const)(
 'configured Map %s uses the actual same-ID controller',async kind=>{
  const h=fixture(kind)
  const before=structuredClone(h.record),other=structuredClone(h.other)
  const a=await edit(h)
  await a.saveOnly({
   ...a.initialValues!(h.record._id),[h.key]:examples[kind].after,
  },h.record._id)
  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr)
  expect(sent._id).toBe(before._id)
  expect(sent[h.key]).toBe(examples[kind].after)
  expect(h.record[h.key]).toBe(examples[kind].after)
  expect(h.record.exts[h.key]).toBe(examples[kind].after)
  expect(h.record.exts.preserved).toEqual(before.exts.preserved)
  expect(h.other).toEqual(other)
  expect(h.events.filter(
   e=>/process|updateExts|upload|delete|remove/i.test(e),
  )).toEqual([])
 },
)

it.each([
 {kind:'date' as const,value:'2027-02-29'},
 {kind:'date' as const,value:'2028-13-01'},
 {kind:'time' as const,value:'24:00'},
])('invalid local $kind $value refuses before dispatch',async({kind,value})=>{
 const h=fixture(kind),a=await edit(h)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),[h.key]:value,
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
})

// R1 extForm.checkMobile, not an invented international-phone policy.
it.each(['10000000000','1380013800','not-a-phone'])(
 'changed phone %s violates the pinned R1 mobile rule',async value=>{
  const h=fixture('phone'),a=await edit(h)
  await expect(a.saveOnly({
   ...a.initialValues!(h.record._id),[h.key]:value,
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
 },
)

it('unsafe numeric ID input cannot be stringified into an apparently valid identifier',async()=>{
 const h=fixture('IDNumber'),a=await edit(h)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),[h.key]:Number.MAX_SAFE_INTEGER+1,
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
})

it.each([{value:['b']},{value:'foreign'}])(
 'single select refuses $value',async({value})=>{
  const h=fixture('select'),a=await edit(h)
  await expect(a.saveOnly({
   ...a.initialValues!(h.record._id),[h.key]:value,
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
 },
)

it.each(['provider','readonly','actor'] as const)(
 'fresh select %s change invalidates the issued editor',async mode=>{
  const h=fixture('select'),a=await edit(h)
  const values=a.initialValues!(h.record._id)!
  if(mode==='provider')h.setOptions({a:'Changed label',b:'Beta'})
  if(mode==='readonly'){
   h.fields[1].readOnly=1
   h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id]
   h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id]
  }
  if(mode==='actor')h.changeActor()
  await expect(a.saveOnly({
   ...values,[h.key]:'b',
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
 },
)

it.each(['date','time'] as const)(
 'optional Map %s empty-string clear remains literal, not null or Date',
 async kind=>{
  const h=fixture(kind),a=await edit(h)
  await a.saveOnly({
   ...a.initialValues!(h.record._id),[h.key]:'',
  },h.record._id)
  expect(h.writes).toHaveLength(1)
  expect(h.record[h.key]).toBe('')
  expect(h.record.exts[h.key]).toBe('')
 },
)

it.each(['phone','IDNumber','date','time','select'] as const)(
 'this Map extension does not implicitly expand typed Survey %s',async kind=>{
  const h=fixture(kind,true),s=await h.load()
  expect(h.provider().forSnapshot(s)?.canEdit?.(h.record._id)??false)
   .toBe(false)
  expect(h.writes).toEqual([])
 },
)