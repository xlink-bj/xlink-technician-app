import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNormalFormsActionProvider, parseR1FormsGrant } from '@app/r1-forms-authorization'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
import { normalizeR1RepeatValues, projectR1RepeatFields } from '@features/work-orders/r1-repeat-form'
import { normalizeR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { formDefinition } from '@adapters/api/read-models/form'

const transport = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => transport }))
const scope = { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }
const origin = 'http://127.0.0.1:5189'
const grant = { version: 2, scope, expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['area','mode','note','detail'], operations: ['create', 'append', 'edit', 'save_finish', 'complete'], recordIds: ['a', 'b'] }

function fixture(existing = false) {
  let session = { sessionRef: 'synthetic', user: { id: 'u' }, currentRole: { id: 'r' } }
  let exts: any = { formList: [{ _id: 'a', formDefId: 'e', state: 1, unknownRow: { keep: ['a'] } }, { _id: 'deleted', formDefId: 'e', state: -1, unknownDeleted: true }, { _id: 'b', formDefId: 'e', state: 1 }], unknownNode: { keep: [1, 'yes'] } }
  if(!existing)exts.formList=exts.formList.filter((r:any)=>r.state===-1)
  const metadata:any[]=[
    {fieldId:'area',valueKey:'area',type:'digit',label:'Area',required:true,readOnly:false,preset:false},
    {fieldId:'mode',valueKey:'mode',type:'radio',label:'Mode',required:true,readOnly:false,preset:false,options:[{value:'hide',label:'Hide'},{value:'show',label:'Show'}]},
    {fieldId:'note',valueKey:'note',type:'text',label:'Note',required:false,readOnly:false,preset:false,visibility:{kind:'equals',path:'mode',value:'show'}},
    {fieldId:'detail',valueKey:'detail',type:'text',label:'Detail',required:true,readOnly:false,preset:false,visibility:{kind:'equals',path:'mode',value:'show'}},
    ...Array.from({length:55},(_,i)=>({fieldId:'ro-'+i,valueKey:'protected'+i,type:i%2?'file':'unknown',label:'Protected'+i,required:true,readOnly:i%2===0,preset:true})),
  ]
  const readonlyIds=metadata.filter(f=>f.fieldId.startsWith('ro-')&&!f.readOnly).map(f=>f.fieldId)
  const raw = (id: string, area: number) => ({ _id: id, tenantId: 't', sid: 's', nodeId: 'n', workflowId: 'w', formDefId: 'e', smodule: 'serviceAppointment', state: 1, area, mode:'show',note:'old note',detail:'old detail',protected0:{retain:'object'},formTitle:'Existing title',exts: { area, mode:'show',note:'old note',detail:'old detail',protected1:['original'],retainedNested: { keep: true } }, retainedTop: ['keep'] })
  const rows = new Map<string, any>([['a', raw('a', 2)], ['b', raw('b', 4)]])
  const originals = new WeakMap<R1NodeFormsSnapshot, Map<string, any>>()
  let current: R1NodeFormsSnapshot | null = null
  let failure = '', onRead: ((count: number) => void) | undefined, reads = 0
  let ack: any = null, transition = true, purpose: 'survey' | 'appointment' | undefined
  const env: Record<string, any> = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: 't', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true', VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_R1_FORMS_ACTIONS: 'true', VITE_XLINK_R1_FORMS_GRANT: JSON.stringify(grant) }
  function snapshot(): R1NodeFormsSnapshot {
    const active = exts.formList.filter((slot: any) => slot.state !== -1).map((slot: any) => rows.get(slot._id)).filter(Boolean)
    const s = { workOrderId: 's', node: { id: 'n', runId: 'w', formDefinitionId: 'e', sourceNodeType: 'forms', nodeTypeEvidence: 'runtime_node_def', lifecycle: 'active', handlers: [{ kind: 'user', userId: 'u' }], visibility: { evidenceState: 'verified', viewableRoleIds: ['r'] }, formFieldIdsReadOnly: [...readonlyIds] }, definition: { id:'e',fields:structuredClone(metadata) }, fillableFieldIds: ['area','mode','note','detail'], records: active.map((r: any) => ({ id: r._id, definitionId: 'e', workflowRunId: 'w', values:Object.fromEntries(metadata.filter(f=>!f.fieldId.startsWith('ro-')).filter(f=>Object.hasOwn(r.exts??{},f.valueKey)||Object.hasOwn(r,f.valueKey)).map(f=>[f.valueKey,Object.hasOwn(r.exts??{},f.valueKey)?r.exts[f.valueKey]:r[f.valueKey]])) })) } as unknown as R1NodeFormsSnapshot

    ;(s.definition as any).purpose=purpose
    originals.set(s, new Map(active.map((r: any) => [r._id, structuredClone(r)])))
    return s
  }
  current = snapshot()
  const base = current
  const reader = {
    enabled: () => true, isCurrent: (s: R1NodeFormsSnapshot) => current === s, clear: () => { current = null },
    currentFormsExts: (s: R1NodeFormsSnapshot) => s === current ? structuredClone(exts) : null,
    currentFormOriginal: (s: R1NodeFormsSnapshot, id: string) => s === current ? originals.get(s)?.get(id) ?? null : null,
    load: vi.fn(async () => {
      current = null; reads++; onRead?.(reads)
      if (failure === 'preflight') throw Error('synthetic read failed')
      current = snapshot()
      return current
    }),
    confirmFormsCompletion: vi.fn(async () => {
      if (!transition) throw Error('synthetic transition not proven')
      current = null
      return { transitionVerified: true as const }
    }),
  }
  transport.execute.mockImplementation(async (request: any) => {
    if (request.path === 'biz/extForm/upsert/e') {
      if (failure === 'upsert') throw Error('synthetic unknown ACK')
      const body = JSON.parse(request.body.dataStr), id = body._id ?? 'created'
      // A full replacement, deliberately NO Mock merging of old business data.
      rows.set(id, { ...body, _id: id })
      return ack ?? { success: true, status: 1, data: { _id: id } }
    }
    if (request.path === 'workflowNode/updateExts/n') {
      if (failure === 'exts') throw Error('synthetic EXTS outcome unknown')
      exts = structuredClone(request.jsonBody)
      return { success: true, status: 1 }
    }
    if (request.path === 'workflow/process') return { success: true, status: 1 }
    throw Error(`Unknown intercepted command: ${request.path}`)
  })
  const provider = () => createNormalFormsActionProvider({ env, origin, reader, auth: { getCurrentSession: () => session as never } })
  return { base, reader, env, rows, provider, snapshot:()=>{current=snapshot();return current}, metadata, readonlyIds, get current() { return current }, get exts() { return exts },
    setAck: (value: unknown) => { ack = value }, setFault: (value: string) => { failure = value },
    setPurpose: (value:'survey'|'appointment') => {purpose=value},
    onRead: (fn: (count: number) => void) => { onRead = fn }, setTransition: (value: boolean) => { transition = value },
    changeUser: () => { session = { ...session, user: { id: 'foreign' } } },
    setGrant: (patch: Record<string, unknown>) => { env.VITE_XLINK_R1_FORMS_GRANT = JSON.stringify({ ...grant, ...patch }) },
  }
}
const paths = () => transport.execute.mock.calls.map(([request]) => request.path)
function fillReferences(h: ReturnType<typeof fixture>, total: number, deleted = 1) {
  const slots = h.exts.formList as Record<string, unknown>[]
  while (slots.length < total) {
    const id = `capacity-${slots.length}`
    slots.push({ _id: id, formDefId: 'e', state: 1, unknownCapacityMetadata: { preserve: id } })
    h.rows.set(id, { ...structuredClone(h.rows.get('a')), _id: id })
  }
  for (const [index, slot] of slots.entries()) {
    slot.state = index >= total - deleted ? -1 : 1
    const id = String(slot._id)
    if (!h.rows.has(id)) h.rows.set(id, { ...structuredClone(h.rows.get('a')), _id: id })
  }
}
beforeEach(() => { installLocalFixtureBrowser(); transport.execute.mockReset() })
afterEach(() => vi.unstubAllGlobals())


