import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())
type Route='map'|'survey-root'|'survey-exts'
const file=(id:string)=>({url:`https://files.example.invalid/${id}.jpg`,name:`${id}.jpg`,extname:'jpg'})

function fixture(route:Route='map',required=false,extraMetadata=false){
  const h=existingRecordFixture()
  if(route==='map')h.mapRoute()
  const key=route==='survey-root'?'surveyDrawing':'renamedAttachment'
  const preset=route==='survey-root'?1:0
  Object.assign(h.fields[1],{name:key,type:'file',preset,required:required?'1':'0',multiple:false})
  const files:any[]=[file('a'),file('b')]
  if(extraMetadata)files[1]={...files[1],rotation:0,sourceInfo:{keep:'original'}}
  for(const r of [h.record,h.other]){
    const original=r===h.record?files:[file('other-record-only')]
    if(route==='map'||preset===1)r[key]=structuredClone(original)
    else delete r[key]
    if(preset===0)r.exts[key]=structuredClone(original)
    else delete r.exts[key]
  }
  return {...h,key,route,preset}
}
async function edit(h:ReturnType<typeof fixture>){
  const snapshot=await h.load(),action=h.provider().forSnapshot(snapshot)
  expect(action?.canEdit?.(h.record._id)).toBe(true)
  if(!action)throw Error('Existing retained-media capability is not implemented')
  return action
}
function noAuxiliaryCommands(h:ReturnType<typeof fixture>){
  expect(h.events.filter(p=>/upToken|upload|updateExts|process|remove|delete|startWorkflow/i.test(p))).toEqual([])
}
function zero(h:ReturnType<typeof fixture>){expect(h.writes).toEqual([]);noAuxiliaryCommands(h)}
function assertSlots(h:ReturnType<typeof fixture>,raw:any,expected:unknown){
  expect(Object.hasOwn(raw,h.key)).toBe(h.route==='map'||h.preset===1)
  expect(Object.hasOwn(raw.exts,h.key)).toBe(h.preset===0)
  if(h.route==='map'||h.preset===1)expect(raw[h.key]).toEqual(expected)
  if(h.preset===0)expect(raw.exts[h.key]).toEqual(expected)
}

it.each(['map','survey-root','survey-exts'] as const)('%s removes only a reader-witnessed old reference and preserves exact slots',async route=>{
  const h=fixture(route),before=structuredClone(h.record),other=structuredClone(h.other),a=await edit(h)
  const retained=structuredClone((h.preset===1?before[h.key]:before.exts[h.key]).slice(1))
  const saved=await a.saveOnly({...a.initialValues!(h.record._id),[h.key]:retained},h.record._id)
  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr)
  expect(sent._id).toBe(before._id);assertSlots(h,sent,retained);assertSlots(h,h.record,retained)
  expect(h.reader.isCurrent(saved)).toBe(true)
  assertSlots(h,h.reader.currentFormOriginal!(saved,h.record._id),retained)
  expect(sent.exts.preserved).toEqual(before.exts.preserved);expect(h.other).toEqual(other)
  for(const [key,value] of Object.entries(before)){
    if(key===h.key||key==='exts'||['updateTime','updateUser','updateUserName'].includes(key))continue
    expect(sent[key]).toEqual(value)
  }
  noAuxiliaryCommands(h)
})

it.each(['map','survey-root','survey-exts'] as const)('%s retains complete old per-item metadata while an unrelated field edits',async route=>{
  const h=fixture(route,false,true),before=structuredClone(h.record),other=structuredClone(h.other),a=await edit(h)
  const saved=await a.saveOnly({...a.initialValues!(h.record._id),[h.keys[0]]:14.5},h.record._id)
  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr),original=h.preset===1?before[h.key]:before.exts[h.key]
  assertSlots(h,sent,original);assertSlots(h,h.record,original)
  expect(h.reader.isCurrent(saved)).toBe(true)
  assertSlots(h,h.reader.currentFormOriginal!(saved,h.record._id),original)
  expect(original[1]).toMatchObject({rotation:0,sourceInfo:{keep:'original'}})
  expect(sent.exts.preserved).toEqual(before.exts.preserved);expect(h.other).toEqual(other)
  noAuxiliaryCommands(h)
})

