import * as Vue from 'vue'
import {component,node,renderer,find,settle,text as nodeText} from '../support/normal-appointment-experience-harness'
import {r1RepeatActionsKey} from '@features/work-orders/r1-repeat-actions-port'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import {projectR1RecordReadFields} from '@features/work-orders/r1-record-read-fields'
import {fieldControlFor} from '@features/work-orders/field-control-registry'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())
// Explicit synthetic no-calculation configuration. Production's three active
// configurations and their provider response/actor ownership are NOT verified.
function fixture(key='renamedPackage',preset=1){
 const h=existingRecordFixture();h.mapRoute()
 const config:any={url:'biz/projPackage/query.do',params:{_all:1},label:'name',value:'_id'}
 Object.assign(h.fields[1],{name:key,type:'bizSelect',valueOption:'projPackage',multiple:true,preset,frontEndConfig:JSON.stringify(config)})
 const options:any[]=[{_id:'old-package',name:'Old package',tenantId:h.scope.tenantId,state:1,opaquePrice:'not-a-price-source'},
  {_id:'new-package',name:'New package',tenantId:h.scope.tenantId,state:1}]
 for(const r of[h.record,h.other]){r[key]='old-package';r[key+'Label']='Historical package label';if(!preset)r.exts[key]='old-package'}
 const execute=h.transport.execute.getMockImplementation()!,providerCalls:any[]=[]
 let total:number|undefined
 h.transport.execute.mockImplementation(async request=>{
  if(request.path==='biz/projPackage/query.do'){providerCalls.push(structuredClone(request));return{data:structuredClone(options),total:total??options.length,page:1}}
  return execute(request)
 })
 const refreshConfig=()=>{h.fields[1].frontEndConfig=JSON.stringify(config)}
 const open=async()=>{const s=await h.load(),a=h.provider().forSnapshot(s);expect(a?.canEdit?.(h.record._id)).toBe(true);return {s,a:a!}}
 return{...h,key,config,options,providerCalls,open,refreshConfig,setTotal:(v:number)=>{total=v}}
}
it.each([['renamedPackage',1],['differentOption',0]] as const)('type0 %s saves scalar + source-derived root Label without DTO/field-name hardcoding',async(key,preset)=>{
 const h=fixture(key,preset),before=structuredClone(h.record),other=structuredClone(h.other),{s,a}=await h.open()
 const field=s.definition.fields!.find(f=>f.fieldId===h.fields[1]._id)!
 expect(field.type).toBe('bizSelect');expect(field.multiple).toBe(false)
 expect(fieldControlFor(field,'standard')).toBe('single-choice')
 expect(h.fields[1].multiple).toBe(true) // Raw source is not rewritten to invent another contract.
 const saved=await a.saveOnly({...a.initialValues!(h.record._id),[h.key]:'new-package'},h.record._id)
 expect(h.writes).toHaveLength(1);const sent=JSON.parse(h.writes[0].body.dataStr)
 expect(sent._id).toBe(before._id);expect(sent[h.key]).toBe('new-package');expect(sent[h.key+'Label']).toBe('New package')
 if(!preset)expect(sent.exts[h.key]).toBe('new-package');else expect(Object.hasOwn(sent.exts,h.key)).toBe(false)
 expect(Object.hasOwn(sent.exts,h.key+'Label')).toBe(false)
 expect(sent.exts.preserved).toEqual(before.exts.preserved);expect(h.other).toEqual(other);expect(h.reader.isCurrent(saved)).toBe(true)
 expect(h.reader.currentFormOriginal!(saved,h.record._id)![h.key+'Label']).toBe('New package')
 expect(projectR1RecordReadFields(saved.definition,saved.records.find(r=>r.id===h.record._id)!).find(f=>f.valueKey===h.key)).toMatchObject({text:'New package',unavailable:false})
 expect(h.providerCalls.every(r=>r.path==='biz/projPackage/query.do'&&r.body.tenantId===h.scope.tenantId&&r.body._all===1&&r.body['is:state|integer#and']===1)).toBe(true)
 expect(h.events.some(p=>/queryWithRank|workflow\/process|updateExts|upToken/.test(p))).toBe(false)
})
it('unchanged ID preserves historical Label and opaque data when another field saves',async()=>{
 const h=fixture(),before=structuredClone(h.record),{a}=await h.open()
 await a.saveOnly({...a.initialValues!(h.record._id),[h.keys[0]]:21},h.record._id)
 expect(h.record[h.key]).toBe(before[h.key]);expect(h.record[h.key+'Label']).toBe(before[h.key+'Label']);expect(h.record.exts).toEqual(before.exts)
})
it.each(['unknown','array','number','forged-label','unproved-clear'] as const)('rejects %s before dispatch',async mode=>{
 const h=fixture(),{a}=await h.open(),initial=a.initialValues!(h.record._id)!
 const value=mode==='unknown'?'not-listed':mode==='array'?['new-package']:mode==='number'?123:mode==='unproved-clear'?'':'new-package'
 const draft={...initial,[h.key]:value,...(mode==='forged-label'?{[h.key+'Label']:'Caller label'}:{})}
 expect(a.validateDraft!(draft,h.record._id)).toBe(false);await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow();expect(h.writes).toHaveLength(0)
})
it.each(['label','membership','actor','metadata'] as const)('fresh %s change revokes a selected candidate with zero commands',async mode=>{
 const h=fixture(),{a}=await h.open(),draft={...a.initialValues!(h.record._id),[h.key]:'new-package'}
 if(mode==='label')h.options[1].name='Changed after editing'
 if(mode==='membership')h.options.pop()
 if(mode==='actor')h.changeActor()
 if(mode==='metadata'){h.config.params['in:serviceType|array#and']='new-filter';h.refreshConfig()}
 await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow();expect(h.writes).toHaveLength(0)
})
it.each(['foreign','duplicate','incomplete','wrong-id'] as const)('rejects %s provider envelopes without filtering or coercion',async mode=>{
 const h=fixture()
 if(mode==='foreign')h.options[1].tenantId='other-tenant'
 if(mode==='duplicate')h.options[1]._id=h.options[0]._id
 if(mode==='incomplete')h.setTotal(3)
 if(mode==='wrong-id')h.options[1]._id=123
 await expect(h.load()).rejects.toThrow();expect(h.writes).toHaveLength(0)
})
it.each(['public-url','pricing-url','label-alias','identity-param','calculation','typed-survey'] as const)('refuses %s before provider dispatch',async mode=>{
 const h=fixture()
 if(mode==='public-url')h.config.url='https://untrusted.invalid/query'
 if(mode==='pricing-url')h.config.url='biz/projPackage/queryWithRank'
 if(mode==='label-alias')h.config.label='price'
 if(mode==='identity-param')h.config.params.tenantId='other'
 if(mode==='calculation')h.fields[1].calculateConfig={unverified:'actual rule must be established'}
 if(mode==='typed-survey'){h.ext.type='1';h.ext.colName='survey';for(const f of h.fields)f.colName='survey'}
 h.refreshConfig();await expect(h.load()).rejects.toThrow();expect(h.providerCalls).toHaveLength(0);expect(h.writes).toHaveLength(0)
})
it.each(['declared-label-field','exts-label','object-label'] as const)('refuses %s storage ambiguity while retaining original',async mode=>{
 const h=fixture(),before=structuredClone(h.record)
 if(mode==='declared-label-field'){h.fields.push({...h.fields[0],_id:'label-field',name:h.key+'Label',type:'text'});h.node.nodeDef.formFieldIdsReadOnly.push('label-field')}
 if(mode==='exts-label')h.record.exts[h.key+'Label']='Ambiguous extension label'
 if(mode==='object-label')h.record[h.key+'Label']={opaque:true}
 const s=await h.load(),a=h.provider().forSnapshot(s)
 expect(a?.canEdit?.(h.record._id)??false).toBe(false);expect(h.writes).toHaveLength(0)
 expect(h.other).toMatchObject({_id:'saved-other'})
 expect(h.record.exts.preserved).toEqual(before.exts.preserved)
})
it('forwards only the exact approved literal service filter and never borrows a pricing route',async()=>{
 const h=fixture();h.config.params['in:serviceType|array#and']='synthetic-a,synthetic-b';h.refreshConfig();await h.open()
 expect(h.providerCalls[0].body).toEqual({_all:1,'in:serviceType|array#and':'synthetic-a,synthetic-b',tenantId:h.scope.tenantId,'is:state|integer#and':1})
})
it('readonly business selection cannot edit ID or Label while unrelated changes preserve both',async()=>{
 const h=fixture(),before=structuredClone(h.record);h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id];h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id];h.grant.fieldIds=[h.fields[0]._id];h.setGrant()
 const {a}=await h.open(),initial=a.initialValues!(h.record._id)!
 await expect(a.saveOnly({...initial,[h.key]:'new-package'},h.record._id)).rejects.toThrow()
 await a.saveOnly({...initial,[h.keys[0]]:18},h.record._id);expect(h.record[h.key]).toBe(before[h.key]);expect(h.record[h.key+'Label']).toBe(before[h.key+'Label'])
})