describe('v2 normal forms known scalar subset with 59 metadata rows',()=>{
 it('creates through the real provider/actions using only authorized scalar keys',async()=>{
  const h=fixture(),a=h.provider().forSnapshot(h.base)!
  expect(a).not.toBeNull();expect(a.validateDraft!({area:3,mode:'hide'})).toBe(true)
  const after=await a.saveOnly({area:3,mode:'hide'})
  expect(after.records).toHaveLength(1)
  const body=JSON.parse(transport.execute.mock.calls[0]![0].body.dataStr)
  expect(body).toMatchObject({area:3,mode:'hide',exts:{area:3,mode:'hide'}})
  expect(Object.keys(body).some(k=>k.startsWith('protected'))).toBe(false)
  expect(paths()).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
 })

})

it('holds uncertain after upsert when a known condition changes without changing this payload',async()=>{
 const h=fixture(),a=h.provider().forSnapshot(h.base)!,execute=transport.execute.getMockImplementation()!
 transport.execute.mockImplementationOnce(async req=>{const ack=await execute(req);h.metadata[2].visibility={kind:'oneOf',path:'mode',values:['show']};return ack})
 await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow()
 expect(paths()).toEqual(['biz/extForm/upsert/e']);expect(a.locked()).toBe(true)
})