it.each(['map','survey-root','survey-exts'] as const)('%s optional final removal persists explicit [] rather than omission',async route=>{
  const h=fixture(route),a=await edit(h)
  const saved=await a.saveOnly({...a.initialValues!(h.record._id),[h.key]:[]},h.record._id)
  expect(h.writes).toHaveLength(1)
  assertSlots(h,JSON.parse(h.writes[0].body.dataStr),[]);assertSlots(h,h.record,[])
  expect(h.reader.isCurrent(saved)).toBe(true)
  assertSlots(h,h.reader.currentFormOriginal!(saved,h.record._id),[])
  noAuxiliaryCommands(h)
})

it('required file cannot remove its final old reference',async()=>{
  const h=fixture('map',true),a=await edit(h),before=structuredClone(h.record)
  await expect(a.saveOnly({...a.initialValues!(h.record._id),[h.key]:[]},h.record._id)).rejects.toThrow()
  expect(h.record).toEqual(before);zero(h)
})

it.each(['arbitrary-url','other-record','trim-old-metadata'] as const)('old-reference-only editor refuses %s without an upload receipt',async mode=>{
  const h=fixture('map',false,mode==='trim-old-metadata'),a=await edit(h),initial=a.initialValues!(h.record._id)!
  const forged=mode==='other-record'?structuredClone(h.other.exts[h.key])
    :mode==='trim-old-metadata'?[file('a'),file('b')]:[file('not-in-original')]
  await expect(a.saveOnly({...initial,[h.key]:forged},h.record._id)).rejects.toThrow()
  zero(h)
})

it('node-readonly attachment is preserved while another field saves; removal refuses',async()=>{
  const h=fixture(),before=structuredClone(h.record)
  h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id]
  h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id]
  h.grant.fieldIds=[h.fields[0]._id];h.setGrant()
  const a=await edit(h),initial=a.initialValues!(h.record._id)!
  await expect(a.saveOnly({...initial,[h.key]:[]},h.record._id)).rejects.toThrow();zero(h)
  await a.saveOnly({...initial,[h.keys[0]]:14.5},h.record._id)
  expect(h.writes).toHaveLength(1);assertSlots(h,h.record,before.exts[h.key]);noAuxiliaryCommands(h)
})

it('hidden optional attachment cannot be cleared by an explicit [] sentinel',async()=>{
  const h=fixture(),raw=h.fields[0]
  h.fields.push({...raw,_id:'media-visibility-field',name:'mediaVisibility',type:'text',required:'0',preset:1})
  Object.assign(h.fields[1],{showType:'3',showField:'mediaVisibility',showValue:'show',showFieldPreset:1})
  h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id);h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill];h.setGrant()
  for(const r of [h.record,h.other])r.mediaVisibility='hide'
  const a=await edit(h),initial=a.initialValues!(h.record._id)!,before=structuredClone(h.record)
  await expect(a.saveOnly({...initial,[h.key]:[]},h.record._id)).rejects.toThrow();zero(h)
  await a.saveOnly({...initial,[h.keys[0]]:14.5},h.record._id)
  expect(h.writes).toHaveLength(1);assertSlots(h,h.record,before.exts[h.key]);noAuxiliaryCommands(h)
})

