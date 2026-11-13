import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

type Selector='root'|'exts'|'default'

function fixture(selector:Selector='root',preset=0,readonly=false){
 const h=existingRecordFixture();h.mapRoute()
 const raw=h.fields[0],colName=h.ext.colName
 h.fields.splice(0,h.fields.length,
  {
   ...raw,_id:'mode-field',name:'renamedMode',type:'text',
   required:'1',preset,readOnly:readonly?1:0,colName,
  },
  {
   ...raw,_id:'detail-field',name:'renamedDetail',type:'text',
   required:'1',preset:0,readOnly:0,
   showType:'3',showField:'renamedMode',showValue:'match',colName,
  },
  {
   ...raw,_id:'note-field',name:'renamedNote',type:'text',
   required:'0',preset:1,readOnly:0,colName,
  },
 )
 if(selector==='root')h.fields[1].showFieldPreset=1
 else if(selector==='exts')h.fields[1].showFieldPreset=0
 else delete h.fields[1].showFieldPreset

 h.node.nodeDef.formFieldIdsFill=h.fields
  .filter(f=>f.readOnly!==1).map(f=>f._id)
 h.node.nodeDef.formFieldIdsReadOnly=readonly?['mode-field']:[]
 h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill]
 h.setGrant()

 for(const r of [h.record,h.other]){
  r.renamedMode='match'
  r.renamedDetail='before'
  r.renamedNote='unchanged'
  r.exts.renamedDetail='before'
  if(preset===0)r.exts.renamedMode='match'
 }
 return h
}

async function editable(h:ReturnType<typeof fixture>){
 const s=await h.load(),a=h.provider().forSnapshot(s)
 expect(s.definition.fields?.[1]?.visibility).toBeDefined()
 expect(a?.canEdit?.(h.record._id)).toBe(true)
 if(!a)throw Error('Actual slot-bound conditional controller is not implemented')
 return a
}

it('control: actual scalar controller and intercepted readback work',async()=>{
 const h=existingRecordFixture();h.mapRoute()
 const a=h.provider().forSnapshot(await h.load())!
 expect(a?.canEdit?.(h.record._id)).toBe(true)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),memo:'control',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.memo).toBe('control')
})

it.each([
 {
  name:'non-preset, explicit root, equal duplicate values',
  selector:'root' as const,preset:0,
 },
 {
  name:'non-preset, default EXTS, no root value',
  selector:'default' as const,preset:0,
 },
 {
  name:'non-preset, explicit EXTS, no root value',
  selector:'exts' as const,preset:0,
 },
 {
  name:'preset root, explicit root',
  selector:'root' as const,preset:1,
 },
])('$name can edit and save through the same-ID controller',async({selector,preset})=>{
 const h=fixture(selector,preset)
 if(selector!=='root'){
  for(const r of [h.record,h.other])delete r.renamedMode
 }
 const before=structuredClone(h.record)
 const other=structuredClone(h.other)
 const a=await editable(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedDetail:'edited',
 },h.record._id)

 expect(h.writes).toHaveLength(1)
 const sent=JSON.parse(h.writes[0].body.dataStr)
 expect(sent._id).toBe(before._id)
 expect(h.record.renamedDetail).toBe('edited')
 expect(h.record.exts.renamedDetail).toBe('edited')
 expect(h.record.exts.preserved).toEqual(before.exts.preserved)
 expect(h.other).toEqual(other)
})

it.each([
 {
  kind:'selected root missing',selector:'root' as const,
  change:(r:any)=>{delete r.renamedMode},
 },
 {
  kind:'selected default EXTS missing',selector:'default' as const,
  change:(r:any)=>{delete r.exts.renamedMode},
 },
 {
  kind:'selected explicit EXTS missing',selector:'exts' as const,
  change:(r:any)=>{delete r.exts.renamedMode},
 },
 {
  kind:'conflict under root selector',selector:'root' as const,
  change:(r:any)=>{r.exts.renamedMode='other'},
 },
 {
  kind:'conflict under EXTS selector',selector:'exts' as const,
  change:(r:any)=>{r.renamedMode='other'},
 },
])('$kind cannot issue an editable controller even when the other slot exists',
 async({selector,change})=>{
  const h=fixture(selector,0)
  change(h.record)
  const before=structuredClone(h.record)
  const s=await h.load(),a=h.provider().forSnapshot(s)
  expect(s.records.some(r=>String(r.id)===h.record._id)).toBe(true)
  expect(a?.canEdit?.(h.record._id)??false).toBe(false)
  expect(h.writes).toEqual([])
  expect(h.record).toEqual(before)
 },
)

it('a readonly non-preset dependency can be read from explicit root without becoming writable',async()=>{
 const h=fixture('root',0,true)
 const before=structuredClone(h.record),a=await editable(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedDetail:'edited',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.renamedMode).toBe(before.renamedMode)
 expect(h.record.exts.renamedMode).toBe(before.exts.renamedMode)
 expect(h.record.exts.preserved).toEqual(before.exts.preserved)
})

it('a readonly condition dependency cannot be forged to bypass requiredness',async()=>{
 const h=fixture('root',0,true)
 const before=structuredClone(h.record),a=await editable(h)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),
  renamedMode:'other',renamedDetail:'',
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
 expect(h.record).toEqual(before)
})