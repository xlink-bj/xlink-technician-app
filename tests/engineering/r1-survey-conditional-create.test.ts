import { r1NormalDraftValues } from '@features/work-orders/r1-normal-form-drafts'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { surveyHeightConditionIssue } from '@adapters/api/read-models/survey-height-condition'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { normalizeR1RepeatValues, projectR1RepeatFields, updateR1FormDraftValue } from '@features/work-orders/r1-repeat-form'
import { createR1RepeatActions, type R1RepeatScope } from '@app/r1-repeat-actions'
import { createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { SessionSnapshot } from '@shared/ports'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { asOpaqueId } from '@shared/types'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

const providerTransport = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => providerTransport }))

const definitionId = '7971040108398070730'
const scope: R1RepeatScope = { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work', workflowRunId: 'run', runtimeNodeId: 'node', formDefinitionId: definitionId }
const tree = [
  { value: '3', label: 'Synthetic window', children: [{ value: '31', label: 'Edge', children: [{ value: '311', label: 'Inner', children: [] }] }] },
  { value: '1', label: 'Other', children: [{ value: '11', label: 'Leaf', children: [] }] },
]
const values = () => ({ part: ['3', '31', '311'], length: '2.345', width: '3', planeArea: 7.04, memo: 'synthetic', height: '' })
function baseSnapshot(): R1NodeFormsSnapshot {
  const rows = ['part', 'length', 'width', 'planeArea', 'memo'].map(name => ({
    _id: name, extId: definitionId, colName: 'survey', name, nameDisp: name, state: 1,
    type: name === 'part' ? 'cascade' : name === 'memo' ? 'textarea' : 'digit',
    required: name !== 'memo', readOnly: 0, preset: 1, multiple: false,
    frontEndConfig: '{}', showType: '1', showList: ['2', '4'],
    ...(name === 'part' ? { valueOption: 'parts' } : {}),
  }))
  const definition = formDefinition({ data: rows }, asOpaqueId<'FormDefinitionId'>(definitionId))
  return { workOrderId: 'work', node: workflowNode({
    _id: 'node', workflowId: 'run', state: 0, handlerIds: ['role'],
    nodeDef: { nodeType: 'repeat', formDefId: definitionId, formFieldIdsFill: rows.map(r => r._id), formFieldIdsReadOnly: [] },
  }), definition: { ...definition, fields: definition.fields!.map(f => f.valueKey === 'part' ? { ...f, options: structuredClone(tree) } : f) },
  fillableFieldIds: rows.map(r => r._id), records: [] }
}
const session = { sessionRef: 'synthetic', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot
function harness() {
  const initial = snapshot()
  let current = structuredClone(initial)
  const commands = { execute: vi.fn(async (request: ApiCommandRequest) => {
    const body = JSON.parse(String(request.body?.dataStr))
    if (body.height === '') delete body.height
    current = { ...current, records: [{ id: asOpaqueId<'FormDataId'>('saved'), definitionId: current.definition.id,
      workflowRunId: asOpaqueId<'WorkflowRunId'>('run'), values: Object.fromEntries(Object.keys(values()).map(k => [k, structuredClone(body[k])])) }] }
    return { success: true, status: 1, data: { _id: 'saved' } }
  }) }
  const read = vi.fn(async () => current)
  const original = vi.fn(() => Object.fromEntries(Object.entries(current.records[0]?.values ?? {}).filter(([,value])=>value!==undefined)))
  const input = { hasSurveyConditionalSource: () => true, initialSnapshot: initial, readOriginal: original, env: { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: 'tenant',
    VITE_XLINK_API_BASE_URL: 'http://127.0.0.1:5189/xlink/wm', VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' },
    origin: 'http://127.0.0.1:5189', getSession: () => session, hasExactGrant: () => true, readLatest: read, transport: commands }
  const env = { ...input.env, VITE_XLINK_R1_REPEAT_ACTIONS: 'true',
    VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({ version: 1, scope, fieldIds: initial.fillableFieldIds,
      expiresAt: '2099-01-01T00:00:00Z', operations: ['create', 'complete'] }) }
  const provider = () => {
    let lease = initial
    const sourceProof = Object.freeze({})
    providerTransport.execute.mockImplementation(commands.execute)
    return createNormalRepeatActionProvider({ env, origin: input.origin, auth: { getCurrentSession: () => session },
      reader: { currentSurveyConditionalSource: () => sourceProof, isCurrentSurveyConditionalSource: (s,p) => s === lease && p === sourceProof, enabled: () => true, isCurrent: value => value === lease, clear: () => {},
        currentFormOriginal: () => original(),
        async load() { lease = await read(); return lease } } }).forSnapshot(initial)!
  }
  return { initial, commands, read, original, actions: createR1RepeatActions(input), current: () => current,
    replace: (s: R1NodeFormsSnapshot) => { current = s }, input, env, provider }
}
beforeEach(() => { installLocalFixtureBrowser(); providerTransport.execute.mockReset() })
afterEach(() => vi.unstubAllGlobals())

function snapshot(): R1NodeFormsSnapshot {
  const base = baseSnapshot()
  const height = formDefinition({ data: [{ _id: 'height', extId: definitionId, colName: 'survey', name: 'height', nameDisp: 'Synthetic conditional height', type: 'digit', required: '1', readOnly: 0, preset: 1, multiple: false,
    frontEndConfig: '{}', showType: '3', showField: 'part', showValue: '', exts: {showValue:[['3','31','311']]}, showList: ['2','4'], state: 1 }] }, asOpaqueId<'FormDefinitionId'>(definitionId)).fields![0]!
  return { ...base, definition: { ...base.definition, fields: [...base.definition.fields!, height] }, fillableFieldIds: [...base.fillableFieldIds!, 'height'] }
}

function normalHarness() {
  const fields=['part','length','width','planeArea','memo','height'].map(name=>({_id:name,tenantId:'tenant',extId:definitionId,colName:'survey',name,nameDisp:name,state:1,type:name==='part'?'cascade':name==='memo'?'textarea':'digit',required:name!=='memo',readOnly:0,preset:1,multiple:false,showList:['2','4'],showType:name==='height'?'3':'1',frontEndConfig:'{}',...(name==='part'?{valueOption:'parts'}:{}),...(name==='height'?{showField:'part',showValue:'',exts:{showValue:[['3','31','311']]}}:{})}))
  const ext:any={_id:definitionId,tenantId:'tenant',state:1,type:'1',colName:'survey'}
  const actor:any={...session}, env:any={...harness().input.env,VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_REPEAT_ACTIONS:'true',VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify({version:1,scope,expiresAt:'2099-01-01T00:00:00Z',fieldIds:fields.map(f=>f._id),operations:['create','complete']})}
  const node={_id:'node',workflowId:'run',tenantId:'tenant',workflowFormDataId:'work',workflowFormColName:'serviceAppointment',state:0,handlerIds:['role'],nodeDef:{nodeType:'repeat',formDefId:definitionId,formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
  let saved:any=null
  const commands={execute:vi.fn(async(request:ApiCommandRequest)=>{saved={...JSON.parse(String(request.body?.dataStr)),_id:'saved',tenantId:'tenant'};if(saved.height==='')delete saved.height;return {success:true,status:1,data:{_id:'saved'}}})}
  providerTransport.execute.mockImplementation(commands.execute)
  const rawRead=vi.fn(async(request:any)=>{
    if(request.path==='basic/serviceAppointment/queryById/work')return {success:true,status:1,data:{serviceAppointment:{_id:'work',tenantId:'tenant',workflowId:'run',state:1},workflow:{_id:'run',tenantId:'tenant',formDataId:'work',state:0},workflowNode:[node]}}
    if(request.path==='biz/ext/queryById.do')return structuredClone(ext)
    if(request.path==='biz/extField/query')return {data:structuredClone(fields),total:6,page:1,size:50}
    if(request.path==='i/code/selectMultistageCode.do'){
      const convert=(options:typeof tree):any=>options.map(o=>({value:o.value,name:o.label,children:convert(o.children as typeof tree)}))
      return [{type:'parts',children:convert(tree)}]
    }
    if(request.path==='biz/extForm/query/'+definitionId){const data=saved?[structuredClone(saved)]:[];return {data,total:data.length,page:1,size:request.body.rows,dataCount:data.length}}
    throw Error('Unexpected synthetic read')
  })
  const auth={getCurrentSession:()=>actor}
  const reader=createNormalNodeFormsReader({auth,read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>true,getDynamicCodeOptions:vi.fn()},tenantId:'tenant',env,origin:'http://127.0.0.1:5189',transport:{execute:rawRead}})
  const provider=createNormalRepeatActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189'})
  return {reader,provider,ext,fields,actor,commands,rawRead}
}

describe('synthetic conditional Survey first create', () => {
  it('persists and restores the actual controller hidden-clear value without disabling its valid draft',async()=>{
    const f=normalHarness(),s=(await f.reader.load('work','node'))!,a=f.provider.forSnapshot(s)!
    const old={...values(),height:'9.5'},hidden=updateR1FormDraftValue(s,old,'part',['1','11'])
    expect(hidden.height).toBe('');expect(projectR1RepeatFields(s,hidden).find(x=>x.valueKey==='height')?.visible).toBe(false)
    const stored=r1NormalDraftValues(s,a,hidden)
    expect(stored).toEqual(Object.fromEntries(Object.entries(hidden).filter(([key])=>key!=='height')))
    expect(r1NormalDraftValues(s,a,stored,true)).toEqual(stored)
    expect(()=>r1NormalDraftValues(s,a,hidden,true)).toThrow()
    expect(normalizeR1RepeatValues(s,stored).height).toBe('')
    const reopened=updateR1FormDraftValue(s,stored,'part',['3','31','311'])
    expect(Object.hasOwn(reopened,'height')).toBe(false);expect(()=>normalizeR1RepeatValues(s,reopened)).toThrow()
    expect(f.commands.execute).not.toHaveBeenCalled()
  })
  it('does not turn hidden empty compatibility into permission for nonempty/null/undefined/unknown/readonly values',async()=>{
    const f=normalHarness(),s=(await f.reader.load('work','node'))!,a=f.provider.forSnapshot(s)!
    const hidden=updateR1FormDraftValue(s,{...values(),height:'9.5'},'part',['1','11'])
    for(const value of ['9.5',null,undefined,[],false,0])expect(()=>r1NormalDraftValues(s,a,{...hidden,height:value})).toThrow()
    expect(()=>r1NormalDraftValues(s,a,{...hidden,unknown:''})).toThrow()
    const readonly={...s,node:{...s.node,formFieldIdsReadOnly:['height']}}
    expect(()=>r1NormalDraftValues(readonly,a,hidden)).toThrow()
    const drift={...s,definition:{...s.definition,fields:s.definition.fields!.map(x=>x.valueKey==='height'?{...x,preset:false}:x)}}
    expect(()=>r1NormalDraftValues(drift,a,hidden)).toThrow()
    expect(f.commands.execute).not.toHaveBeenCalled()
  })

  it('does not omit a visible empty value even when the controller supplies its omission ID',async()=>{
    const f=normalHarness(),s=(await f.reader.load('work','node'))!,a=f.provider.forSnapshot(s)!
    const hidden=updateR1FormDraftValue(s,{...values(),height:'9.5'},'part',['1','11'])
    const hinted={...a,projectFields:(values:Readonly<Record<string,unknown>>)=>projectR1RepeatFields(s,values)
      .map(field=>field.valueKey==='height'?{...field,visible:true,supported:true}:field)}
    expect(a.draftOmittedFieldIds!(s,hidden)).toEqual(['height'])
    expect(r1NormalDraftValues(s,hinted,hidden)).toHaveProperty('height','')
    expect(f.commands.execute).not.toHaveBeenCalled()
  })

  it('requires the current provider omission capability and rejects copied or revoked sources',async()=>{
    const f=normalHarness(),s=(await f.reader.load('work','node'))!,a=f.provider.forSnapshot(s)!
    const hidden=updateR1FormDraftValue(s,{...values(),height:'9.5'},'part',['1','11'])
    expect(a.draftOmittedFieldIds!(s,hidden)).toEqual(['height'])
    expect(()=>r1NormalDraftValues(s,{...a,draftOmittedFieldIds:undefined},hidden)).toThrow()
    expect(()=>r1NormalDraftValues({...s},a,hidden)).toThrow()
    await f.reader.load('work','node')
    expect(()=>r1NormalDraftValues(s,a,hidden)).toThrow()
    expect(f.commands.execute).not.toHaveBeenCalled()
  })

  it('clears the hidden height when part changes and never recalculates area on selection', () => {
    const s = snapshot(), old = { ...values(), height: '9.5' }
    const next = updateR1FormDraftValue(s, old, 'part', ['1','11'])
    expect(next).toEqual({ ...old, part: ['1','11'], height: '' })
    expect(old.height).toBe('9.5')
    expect(projectR1RepeatFields(s,next).find(f=>f.valueKey==='height')?.visible).toBe(false)
  })
  it('retains visible height and requires it before saving', () => {
    const s=snapshot()
    expect(()=>normalizeR1RepeatValues(s,values())).toThrow()
    expect(normalizeR1RepeatValues(s,{...values(),height:'9.5'})).toEqual({...values(),length:2.345,width:3,height:9.5})
  })
  it('sends exactly the R1 empty root after clearing, rejecting a hidden stale numeric value', () => {
    const s=snapshot(), hidden={...values(),part:['1','11'],height:''}
    expect(normalizeR1RepeatValues(s,hidden)).toEqual({...hidden,length:2.345,width:3})
    expect(()=>normalizeR1RepeatValues(s,{...hidden,height:'9.5'})).toThrow()
  })
  it('hidden to visible permits refill and hidden input cannot be forged through a draft event',()=>{
    const s=snapshot(), hidden=updateR1FormDraftValue(s,{...values(),height:'8'},'part',['1','11'])
    expect(()=>updateR1FormDraftValue(s,hidden,'height','9')).toThrow()
    const shown=updateR1FormDraftValue(s,hidden,'part',['3','31','311'])
    expect(shown.height).toBe('')
    expect(()=>normalizeR1RepeatValues(s,shown)).toThrow()
    const filled=updateR1FormDraftValue(s,shown,'height','4.5')
    expect(normalizeR1RepeatValues(s,filled).height).toBe(4.5)
  })
  it.each(['prefix','sibling','numeric','unknown','empty','equals','source','duplicate','readonly','not-fillable','readonly-node','optional','hidden-mobile','extra-field'])('rejects %s conditional configuration',kind=>{
    const s=structuredClone(snapshot()) as any,h=s.definition.fields.find((f:any)=>f.valueKey==='height')
    if(kind==='prefix')h.visibility.values=[['3']]
    if(kind==='sibling')h.visibility.values=[['3','11']]
    if(kind==='numeric')h.visibility.values=[[3,'31','311']]
    if(kind==='unknown')h.visibility.values=[['missing']]
    if(kind==='empty')h.visibility.values=[]
    if(kind==='equals')h.visibility={kind:'equals',path:'part',value:['3','31','311']}
    if(kind==='source')h.visibility.path='memo'
    if(kind==='duplicate')h.visibility.values.push(['3','31','311'])
    if(kind==='readonly')h.readOnly=true
    if(kind==='not-fillable')s.fillableFieldIds=s.fillableFieldIds.filter((x:string)=>x!=='height')
    if(kind==='readonly-node')s.node.formFieldIdsReadOnly=['height']
    if(kind==='optional')h.required=false
    if(kind==='hidden-mobile')h.mobileDetailHidden=true
    if(kind==='extra-field')s.definition.fields.push({...h,fieldId:'unknown',valueKey:'unknown'})
    expect(()=>normalizeR1RepeatValues(s,{...values(),height:'9.5'})).toThrow()
    expect(()=>updateR1FormDraftValue(s,values(),'part',['1','11'])).toThrow()
  })
  it('does not match a path prefix and accepts numeric zero when visible',()=>{
    const s=snapshot()
    expect(()=>updateR1FormDraftValue(s,values(),'part',['3','31'])).toThrow()
    expect(normalizeR1RepeatValues(s,{...values(),height:0}).height).toBe(0)
  })
  it('first save uses empty wire height and authoritative missing root after typed Java conversion',async()=>{
    const h=harness(), after=await h.actions.saveOnly(scope,{...values(),part:['1','11']})
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(h.commands.execute.mock.calls[0]![0].body?.dataStr))).toMatchObject({height:'',part:['1','11']})
    expect(after.records[0]?.values?.height).toBeUndefined()
  })
  it.each(['height-root','height-exts','part-root','bad-exts'])('ACK with stale %s becomes uncertain and cannot replay',async kind=>{
    const h=harness();h.original.mockImplementation(()=>kind==='height-root'?{part:['1','11'],height:9.5}:kind==='height-exts'?{part:['1','11'],exts:{height:9.5}}:kind==='part-root'?{part:['3','31','311']}:{part:['1','11'],exts:[]} as any)
    await expect(h.actions.saveOnly(scope,{...values(),part:['1','11']})).rejects.toThrow()
    expect(h.actions.locked(scope)).toBe(true)
    await expect(h.actions.saveOnly(scope,{...values(),part:['1','11']})).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it.each(['before','after'])('conditional metadata drift %s dispatch is refused without a second command',async when=>{
    const h=harness();let calls=0;h.read.mockImplementation(async()=>{
      calls++;const s=structuredClone(h.current()) as any
      if((when==='before'&&calls===1)||(when==='after'&&calls===2))s.definition.fields.find((f:any)=>f.valueKey==='height').visibility.values=[['1','11']]
      return s
    })
    await expect(h.actions.saveOnly(scope,{...values(),part:['1','11']})).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(when==='before'?0:1)
    if(when==='after'){
      await expect(h.actions.saveOnly(scope,{...values(),part:['1','11']})).rejects.toThrow()
      expect(h.commands.execute).toHaveBeenCalledTimes(1)
    }
  })
  it('initial records cannot disappear to confer first-create authority',async()=>{
    const h=harness();const initial={...snapshot(),records:[{id:'old',definitionId,workflowRunId:'run',values:values()}]} as any
    const a=createR1RepeatActions({...h.input,initialSnapshot:initial})
    await expect(a.saveOnly(scope,{...values(),part:['1','11']})).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })

  it('create closure loses authority if a v2 edit-only grant replaces it',async()=>{
    const h=harness(),a=h.provider()
    h.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify({version:2,scope,expiresAt:'2099-01-01T00:00:00Z',fieldIds:h.initial.fillableFieldIds,recordIds:['saved'],operations:['edit']})
    await expect(a.saveOnly({...values(),part:['1','11']})).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('grant field revocation between fresh read and dispatch prevents a write',async()=>{
    const h=harness(),a=h.provider()
    h.read.mockImplementationOnce(async()=>{
      queueMicrotask(()=>queueMicrotask(()=>{h.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify({...JSON.parse(h.env.VITE_XLINK_R1_REPEAT_GRANT),fieldIds:['part','length','width','planeArea','memo','replacement']})}))
      return h.current()
    })
    await expect(a.saveOnly({...values(),part:['1','11']})).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('captures the caller ordered part before the first await',async()=>{
    const h=harness(),v={...values(),part:['1','11']},p=h.actions.saveOnly(scope,v)
    v.part[0]='3'
    await p
    expect(JSON.parse(String(h.commands.execute.mock.calls[0]![0].body?.dataStr)).part).toEqual(['1','11'])
  })

  it('visible typed height needs an authoritative numeric root',async()=>{
    const h=harness();await h.actions.saveOnly(scope,{...values(),height:'4.5'})
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it.each(['missing','null','string','different','bad-exts','different-exts','opaque-exts'])('rejects visible height raw %s even if display projection agrees',async kind=>{
    const h=harness();h.original.mockImplementation(()=>{
      const r:any={part:values().part,height:4.5,exts:{}}
      if(kind==='missing')delete r.height
      if(kind==='null')r.height=null
      if(kind==='string')r.height='4.5'
      if(kind==='different')r.height=99
      if(kind==='bad-exts')r.exts=[]
      if(kind==='different-exts')r.exts.height=99
      if(kind==='opaque-exts')r.exts.height={unsupported:true}
      return r
    })
    await expect(h.actions.saveOnly(scope,{...values(),height:'4.5'})).rejects.toThrow()
    expect(h.actions.locked(scope)).toBe(true)
    await expect(h.actions.saveOnly(scope,{...values(),height:'4.5'})).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it.each(['root-exts','config-exts','source','mode','malformed-exts','calculation'])('refuses raw %s condition contradictions before projection',kind=>{
    const raw:any={extId:definitionId,colName:'survey',name:'height',showType:'3',showField:'part',showValue:[['3','31','311']],frontEndConfig:'{}'}
    if(kind==='root-exts')raw.exts={showValue:[['1','11']]}
    if(kind==='config-exts')raw.frontEndConfig=JSON.stringify({exts:{showValue:[['1','11']]}})
    if(kind==='source')raw.frontEndConfig=JSON.stringify({showField:'memo'})
    if(kind==='mode')raw.frontEndConfig=JSON.stringify({showType:'2'})
    if(kind==='malformed-exts')raw.exts=[]
    if(kind==='calculation')raw.calculateConfig='unverified'
    expect(surveyHeightConditionIssue(raw)).toBeTruthy()
    expect(surveyHeightConditionIssue({...raw,extId:'another-definition'})).toBeUndefined()
    expect(surveyHeightConditionIssue({...raw,colName:'another-entity'})).toBeUndefined()
  })
  it('accepts R1 empty-root/EXTS fallback only when the effective condition is explicit',()=>{
    const raw={extId:definitionId,colName:'survey',name:'height',showType:'3',showField:'part',showValue:'',exts:{showValue:[['3','31','311']]},frontEndConfig:'{}'}
    expect(surveyHeightConditionIssue(raw)).toBeUndefined()
    expect(formDefinition({data:[{_id:'height',type:'digit',...raw}]},asOpaqueId<'FormDefinitionId'>(definitionId)).fields![0]?.visibility).toEqual({kind:'oneOf',path:'part',values:[['3','31','311']]})
  })

  it('new typed slice cannot write with no source-proof verifier',async()=>{
    const h=harness(),a=createR1RepeatActions({...h.input,hasSurveyConditionalSource:undefined})
    await expect(a.saveOnly(scope,{...values(),part:['1','11']})).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('rejects duplicate conditional keys before JSON parsing can erase them',()=>{
    const raw={extId:definitionId,colName:'survey',name:'height',showField:'part',showValue:[['3','31','311']],frontEndConfig:'{"showField":"part","showValue":[["1","11"]],"showValue":[["3","31","311"]]}'}
    expect(surveyHeightConditionIssue(raw)).toBeTruthy()
  })

  it('reader proof cannot be copied, attached to a cloned snapshot, or reused after reread',async()=>{
    const h=normalHarness(),s=await h.reader.load('work','node'),p=h.reader.currentSurveyConditionalSource!(s)!
    expect(p).toBeTruthy()
    expect(h.reader.isCurrentSurveyConditionalSource!(s,p)).toBe(true)
    expect(h.reader.isCurrentSurveyConditionalSource!(s,{...p})).toBe(false)
    expect(h.reader.isCurrentSurveyConditionalSource!(structuredClone(s),p)).toBe(false)
    await h.reader.load('work','node')
    expect(h.reader.isCurrentSurveyConditionalSource!(s,p)).toBe(false)
  })
  it.each(['type','collection','alias','field-collection','provider','condition','duplicate-json'])('actual reader refuses initial/fresh %s provenance',async kind=>{
    for(const fresh of [false,true]){
      const h=normalHarness();let a:ReturnType<typeof h.provider.forSnapshot>=null
      if(fresh)a=h.provider.forSnapshot(await h.reader.load('work','node'))
      if(kind==='type')h.ext.type='0'
      if(kind==='collection')h.ext.colName='other'
      if(kind==='alias')h.ext.formDefinitionId='other'
      if(kind==='field-collection')h.fields[5]!.colName='other'
      if(kind==='provider')(h.fields[0] as any).valueOption='unverified'
      if(kind==='condition')(h.fields[5] as any).exts={showValue:[['1','11']]}
      if(kind==='duplicate-json')h.fields[5]!.frontEndConfig='{"showField":"part","showValue":[["1","11"]],"showValue":[["3","31","311"]]}'
      let rejected=false
      try{if(!a)a=h.provider.forSnapshot(await h.reader.load('work','node'));if(!a)rejected=true;else await a.saveOnly({...values(),height:'4.5'})}catch{rejected=true}
      expect(rejected).toBe(true);expect(h.commands.execute).not.toHaveBeenCalled()
    }
  })
  it('actual reader/source proof supports first-save and then invalidates on identity loss',async()=>{
    const h=normalHarness(),s=await h.reader.load('work','node'),a=h.provider.forSnapshot(s)!
    await a.saveOnly({...values(),part:['1','11']});expect(h.commands.execute).toHaveBeenCalledTimes(1)
    const current=await h.reader.load('work','node'),p=h.reader.currentSurveyConditionalSource!(current)!
    h.actor.sessionRef='changed'
    expect(h.reader.isCurrentSurveyConditionalSource!(current,p)).toBe(false)
  })

  it.each(['handler','readonly','records','condition'])('issued action cannot wash an invalid initial %s lease through a fresh read',async kind=>{
    const h=normalHarness(),s:any=await h.reader.load('work','node'),a=h.provider.forSnapshot(s)!,proof=h.reader.currentSurveyConditionalSource!(s)!
    if(kind==='handler')s.node.handlers=[{kind:'unclassified',value:'other'}]
    if(kind==='readonly')s.node.formFieldIdsReadOnly=['height']
    if(kind==='records')s.records.push({id:'already',definitionId,workflowRunId:'run',values:{}})
    if(kind==='condition')s.definition.fields.find((f:any)=>f.valueKey==='height').visibility.values=[['1','11']]
    expect(h.reader.isCurrentSurveyConditionalSource!(s,proof)).toBe(false)
    const before=h.rawRead.mock.calls.length
    await expect(a.saveOnly({...values(),height:'4.5'})).rejects.toThrow()
    expect(h.rawRead.mock.calls.length).toBe(before)
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('only explicitly empty calculation objects are accepted',()=>{
    const raw={extId:definitionId,colName:'survey',name:'height',showType:'3',showField:'part',showValue:[['3','31','311']]}
    for(const calculateConfig of ['{}','{ }',{},'',null,undefined])expect(surveyHeightConditionIssue({...raw,calculateConfig})).toBeUndefined()
    for(const calculateConfig of ['{"formula":"unknown"}','[]',[],1,'{"x":1,"x":2}'])expect(surveyHeightConditionIssue({...raw,calculateConfig})).toBeTruthy()
  })

})