it.each(['slot-conflict','metadata','readonly','actor','unlisted'] as const)('fresh %s change refuses stale attachment removal before dispatch',async mode=>{
  const h=fixture(),a=await edit(h),initial=a.initialValues!(h.record._id)!
  if(mode==='slot-conflict')h.record.exts[h.key]=[file('conflicting-copy')]
  if(mode==='metadata')h.fields[1].frontEndConfig=JSON.stringify({fileType:'video'})
  if(mode==='readonly'){
    h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id]
    h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id]
  }
  if(mode==='actor')h.changeActor()
  if(mode==='unlisted')h.unlist()
  await expect(a.saveOnly({...initial,[h.key]:[]},h.record._id)).rejects.toThrow()
  zero(h)
})

// No controller cancel API exists. Actual Panel cancel/back/reentry must be
// exercised through r1-normal-edit-cancel; dropping a local test variable is
// not a cancellation test. No upload receipt or remote deletion is synthesized.

// Append to the retained-media controller contract file; reuse its helpers.
// No upload receipt is created. Every mutation below is a synthetic input.

it('retained-order: deleting a middle item preserves the exact remaining order',async()=>{
  const h=fixture('map',false,true)
  const originals=[...structuredClone(h.record.exts[h.key]),file('c')]
  h.record[h.key]=structuredClone(originals)
  h.record.exts[h.key]=structuredClone(originals)
  const a=await edit(h),keep=[originals[0],originals[2]]
  const saved=await a.saveOnly({...a.initialValues!(h.record._id),[h.key]:keep},h.record._id)
  expect(h.writes).toHaveLength(1)
  assertSlots(h,JSON.parse(h.writes[0].body.dataStr),keep)
  assertSlots(h,h.reader.currentFormOriginal!(saved,h.record._id),keep)
  noAuxiliaryCommands(h)
})

it.each(['copy','reorder','nested-metadata','same-url-other-object'] as const)(
  'retained-order: rejects %s instead of accepting URL membership alone',async mode=>{
    const h=fixture('map',false,true),a=await edit(h)
    const original=structuredClone(h.record.exts[h.key])
    const candidate=mode==='copy'?[original[0],structuredClone(original[0])]
      :mode==='reorder'?[original[1],original[0]]
      :mode==='nested-metadata'?[original[0],{...original[1],sourceInfo:{keep:'changed'}}]
      :[original[0],{...original[1],name:'substituted-name.jpg'}]
    const before=structuredClone(h.record),other=structuredClone(h.other)
    await expect(a.saveOnly({...a.initialValues!(h.record._id),[h.key]:candidate},h.record._id)).rejects.toThrow()
    expect(h.record).toEqual(before);expect(h.other).toEqual(other);zero(h)
  },
)

it.each([null,{},'https://files.example.invalid/a.jpg',0])(
  'retained-order: an array original cannot be replaced by non-array %j',async value=>{
    const h=fixture(),a=await edit(h),before=structuredClone(h.record)
    await expect(a.saveOnly({...a.initialValues!(h.record._id),[h.key]:value},h.record._id)).rejects.toThrow()
    expect(h.record).toEqual(before);zero(h)
  },
)

it('retained-order: omitted attachment key preserves the original, unlike explicit [] clear',async()=>{
  const h=fixture('map',false,true),before=structuredClone(h.record),a=await edit(h)
  const values={...a.initialValues!(h.record._id),[h.keys[0]]:14.5}
  delete values[h.key]
  const saved=await a.saveOnly(values,h.record._id)
  expect(h.writes).toHaveLength(1)
  assertSlots(h,JSON.parse(h.writes[0].body.dataStr),before.exts[h.key])
  assertSlots(h,h.reader.currentFormOriginal!(saved,h.record._id),before.exts[h.key])
  noAuxiliaryCommands(h)
})

it('retained-order: readonly characterization never repairs pre-existing duplicate references',async()=>{
  const h=fixture(),duplicate=[file('a'),file('a')]
  h.record[h.key]=structuredClone(duplicate)
  h.record.exts[h.key]=structuredClone(duplicate)
  const before=structuredClone(h.record),snapshot=await h.load()
  expect(h.record).toEqual(before)
  const raw=h.reader.currentFormOriginal!(snapshot,h.record._id)!
  assertSlots(h,raw,duplicate)
  zero(h)
  // This proves read preservation only. It grants no edit capability and
  // does not assert that removing one indistinguishable duplicate is legal.
})