it('readonly historical companion metadata stays opaque while another field saves',async()=>{
 const h=fixture();h.record[h.key+'Label']={historical:['opaque',0]};h.record.exts[h.key+'Label']={keep:true}
 const before=structuredClone(h.record);h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id];h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id];h.grant.fieldIds=[h.fields[0]._id];h.setGrant()
 const {a}=await h.open();await a.saveOnly({...a.initialValues!(h.record._id),[h.keys[0]]:18},h.record._id)
 expect(h.record[h.key+'Label']).toEqual(before[h.key+'Label']);expect(h.record.exts[h.key+'Label']).toEqual(before.exts[h.key+'Label'])
})

it('read display does not promote unresolved or multi-value business metadata to a scalar option',async()=>{
 const h=fixture(),{s}=await h.open(),record=s.records.find(r=>r.id===h.record._id)!
 for(const change of [{multiple:true},{valueOption:'other-provider'},{options:undefined}]){
  const definition={...s.definition,fields:s.definition.fields!.map(f=>f.fieldId===h.fields[1]._id?{...f,...change}:f)}
  expect(projectR1RecordReadFields(definition,record).find(f=>f.valueKey===h.key)?.unavailable).toBe(true)
 }
})
it.each(['ack-label','readback-label'] as const)('wrong %s remains uncertain and never repeats the same command',async mode=>{
 const h=fixture(),{a}=await h.open(),draft={...a.initialValues!(h.record._id),[h.key]:'new-package'}
 if(mode==='ack-label')h.afterDispatch(()=>{h.record[h.key+'Label']='Not selected'})
 else{const execute=h.commands.execute.getMockImplementation()!;h.commands.execute.mockImplementationOnce(async request=>{const ack=await execute(request);h.record[h.key+'Label']='Not selected';return ack})}
 await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow();await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow();expect(h.writes).toHaveLength(1)
})

