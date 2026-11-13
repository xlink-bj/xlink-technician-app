import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import {actionFormSchemaFor,ACTION_FORM_SURFACE} from '@features/work-orders/action-form-schema'
import {evaluateFieldState,normalizeSubmission} from '@runtimes/dynamic-form'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

function conditional(mode='hide',detail='private original'){
 const h=existingRecordFixture();h.mapRoute()
 const raw=h.fields[0],colName=h.ext.colName
 const providerId='configured-mode'
 h.fields.splice(0,h.fields.length,
  {
   ...raw,_id:'mode-field',name:'renamedMode',
   type:'radio',multiple:false,preset:1,required:'1',
   valueOption:providerId,colName,
  },
  {
   ...raw,_id:'detail-field',name:'renamedDetail',
   type:'text',multiple:false,preset:0,required:'1',
   // R1 common.showType reads root only when showFieldPreset is explicit.
   // Original independent fixture omitted it despite a root-only source;
   // the unmodified evidence remains in .review/cloud-finite-dynamic-contracts-20261113/.
   showType:'3',showField:'renamedMode',showFieldPreset:1,showValue:'show',colName,
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
  r.renamedMode=mode
  r.renamedDetail=detail
  r.renamedNote='unchanged'
  r.exts.renamedDetail=detail
 }
 let options:Record<string,string>={show:'Show',hide:'Hide'}
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

async function edit(h:ReturnType<typeof conditional>){
 const snapshot=await h.load()
 const a=h.provider().forSnapshot(snapshot)
 expect(snapshot.definition.fields?.[1]?.visibility).toBeDefined()
 expect(a?.canEdit?.(h.record._id)).toBe(true)
 if(!a)throw Error('Actual conditional existing-edit capability is not implemented')
 return a
}

it('existing visibility makes only the shown detail required; hidden omission is a patch decision, not raw deletion',async()=>{
 const h=conditional(),snapshot=await h.load()
 const field=actionFormSchemaFor(snapshot.definition.fields![1]!)
 expect(evaluateFieldState(field,{
  values:{renamedMode:'show'},surface:ACTION_FORM_SURFACE,
 })).toMatchObject({visible:true,required:true})
 expect(evaluateFieldState(field,{
  values:{renamedMode:'hide'},surface:ACTION_FORM_SURFACE,
 })).toMatchObject({visible:false,required:false})
 expect(normalizeSubmission({
  fields:[field],
  values:{renamedMode:'show',renamedDetail:''},
  surface:ACTION_FORM_SURFACE,
 }).ok).toBe(false)
 const hidden=normalizeSubmission({
  fields:[field],
  values:{renamedMode:'hide',renamedDetail:''},
  surface:ACTION_FORM_SURFACE,
 })
 expect(hidden).toMatchObject({ok:true,value:{values:{}}})
 expect(h.writes).toEqual([])
})

it('visible required text saves through the actual same-ID controller',async()=>{
 const h=conditional('show','before'),a=await edit(h)
 const other=structuredClone(h.other)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedDetail:'updated',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.renamedDetail).toBe('updated')
 expect(h.record.exts.renamedDetail).toBe('updated')
 expect(h.other).toEqual(other)
})

it('visible required empty text is rejected before dispatch',async()=>{
 const h=conditional('show','before'),a=await edit(h)
 const before=structuredClone(h.record)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),renamedDetail:'',
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
 expect(h.record).toEqual(before)
})

it('hidden required empty text does not block editing an unrelated note',async()=>{
 const h=conditional('hide',''),a=await edit(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedNote:'changed',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.renamedNote).toBe('changed')
 expect(h.record.renamedDetail).toBe('')
 expect(h.record.exts.renamedDetail).toBe('')
})

it('an existing hidden value and opaque EXTS remain unchanged after unrelated editing',async()=>{
 const h=conditional(),before=structuredClone(h.record),a=await edit(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedNote:'changed',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.renamedDetail).toBe(before.renamedDetail)
 expect(h.record.exts).toEqual(before.exts)
})

it('changing the controlling field to hide never silently clears its old detail',async()=>{
 const h=conditional('show','retain this')
 const before=structuredClone(h.record),a=await edit(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),renamedMode:'hide',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.renamedMode).toBe('hide')
 expect(h.record.renamedDetail).toBe('retain this')
 expect(h.record.exts).toEqual(before.exts)
})

it.each(['forged',''])(
 'an explicit changed hidden value %j is refused, not silently saved',
 async value=>{
  const h=conditional(),before=structuredClone(h.record),a=await edit(h)
  await expect(a.saveOnly({
   ...a.initialValues!(h.record._id),renamedDetail:value,
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
  expect(h.record).toEqual(before)
 },
)

it('revealing a previously hidden empty required field rechecks requiredness',async()=>{
 const h=conditional('hide',''),a=await edit(h)
 await expect(a.saveOnly({
  ...a.initialValues!(h.record._id),renamedMode:'show',
 },h.record._id)).rejects.toThrow()
 expect(h.writes).toEqual([])
})

it('revealing and supplying the now-visible field can save without another writer',async()=>{
 const h=conditional('hide',''),a=await edit(h)
 await a.saveOnly({
  ...a.initialValues!(h.record._id),
  renamedMode:'show',renamedDetail:'now provided',
 },h.record._id)
 expect(h.writes).toHaveLength(1)
 expect(h.record.renamedDetail).toBe('now provided')
 expect(h.record.exts.renamedDetail).toBe('now provided')
})

it.each(['provider','metadata'] as const)(
 'fresh condition %s changes invalidate the old editor',async kind=>{
  const h=conditional(),a=await edit(h)
  const values=a.initialValues!(h.record._id)!
  if(kind==='provider'){
   h.setOptions({show:'New show label',hide:'Hide'})
  }else{
   h.fields[1].showValue='hide'
  }
  await expect(a.saveOnly({
   ...values,renamedNote:'must not dispatch',
  },h.record._id)).rejects.toThrow()
  expect(h.writes).toEqual([])
 },
)

it('an unrecognized source visibility mode stays explicitly unsupported',async()=>{
 const h=conditional()
 h.fields[1].showType='999'
 const snapshot=await h.load()
 expect(snapshot.definition.fields?.[1]?.unsupportedReason).toMatch(/visibility/)
 expect(h.provider().forSnapshot(snapshot)).toBeNull()
 expect(h.writes).toEqual([])
})