it.each(['root','exts'] as const)('preserves witnessed Map %s-only presence without inventing a mirror',async slot=>{
  const h=fixture(),kept=structuredClone(h.record.exts[h.key].slice(1))
  if(slot==='root')delete h.record.exts[h.key]
  else delete h.record[h.key]
  const a=await edit(h)
  await a.saveOnly({...a.initialValues!(h.record._id),[h.key]:kept},h.record._id)
  expect(h.writes).toHaveLength(1)
  expect(Object.hasOwn(h.record,h.key)).toBe(slot==='root')
  expect(Object.hasOwn(h.record.exts,h.key)).toBe(slot==='exts')
  expect(slot==='root'?h.record[h.key]:h.record.exts[h.key]).toEqual(kept)
  noAuxiliaryCommands(h)
})

it.each(['null','absent'] as const)('does not turn an original %s file slot into an editable empty list',async mode=>{
  const h=fixture()
  if(mode==='null')h.record[h.key]=h.record.exts[h.key]=null
  else{delete h.record[h.key];delete h.record.exts[h.key]}
  const before=structuredClone(h.record),s=await h.load()
  expect(h.provider().forSnapshot(s)?.canEdit?.(h.record._id)??false).toBe(false)
  expect(h.record).toEqual(before);zero(h)
})

it('pins old nested metadata across the pre-dispatch fresh read',async()=>{
  const h=fixture('map',false,true),a=await edit(h),values=a.initialValues!(h.record._id)!
  h.record[h.key][1].sourceInfo.keep='server changed'
  h.record.exts[h.key][1].sourceInfo.keep='server changed'
  const files=values[h.key];if(!Array.isArray(files))throw Error('Expected reader attachment array')
  await expect(a.saveOnly({...values,[h.key]:files.slice(1)},h.record._id)).rejects.toThrow()
  zero(h)
})

it('keeps an uncertain simulated attachment save locked rather than replaying it',async()=>{
  const h=fixture(),a=await edit(h),values=a.initialValues!(h.record._id)!
  h.afterDispatch(()=>{throw Error('synthetic response lost after dispatch')})
  const next={...values,[h.key]:[]}
  await expect(a.saveOnly(next,h.record._id)).rejects.toThrow()
  expect(h.writes).toHaveLength(1)
  await expect(a.saveOnly(next,h.record._id)).rejects.toThrow()
  expect(h.writes).toHaveLength(1);noAuxiliaryCommands(h)
})

it('keeps the existing v4 first-create receipt decoder strict for extra-key arrays',async()=>{
  const h=fixture('map',false,true)
  for(const f of h.fields)Object.assign(f,{multiple:false,showField:'',showValue:'',showFieldPreset:0,calculateConfig:'',exts:{}})
  h.grant.version=4;h.grant.profile='dynamic-file-first';h.grant.operations=['create']
  delete h.grant.recordIds;delete h.grant.synthetic;h.setGrant()
  await expect(h.load()).rejects.toThrow()
  zero(h)
})

it('does not reroute a v4 canonical Map file read through the Survey-only validator',async()=>{
  const h=fixture('map')
  for(const f of h.fields)Object.assign(f,{multiple:false,showField:'',showValue:'',showFieldPreset:0,calculateConfig:'',exts:{}})
  h.grant.version=4;h.grant.profile='dynamic-file-first';h.grant.operations=['create']
  delete h.grant.recordIds;delete h.grant.synthetic;h.setGrant()
  const snapshot=await h.load()
  expect(snapshot.records).toHaveLength(2)
  expect(snapshot.records[0].values?.[h.key]).toEqual(h.record.exts[h.key])
  zero(h)
})
