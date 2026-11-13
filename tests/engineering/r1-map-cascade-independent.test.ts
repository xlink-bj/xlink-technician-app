import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import {normalizeFieldValue} from '@runtimes/dynamic-form'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

function cascade(preset=1){
 const h=existingRecordFixture();h.mapRoute()
 const raw=h.fields[0],colName=h.ext.colName
 const providerId='configured-tree'
 h.fields.splice(0,h.fields.length,
  {
   ...raw,_id:'path-field',name:'renamedPath',
   type:'cascade',multiple:false,preset,required:'1',
   valueOption:providerId,colName,
  },
  {
   ...raw,_id:'note-field',name:'renamedNote',
   type:'text',multiple:false,preset:1,required:'0',colName,
  },
 )
 h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id)
 h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill]
 h.setGrant()
 for(const r of [h.record,h.other]){
  r.renamedPath=['north','a']
  r.renamedNote='unchanged'
  if(preset===0)r.exts.renamedPath=['north','a']
 }
 const option=(id:string,value:string,parentId:string)=>({
  _id:id,value,name:value,parentId,
  type:providerId,tenantId:h.scope.tenantId,children:[] as any[],
 })
 const north=option('N','north','G')
 const south=option('S','south','G')
 north.children=[option('A','a','N')]
 south.children=[option('B','b','S')]
 const group={
  _id:'G',type:providerId,tenantId:h.scope.tenantId,
  children:[north,south],
 }
 const execute=h.transport.execute.getMockImplementation()!
 h.transport.execute.mockImplementation(async req=>{
  if(req.path==='i/code/selectMultistageCode.do'){
   expect(req.body).toEqual({
    types:providerId,tenantId:h.scope.tenantId,
   })
   h.events.push(req.path)
   return structuredClone([group])
  }
  return execute(req)
 })
 return {...h,group}
}

async function edit(h:ReturnType<typeof cascade>){
 const s=await h.load(),a=h.provider().forSnapshot(s)
 expect(
  s.definition.fields?.[0]?.options?.[0]?.children?.[0]?.value,
 ).toBe('a')
 expect(a?.canEdit?.(h.record._id)).toBe(true)
 if(!a){
  throw Error('Actual normal existing-edit cascade capability is not implemented')
 }
 return a
}

it('shared runtime preserves parent-child order and rejects cross-branch paths',async()=>{
 const h=cascade(),s=await h.load(),f=s.definition.fields![0]!
 expect(normalizeFieldValue(
  'cascade',['south','b'],f.options,false,
 )).toEqual({ok:true,value:['south','b']})
 expect(normalizeFieldValue(
  'cascade',['north','b'],f.options,false,
 ).ok).toBe(false)
 expect(h.writes).toEqual([])
})

it.each([1,0])(
 'same-ID leaf-path save preserves opaque data and sibling (preset %s)',
 async preset=>{
  const h=cascade(preset),a=await edit(h)
  const before=structuredClone(h.record)
  const other=structuredClone(h.other)
  await a.saveOnly({
   ...a.initialValues!(h.record._id),renamedPath:['south','b'],
  },h.record._id)
  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr)
  expect(sent._id).toBe(before._id)
  expect(sent.renamedPath).toEqual(['south','b'])
  expect(h.record.renamedPath).toEqual(['south','b'])
  expect(h.record.exts).toEqual(
   preset===0?{...before.exts,renamedPath:['south','b']}:before.exts,
  )
  expect(h.other).toEqual(other)
  expect(h.events.filter(
   e=>/process|updateExts|upload|remove|delete/i.test(e),
  )).toEqual([])
 },
)

it.each([
 {path:['north','b'],kind:'cross-branch'},
 {path:['north','unknown'],kind:'unknown'},
 {path:['b','south'],kind:'reversed'},
 {path:[],kind:'required-empty'},
])('$kind cascade value is rejected by an issued controller before dispatch',async({path})=>{
 const h=cascade(),a=await edit(h)
 const before=structuredClone(h.record)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),renamedPath:path,
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
 expect(h.record).toEqual(before)
})

it.each(['label','remove-original','reparent-original'] as const)(
 'fresh provider %s change invalidates the old editor',async kind=>{
  const h=cascade(),a=await edit(h)
  const values=a.initialValues!(h.record._id)!
  const north=h.group.children[0]!
  const south=h.group.children[1]!
  if(kind==='label'){
   north.children[0].name='Changed label'
  }else if(kind==='remove-original'){
   north.children=[]
  }else{
   const leaf=north.children.pop()!
   leaf.parentId='S'
   south.children.push(leaf)
  }
  await expect(a.saveOnly({
   ...values,renamedPath:['south','b'],
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
 },
)

it('fresh root/EXTS path disagreement prevents dispatch and is never flattened away',async()=>{
 const h=cascade(0),a=await edit(h)
 const values=a.initialValues!(h.record._id)!
 h.record.exts.renamedPath=['south','b']
 await expect(a.saveOnly({
  ...values,renamedNote:'must not dispatch',
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
})