describe('bounded metadata and authorization failures',()=>{
 it.each([59,200])('accepts %i explicit metadata rows, projecting only four authorized fields',count=>{
  const h=fixture();while(h.metadata.length<count){const i=h.metadata.length;h.metadata.push({fieldId:'extra-'+i,valueKey:'extra'+i,type:'unknown',required:true,readOnly:true,preset:true})}
  const s=h.snapshot();expect(normalizeR1RepeatValues(s,{area:0,mode:'hide'})).toEqual({area:0,mode:'hide'})
  expect(projectR1RepeatFields(s,{mode:'hide'}).map(f=>f.valueKey)).toEqual(['area','mode','note','detail'])
 })
 it.each([
  ['201 rows',(h:any)=>{while(h.metadata.length<201){const i=h.metadata.length;h.metadata.push({fieldId:'extra-'+i,valueKey:'extra'+i,readOnly:true})}}],
  ['missing ID',(h:any)=>{h.metadata[10].fieldId=''}],
  ['duplicate ID',(h:any)=>{h.metadata[10].fieldId='area'}],
  ['duplicate key with conflicting preset',(h:any)=>{h.metadata[10].valueKey='area';h.metadata[10].preset=true}],
  ['reserved identity',(h:any)=>{h.metadata[10].valueKey='workflowRunId'}],
  ['unknown provider',(h:any)=>{h.metadata[0].valueOption='unverified'}],
  ['unknown type',(h:any)=>{h.metadata[0].type='file'}],
  ['unknown required',(h:any)=>{delete h.metadata[0].required}],
  ['unknown condition',(h:any)=>{h.metadata[0].visibility={kind:'script',script:'unknown'}}],
  ['readonly condition dependency',(h:any)=>{h.metadata[0].visibility={kind:'exists',path:'protected0'}}],
  ['lost readonly evidence',(h:any)=>{h.readonlyIds.splice(0,1)}],
 ] as const)('rejects %s before any transport',async(_label,change)=>{
  const h=fixture();change(h);const a=h.provider().forSnapshot(h.snapshot())
  if(a){expect(a.validateDraft!({area:3,mode:'hide'})).toBe(false);await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow()}
  expect(paths()).toEqual([])
 })
 it.each([{area:3,mode:'hide',protected0:'write'},{area:3,mode:'hide',unknown:'write'},{area:3,mode:'show'},{area:3,mode:'invalid'},{area:[],mode:'hide'},{area:3,mode:'hide',note:'hidden'}])('rejects invalid submitted keys/values %j',draft=>{
  const h=fixture();expect(h.provider().forSnapshot(h.base)!.validateDraft!(draft)).toBe(false);expect(paths()).toEqual([])
 })
 it('keeps repeat and v1 authorization closed',()=>{
  const h=fixture();const s=structuredClone(h.base);(s.node as any).sourceNodeType='repeat'
  expect(()=>normalizeR1RepeatValues(s,{area:3,mode:'hide'})).toThrow()
  h.setGrant({version:1});expect(h.provider().forSnapshot(h.base)).toBeNull()
 })
 it('does not bypass the specialized Appointment contract',()=>{
  const h=fixture(),s=structuredClone(h.base);(s.definition as any).purpose='appointment'
  expect(()=>normalizeR1RepeatValues(s,{area:3,mode:'hide'})).toThrow()
 })
 it('revokes on identity/grant changes before first dispatch',async()=>{
  const h=fixture(),a=h.provider().forSnapshot(h.base)!;h.onRead(()=>h.changeUser())
  await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow();expect(paths()).toEqual([])
 })
})