it('empty current options do not block preserving a node-readonly business field during an unrelated edit',async()=>{
 const h=fixture(),before=structuredClone(h.record);h.options.splice(0);h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id];h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id];h.grant.fieldIds=[h.fields[0]._id];h.setGrant()
 const {a}=await h.open();await a.saveOnly({...a.initialValues!(h.record._id),[h.keys[0]]:23},h.record._id)
 expect(h.record[h.key]).toEqual(before[h.key]);expect(h.record[h.key+'Label']).toEqual(before[h.key+'Label']);expect(h.record.exts).toEqual(before.exts)
})

it('explicit selection back to the original ID updates its verified Label, without rewriting untouched historical labels',async()=>{
 const h=fixture(),{a}=await h.open(),id=h.record._id
 expect(a.beginEdit!(id)).toBe(true)
 a.recordFieldSelection!(id,h.key,'new-package')
 a.recordFieldSelection!(id,h.key,'old-package')
 await a.saveOnly({...a.initialValues!(id),[h.key]:'old-package'},id)
 expect(h.writes).toHaveLength(1);expect(h.record[h.key]).toBe('old-package');expect(h.record[h.key+'Label']).toBe('Old package')
})
it('a fresh editor forgets cancelled selection intent',async()=>{
 const h=fixture(),{a}=await h.open(),id=h.record._id
 expect(a.beginEdit!(id)).toBe(true);a.recordFieldSelection!(id,h.key,'old-package')
 expect(a.beginEdit!(id)).toBe(true)
 await a.saveOnly({...a.initialValues!(id),[h.keys[0]]:23},id)
 expect(h.record[h.key+'Label']).toBe('Historical package label')
})
it.each([undefined,null,'',{},'{}'])('empty calculation shell %j plus inert config strings preserves the exact query body',async calculateConfig=>{
 const h=fixture();h.fields[1].calculateConfig=calculateConfig
 Object.assign(h.config,{errorMsg:'Historical display string',sortField:'name',sortOrder:'asc'});h.refreshConfig()
 const {a}=await h.open();await a.saveOnly({...a.initialValues!(h.record._id),[h.key]:'new-package'},h.record._id)
 expect(h.providerCalls[0].body).toEqual({_all:1,tenantId:h.scope.tenantId,'is:state|integer#and':1})
 expect(h.record[h.key+'Label']).toBe('New package')
})
it.each(['{', '[]','{"rule":"do not execute"}',[],false,0])('rejects nonempty or malformed calculation %j before provider',async value=>{
 const h=fixture();h.fields[1].calculateConfig=value
 await expect(h.load()).rejects.toThrow();expect(h.providerCalls).toHaveLength(0);expect(h.writes).toHaveLength(0)
})
it.each(['errorMsg','sortField','sortOrder'])('rejects behavioral/object %s config without provider dispatch',async key=>{
 const h=fixture();h.config[key]={untrusted:'not a literal string'};h.refreshConfig()
 await expect(h.load()).rejects.toThrow();expect(h.providerCalls).toHaveLength(0)
})

