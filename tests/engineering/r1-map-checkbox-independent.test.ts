import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

function checkbox(preset=1,required=false){
 const h=existingRecordFixture();h.mapRoute()
 const original=h.fields[0],colName=h.ext.colName
 const providerId='configured-flags'
 h.fields.splice(0,h.fields.length,
  {
   ...original,_id:'flags-field',name:'renamedFlags',
   type:'checkbox',multiple:true,preset,
   required:required?'1':'0',valueOption:providerId,colName,
  },
  {
   ...original,_id:'note-field',name:'renamedNote',
   type:'text',multiple:false,preset:1,required:'0',colName,
  },
 )
 h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id)
 h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill]
 h.setGrant()
 for(const r of [h.record,h.other]){
  r.renamedFlags=['a']
  r.renamedNote='unchanged'
  if(preset===0)r.exts.renamedFlags=['a']
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
   return JSON.stringify([{
    codeId:providerId,eleid:providerId,options,
   }])
  }
  return execute(req)
 })
 return {...h,setOptions:(value:Record<string,string>)=>{options=value}}
}

async function edit(h:ReturnType<typeof checkbox>){
 const snapshot=await h.load()
 const action=h.provider().forSnapshot(snapshot)
 expect(snapshot.definition.fields?.[0]?.options).toEqual([
  {value:'a',label:'Alpha'},{value:'b',label:'Beta'},
 ])
 expect(action?.canEdit?.(h.record._id)).toBe(true)
 if(!action){
  throw Error('Required actual normal reader/controller capability is not implemented')
 }
 return action
}

it('control: the existing scalar fixture really dispatches and reads back once',async()=>{
 const h=existingRecordFixture();h.mapRoute()
 const a=h.provider().forSnapshot(await h.load())!
 expect(a?.canEdit?.(h.record._id)).toBe(true)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),memo:'scalar control',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.memo).toBe('scalar control')
})

it.each([1,0])(
 'same-ID checkbox preserves order, opaque EXTS and sibling (preset %s)',
 async preset=>{
  const h=checkbox(preset)
  const before=structuredClone(h.record),other=structuredClone(h.other)
  const a=await edit(h)
  await a.saveOnly({
   ...a.initialValues!(h.record._id),renamedFlags:['b','a'],
  },h.record._id)
  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr)
  expect(sent._id).toBe(before._id)
  expect(sent.renamedFlags).toEqual(['b','a'])
  expect(h.record.renamedFlags).toEqual(['b','a'])
  expect(h.record.exts).toEqual(
   preset===0?{...before.exts,renamedFlags:['b','a']}:before.exts,
  )
  expect(h.other).toEqual(other)
  expect(h.events.filter(
   e=>/process|updateExts|upload|remove|delete/i.test(e),
  )).toEqual([])
 },
)

it('optional [] is an explicit clear in root and the verified non-preset EXTS copy',async()=>{
 const h=checkbox(0)
 const opaque=structuredClone(h.record.exts.preserved),a=await edit(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedFlags:[],
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 const sent=JSON.parse(h.writes[0].body.dataStr)
 expect(Object.hasOwn(sent,'renamedFlags')).toBe(true)
 expect(sent.renamedFlags).toEqual([])
 expect(h.record.renamedFlags).toEqual([])
 expect(h.record.exts.renamedFlags).toEqual([])
 expect(h.record.exts.preserved).toEqual(opaque)
})

it('required [] is refused before dispatch',async()=>{
 const h=checkbox(1,true)
 const before=structuredClone(h.record),a=await edit(h)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),renamedFlags:[],
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
 expect(h.record).toEqual(before)
})

it.each([
 {members:['a','a']},
 {members:['foreign']},
])('duplicate/unknown submitted members $members are refused',async({members})=>{
 const h=checkbox()
 const before=structuredClone(h.record),a=await edit(h)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),renamedFlags:members,
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
 expect(h.record).toEqual(before)
})

it('a fresh root/EXTS conflict refuses an already-issued editor',async()=>{
 const h=checkbox(0),a=await edit(h)
 const values=a.initialValues!(h.record._id)!
 h.record.exts.renamedFlags=['b']
 await expect(a.saveOnly({
  ...values,renamedNote:'must not dispatch',
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
})

it.each(['provider','readonly','actor'] as const)(
 'fresh %s change prevents any checkbox dispatch',async mode=>{
  const h=checkbox(),a=await edit(h)
  const values=a.initialValues!(h.record._id)!
  if(mode==='provider')h.setOptions({a:'Changed label',b:'Beta'})
  if(mode==='readonly'){
   h.node.nodeDef.formFieldIdsFill=['note-field']
   h.node.nodeDef.formFieldIdsReadOnly=['flags-field']
  }
  if(mode==='actor')h.changeActor()
  await expect(a.saveOnly({
   ...values,renamedFlags:['b'],
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
 },
)