it.each(['readonly','preset','fillable','exts'] as const)('stops the second write on fresh %s drift',async kind=>{
 const h=fixture(),a=h.provider().forSnapshot(h.base)!,execute=transport.execute.getMockImplementation()!
 transport.execute.mockImplementationOnce(async req=>{const ack=await execute(req)
  if(kind==='readonly')h.metadata[0].readOnly=true
  if(kind==='preset')h.metadata[0].preset=true
  if(kind==='fillable')h.setGrant({fieldIds:['area','mode']})
  if(kind==='exts')h.exts.unknownNode={changed:true}
  return ack
 })
 await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow()
 expect(paths()).toEqual(['biz/extForm/upsert/e']);expect(a.locked()).toBe(true)
})
it('rejects pure initial-to-fresh condition drift before the first write',async()=>{
 const h=fixture(),a=h.provider().forSnapshot(h.base)!
 h.onRead(count=>{if(count===1)h.metadata[2].visibility={kind:'oneOf',path:'mode',values:['show']}})
 await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow();expect(paths()).toEqual([])
})
it.each([49,50])('keeps the full formList capacity boundary at %i (including deleted)',async total=>{
 const h=fixture();fillReferences(h,total);h.setGrant({recordIds:h.exts.formList.filter((r:any)=>r.state!==-1).map((r:any)=>r._id)});const a=h.provider().forSnapshot(h.snapshot())!
 if(total===49){await a.saveOnly({area:3,mode:'hide'});expect(h.exts.formList).toHaveLength(50);expect(paths()).toHaveLength(2)}
 else{await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow();expect(paths()).toEqual([])}
})
it('rejects 51 writable keys despite legal metadata capacity',()=>{
 const h=fixture();for(let i=4;i<51;i++){h.metadata[i].type='text';h.metadata[i].readOnly=false;h.metadata[i].required=false}
 h.readonlyIds.splice(0);const s=h.snapshot();(s as any).fillableFieldIds=h.metadata.slice(0,51).map(f=>f.fieldId)
 expect(()=>normalizeR1RepeatValues(s,{area:3,mode:'hide'})).toThrow();expect(paths()).toEqual([])
})

it.each([undefined,'com.fsgo.entity.basic.Survey','unknown.Class','java.util.HashMap','generic'])('refuses existing edit without positive non-typed provenance: %s',async className=>{
 const h=fixture(true);if(className!==undefined)h.rows.get('a')._class=className
 const a=h.provider().forSnapshot(h.base)!
 expect(()=>normalizeR1FormsEditValues(h.base,h.rows.get('a'),{area:6})).toThrow()
 expect(a.canEdit!('a')).toBe(false)
 await expect(a.saveOnly({area:6},'a')).rejects.toThrow();expect(paths()).toEqual([])
})
it.each(['missing','mixed','wrong','forged-generic'])('does not treat mapper colName %s as generic proof',kind=>{
 const h=fixture(true),rows=h.metadata.map(f=>({...f,_id:f.fieldId,name:f.valueKey,extId:'e',tenantId:'t',state:1,
  ...(kind==='mixed'?{colName:f.fieldId==='area'?'survey':'appointment'}:kind==='wrong'?{colName:'other'}:kind==='forged-generic'?{colName:'generic'}:{})}))
 const d=formDefinition({data:rows},'e' as never);expect(d.purpose).toBeUndefined()
 const s={...h.base,definition:d};expect(()=>normalizeR1FormsEditValues(s,h.rows.get('a'),{area:6})).toThrow()
})
it.each(['before','after'] as const)('rejects purpose-only drift %s first upsert with unchanged mapped fields',async when=>{
 const h=fixture(),a=h.provider().forSnapshot(h.base)!,fields=JSON.stringify(h.base.definition.fields)
 if(when==='before')h.onRead(count=>{if(count===1)h.setPurpose('survey')})
 else{const execute=transport.execute.getMockImplementation()!;transport.execute.mockImplementationOnce(async req=>{const ack=await execute(req);h.setPurpose('survey');return ack})}
 await expect(a.saveOnly({area:3,mode:'hide'})).rejects.toThrow()
 expect(JSON.stringify(h.current?.definition.fields)).toBe(fields)
 expect(paths()).toEqual(when==='before'?[]:['biz/extForm/upsert/e'])
 if(when==='after')expect(a.locked()).toBe(true)
})
it('inherits optional empty-array omission without writing an array',()=>{
 const h=fixture();expect(normalizeR1RepeatValues(h.base,{area:3,mode:'show',note:[],detail:'known'})).toEqual({area:3,mode:'show',detail:'known'})
})