it('readonly business companion cannot alias a granted text field: refuse before dispatch',async()=>{
 const h=fixture(),labelKey=h.key+'Label'
 Object.assign(h.fields[0],{name:labelKey,type:'text',preset:0})
 h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id];h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id]
 h.grant.fieldIds=[h.fields[0]._id];h.setGrant()
 for(const r of [h.record,h.other])r.exts[labelKey]=r[labelKey]
 const before=structuredClone(h.record),other=structuredClone(h.other),s=await h.load(),a=h.provider().forSnapshot(s)
 let refused=false
 try{if(!a?.canEdit?.(h.record._id))refused=true;else await a.saveOnly({...a.initialValues!(h.record._id),[labelKey]:'Edited declared text'},h.record._id)}catch{refused=true}
 expect(refused).toBe(true);expect(h.writes).toHaveLength(0);expect(h.record).toEqual(before);expect(h.other).toEqual(other)
})

it('choice intent uses the current draft after a hidden dependency becomes visible',async()=>{
 const h=fixture();Object.assign(h.fields[0],{type:'text'});Object.assign(h.fields[1],{showType:'3',showField:h.keys[0],showValue:'show',showFieldPreset:1})
 for(const r of[h.record,h.other])r[h.keys[0]]='hidden'
 const {a}=await h.open(),id=h.record._id;expect(a.beginEdit!(id)).toBe(true)
 const draft={...a.initialValues!(id),[h.keys[0]]:'show'}
 a.recordFieldSelection!(id,h.key,'new-package',draft)
 a.recordFieldSelection!(id,h.key,'old-package',draft)
 await a.saveOnly({...draft,[h.key]:'old-package'},id)
 expect(h.writes).toHaveLength(1);expect(h.record[h.key+'Label']).toBe('Old package')
})
it('a rejected hidden choice event records no intent or command',async()=>{
 const h=fixture();Object.assign(h.fields[0],{type:'text'});Object.assign(h.fields[1],{showType:'3',showField:h.keys[0],showValue:'show',showFieldPreset:1})
 for(const r of[h.record,h.other])r[h.keys[0]]='hidden'
 const {a}=await h.open(),id=h.record._id;expect(a.beginEdit!(id)).toBe(true)
 const draft={...a.initialValues!(id)}
 expect(()=>a.recordFieldSelection!(id,h.key,'old-package',draft)).toThrow()
 await a.saveOnly({...draft,[h.keys[0]]:'still-hidden'},id)
 expect(h.writes).toHaveLength(1);expect(h.record[h.key+'Label']).toBe('Historical package label')
})

it('actual Panel catches a rejected choice event without committing its proposed value',async()=>{
 const h=fixture(),{s,a}=await h.open(),root=node('root'),Panel=component('R1NodeFormsReadPanel')
 const recordFieldSelection=vi.fn((..._args:unknown[])=>{throw Error('synthetic event-time revocation')})
 const actions={...a,recordFieldSelection},reader={enabled:()=>true,isCurrent:(v:unknown)=>v===s,load:async()=>s,clear:vi.fn()}
 const errors:unknown[]=[]
 const app=renderer.createApp({render:()=>Vue.h(Panel,{reader,workOrderId:h.scope.workOrderId,runtimeNodeId:h.scope.runtimeNodeId,actorScope:'synthetic-actor'})})
 app.config.errorHandler=e=>errors.push(e);app.provide(r1RepeatActionsKey,{forSnapshot:()=>actions});app.mount(root)
 try{
  find(root,n=>n.type==='button')!.props.onTap();await settle()
  find(root,n=>n.props['data-testid']==='r1-normal-edit-'+h.record._id)!.props.onTap();await settle()
  const control=()=>find(root,n=>n.props['data-key']===h.key)!
  expect(control().props.value).toBe('old-package');control().props.onInput('new-package');await settle()
  expect(recordFieldSelection).toHaveBeenCalledTimes(1)
  expect(recordFieldSelection.mock.calls[0][3]).toMatchObject({[h.key]:'new-package'})
  expect(control().props.value).toBe('old-package');expect(errors).toEqual([]);expect(h.writes).toHaveLength(0)
  expect(nodeText(find(root,n=>n.props['data-testid']==='r1-normal-form-read-message')!)).toContain('不能更新草稿')
 }finally{app.unmount()}
})
