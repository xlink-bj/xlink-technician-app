import { bindR1ConfiguredFileReadDisplay } from '@shared/form/r1-configured-file-read-evidence'
import * as normalFileValues from '@features/work-orders/r1-normal-file-values'
import * as sharedTypes from '@shared/types'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {createNormalNodeFormsReader} from '@app/r1-node-forms-read'
import {createNormalFormsActionProvider} from '@app/r1-forms-authorization'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import { formDefinition } from '@adapters/api/read-models/form'
import * as repeatForm from '@features/work-orders/r1-repeat-form'
import * as recordReadFields from '@features/work-orders/r1-record-read-fields'
import * as actionPort from '@features/work-orders/r1-repeat-actions-port'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { asOpaqueId } from '@shared/types'

// Mount the actual SFC script + template in Vue's custom renderer. Only the
// visual primitives are test controls; no DOM/browser, API, auth or writes.
interface Host { type: string; props: Record<string, any>; text: string; children: Host[]; parent: Host | null }
const node = (type: string, text = ''): Host => ({ type, text, props: {}, children: [], parent: null })
const renderer = Vue.createRenderer<Host, Host>({
  patchProp: (el, key, _prev, value) => { el.props[key] = value },
  insert(el, parent, anchor = null) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el) },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.children = []; el.text = text },
  parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
const Button = Vue.defineComponent({ inheritAttrs: false, props: ['disabled', 'loading'], emits: ['tap'], setup: (props, ctx) => () => Vue.h('button', { ...ctx.attrs, disabled: props.disabled, onTap: () => ctx.emit('tap') }, ctx.slots.default?.()) })
const Field = Vue.defineComponent({ inheritAttrs: false, setup: (_, ctx) => () => Vue.h('field', ctx.attrs, ctx.slots.default?.()) })
const Control = Vue.defineComponent({ props: ['field', 'modelValue', 'disabled'], emits: ['update:modelValue'], setup: (props, ctx) => () => Vue.h('input', { 'data-key': props.field.valueKey, value: props.modelValue, disabled: props.disabled, onInput: (value: unknown) => ctx.emit('update:modelValue', value) }) })
function panel() {
  const filename = path.resolve('src/features/work-orders/R1NodeFormsReadPanel.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, { id: 'normal-file-cancel-unit', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const modules: Record<string, unknown> = { vue: Vue, './r1-repeat-form': repeatForm, './r1-normal-file-values': normalFileValues, '@shared/types': sharedTypes, './R1NormalFileField.vue': { __esModule: true, default: Vue.defineComponent({ render: () => Vue.h('file-field') }) }, './r1-record-read-fields': recordReadFields, './r1-repeat-actions-port': actionPort,
    '@shared/ui/AppButton.vue': { __esModule: true, default: Button }, '@shared/ui/AppField.vue': { __esModule: true, default: Field }, './R1FormFieldControl.vue': { __esModule: true, default: Control } }
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((key: string) => { if (!(key in modules)) throw Error(`Unstubbed component import: ${key}`); return modules[key] }, module, module.exports)
  return module.exports.default
}


function find(root:Host,predicate:(n:Host)=>boolean):Host|undefined {if(predicate(root))return root;for(const child of root.children){const v=find(child,predicate);if(v)return v}}
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await Vue.nextTick()}}
function fixture(){
 const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
 let readHook:((path:string)=>Promise<void>)|undefined,stored:any=null
 let actor:any={sessionRef:'synthetic-scalar-session',user:{id:'u'},currentRole:{id:'r'}},listed=true
 const fields:any[]=[['visitDate','date'],['visitTime','time'],['visitAt','datetime'],['mode','text'],['followupAt','datetime'],['memo','text']].map(([name,type],i)=>({_id:'field-'+i,name,nameDisp:name,type,tenantId:'t',extId:'e',colName:'syntheticSchedule',state:1,required:name==='followupAt'?'1':'0',preset:0,multiple:false,readOnly:0,operationType:'1',showList:['4'],frontEndConfig:'{}',showType:name==='followupAt'?'3':'1',...(name==='followupAt'?{showField:'mode',showValue:'on',showFieldPreset:0}:{})}))
 const ext:any={_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticSchedule'},node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:true}},nodeDef:{nodeType:'forms',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const grant:any={version:1,scope,fieldIds:fields.map(f=>f._id),operations:['create'],expiresAt:'2099-01-01T00:00:00Z'}
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify(grant)}
 const calls:string[]=[],request=vi.fn();vi.stubGlobal('uni',{request})
 const transport={execute:vi.fn(async(req:any)=>{
  calls.push(req.path);await readHook?.(req.path)
  if(req.path==='basic/serviceAppointment/queryById/s')return{success:true,status:1,data:{serviceAppointment:{_id:'s',tenantId:'t',workflowId:'w',state:1},workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[structuredClone(node)]}}
  if(req.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(req.path==='biz/extField/query')return{data:structuredClone(fields),total:fields.length,page:1,size:50}
  if(req.path==='biz/extForm/query/e')return{data:stored?[structuredClone(stored)]:[],total:stored?1:0,page:1,size:req.body.rows,dataCount:stored?1:0}
  if(req.path==='i/code/selectCode.do')return[{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'Synthetic A'}}]
  throw Error('No record/command/provider allowed before synthetic first create')
 })}
 const auth={getCurrentSession:()=>actor},reader=createNormalNodeFormsReader({auth,read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>listed,getDynamicCodeOptions:vi.fn()},tenantId:'t',env,origin:'http://127.0.0.1:5189',transport})
 const provider=createNormalFormsActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189'})
 return{reader,provider,fields,node,ext,grant,env,calls,request,role:()=>{actor={...actor,currentRole:{id:'other'}}},restoreRole:()=>{actor={...actor,currentRole:{id:'r'}}},unlist:()=>{listed=false},relist:()=>{listed=true},appear:()=>{stored={_id:'saved',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,mode:'off',exts:{mode:'off'}};node.exts.formList=[{_id:'saved',formDefId:'e',state:1}]},hook:(fn:typeof readHook)=>{readHook=fn},grantUpdate:()=>{env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify(grant)},start:async()=>{const s=await reader.load('s','n');return{s,a:provider.forSnapshot(s)!}}}
}
async function mounted(configure?:(f:ReturnType<typeof fixture>)=>void){
 const f=fixture();configure?.(f);const root=node('root'),props=Vue.reactive({workOrderId:'s',runtimeNodeId:'n',reader:f.reader,actorScope:'synthetic-actor-a'})
 const app=renderer.createApp(Vue.defineComponent({setup(){Vue.provide(actionPort.r1RepeatActionsKey,f.provider);return()=>Vue.h(panelComponent,props)}}))
 app.mount(root)
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id),input=(key:string)=>find(root,n=>n.props['data-key']===key)
 const read=async()=>{find(get('r1-normal-form-read')!,n=>n.type==='button')!.props.onTap();await settle()}
 const set=async(key:string,value:string)=>{input(key)!.props.onInput(value);await settle()}
 await read();return{...f,root,props,app,get,input,read,set}
}
const panelComponent=panel()
beforeEach(()=>installLocalFixtureBrowser());afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
it('the actual panel clears only hidden new scalar values and does not revive them',async()=>{
 const h=await mounted()
 try{
  await h.set('visitDate','2027-01-01');await h.set('visitTime','09:30');await h.set('visitAt','2027-01-01 09:30:00');await h.set('memo','keep')
  await h.set('mode','on');await h.set('followupAt','2027-01-02 09:30:00');expect(h.get('r1-normal-save')!.props.disabled).toBe(false)
  await h.set('mode','off');expect(h.input('followupAt')).toBeUndefined()
  expect(h.input('visitAt')!.props.value).toBe('2027-01-01 09:30:00');expect(h.input('memo')!.props.value).toBe('keep')
  await h.set('mode','on');expect(h.input('followupAt')!.props.value).toBeUndefined();expect(h.get('r1-normal-save')!.props.disabled).toBe(true)
  expect(h.request).not.toHaveBeenCalled()
 }finally{h.app.unmount()}
})
it('the real ordinary provider selects a create-only guarded transition',async()=>{
 const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull();expect((a as any).updateCreateDraft).toBeTypeOf('function')
 expect((a as any).updateCreateDraft({mode:'on',followupAt:'2027-01-02 09:30:00'},'mode','off')).toEqual({mode:'off'})
 expect(h.reader.isCurrent(s)).toBe(true);expect(h.request).not.toHaveBeenCalled()
})

it('actual panel refuses a selected helper error atomically without the old updater fallback',async()=>{
 const h=await mounted(),old=vi.spyOn(repeatForm,'updateR1FormDraftValue')
 try{
  await h.set('mode','on');await h.set('followupAt','2027-01-02 09:30:00');old.mockClear()
  await h.set('mode',' on ')
  expect(h.get('r1-normal-form-read-message')!.text).toContain('不能更新草稿')
  expect(h.input('mode')!.props.value).toBe('on');expect(h.input('followupAt')!.props.value).toBe('2027-01-02 09:30:00')
  expect(old).not.toHaveBeenCalled();expect(h.request).not.toHaveBeenCalled()
 }finally{old.mockRestore();h.app.unmount()}
})
it.each(['role','listed','grant','schema','readonly'])('captured scalar callback permanently refuses observed %s changes',async kind=>{
 const h=fixture(),{s,a}=await h.start(),callback=a.updateCreateDraft!
 const before={mode:'on',followupAt:'2027-01-02 09:30:00'}
 if(kind==='role')h.role()
 if(kind==='listed')h.unlist()
 if(kind==='grant'){h.grant.expiresAt='2000-01-01T00:00:00Z';h.grantUpdate()}
 const field=s.definition.fields![0] as any,original=field.required
 if(kind==='schema')field.required=!original
 if(kind==='readonly')(s.node.formFieldIdsReadOnly as string[]).push('field-0')
 expect(()=>callback(before,'mode','off')).toThrow()
 if(kind==='role')h.restoreRole()
 if(kind==='listed')h.relist()
 if(kind==='grant'){h.grant.expiresAt='2099-01-01T00:00:00Z';h.grantUpdate()}
 if(kind==='schema')field.required=original
 if(kind==='readonly')(s.node.formFieldIdsReadOnly as string[]).pop()
 expect(()=>callback(before,'mode','off')).toThrow()
 expect(before).toEqual({mode:'on',followupAt:'2027-01-02 09:30:00'});expect(h.request).not.toHaveBeenCalled()
 const fresh=await h.start();expect(fresh.a.updateCreateDraft!({},'mode','off')).toEqual({mode:'off'})
})
it('refuses copied snapshot, an edit ID, and stale callback after a newer normal read',async()=>{
 const h=fixture(),{s,a}=await h.start()
 expect(h.provider.forSnapshot({...s})).toBeNull()
 expect(()=>a.updateCreateDraft!({},'mode','on','saved')).toThrow()
 await h.reader.load('s','n');expect(()=>a.updateCreateDraft!({},'mode','off')).toThrow();expect(h.request).not.toHaveBeenCalled()
})
it.each(['typed','special','v2','large','array','file','unknown'])('keeps %s outside the scalar helper selection',async mode=>{
 const h=fixture()
 if(mode==='typed')h.ext.type='1'
 if(mode==='special'){h.ext.colName='survey';h.fields.forEach(f=>f.colName='survey')}
 if(mode==='v2'){h.grant.version=2;h.grant.recordIds=[];h.grantUpdate()}
 if(mode==='array'){h.fields[0].type='select';h.fields[0].multiple=true;h.fields[0].valueOption='SYN_CODES'}
 if(mode==='file')h.fields[0].type='file'
 if(mode==='unknown')h.fields[0].type='UNKNOWN'
 if(mode==='large'){for(let i=6;i<51;i++)h.fields.push({...h.fields[0],_id:'field-'+i,name:'value'+i});h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id);h.grant.fieldIds=h.fields.map(f=>f._id);h.grantUpdate()}
 if(mode==='large'){await expect(h.start()).rejects.toThrow()}
 else{const {a}=await h.start();if(mode==='array'){expect(typeof a?.updateCreateDraft).toBe('function');expect(a!.updateCreateDraft!({},'mode','off')).toEqual({mode:'off'})}else expect(a?.updateCreateDraft).toBeUndefined()}
 expect(h.request).not.toHaveBeenCalled()
})
it('normal panel reload renews the lease while retaining the explicit new draft',async()=>{
 const h=await mounted()
 try{await h.set('mode','on');await h.set('followupAt','2027-01-02 09:30:00');await h.read();expect(h.input('mode')!.props.value).toBe('on');expect(h.input('followupAt')!.props.value).toBe('2027-01-02 09:30:00');await h.set('mode','off');await h.set('mode','on');expect(h.input('followupAt')!.props.value).toBeUndefined();expect(h.request).not.toHaveBeenCalled()}finally{h.app.unmount()}
})
it('route/actor clearing and unmount make old control events inert',async()=>{
 const h=await mounted(),old=h.input('mode')!.props.onInput
 h.props.actorScope='new-actor';await settle();old('on');await settle();expect(h.get('r1-normal-create')).toBeUndefined()
 h.app.unmount();old('on');await settle();expect(h.request).not.toHaveBeenCalled()
})

it('newly read records invalidate the previous first-create callback',async()=>{
 const h=fixture(),{a}=await h.start();h.appear();const after=await h.reader.load('s','n')
 expect(after.records).toHaveLength(1);expect(h.provider.forSnapshot(after)).toBeNull()
 expect(()=>a.updateCreateDraft!({},'mode','on')).toThrow();expect(h.request).not.toHaveBeenCalled()
})
it('a newer page epoch rejects a late read and old control events',async()=>{
 const h=await mounted(),old=h.input('mode')!.props.onInput;let ready!:()=>void,release!:()=>void
 const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
 h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'){ready();await gate}})
 try{void h.read();await arrived;h.props.actorScope='different';await settle();release();await settle();old('on');await settle();expect(h.get('r1-normal-create')).toBeUndefined();expect(h.request).not.toHaveBeenCalled()}finally{release();h.app.unmount()}
})

it('unified callback safely handles a known mobile-excluded optional row; normal panel input still works',async()=>{
 const f=fixture();f.fields[5].showList=['5'];const {a}=await f.start()
 expect(typeof a.updateCreateDraft).toBe('function');expect(a.updateCreateDraft!({},'mode','off')).toEqual({mode:'off'});expect(a.validateDraft!({mode:'off'})).toBe(true)
 const h=await mounted(f=>{f.fields[5].showList=['5']})
 try{
  await h.set('mode','off');expect(h.input('mode')!.props.value).toBe('off')
  expect(h.get('r1-normal-save')!.props.disabled).toBe(false)
  expect(h.request).not.toHaveBeenCalled()
 }finally{h.app.unmount()}
})

it.each(['cycle','unknown-controller','nested-controller','surface'])('does not select the narrow helper for %s schema',async kind=>{
 const h=fixture()
 if(kind==='cycle')Object.assign(h.fields[3],{showType:'3',showField:'followupAt',showValue:'x',showFieldPreset:0})
 if(kind==='unknown-controller')h.fields[4].showField='unknown'
 if(kind==='nested-controller')h.fields[4].showField='mode.nested'
 if(kind==='surface')h.fields[5].frontEndConfig='{"mpDetailHide":true}'
 const {a}=await h.start();expect(a?.updateCreateDraft).toBeUndefined();expect(h.request).not.toHaveBeenCalled()
})

it.each(['show-other','show-empty','self','two-node','missing','nested','comma','fieldId','sessionRef'])('complete ordinary plan: %s has explicit applicability or refuses unsupported metadata',async kind=>{
 const h=fixture()
 if(kind==='show-other')h.fields[5].showList=['5']
 if(kind==='show-empty')h.fields[5].showList=[]
 if(kind==='self')Object.assign(h.fields[5],{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0})
 if(kind==='two-node'){Object.assign(h.fields[5],{showType:'3',showField:'visitDate',showValue:'on',showFieldPreset:0});Object.assign(h.fields[0],{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0})}
 if(['missing','nested','comma'].includes(kind))h.fields[5].showType='3',h.fields[5].showField=kind==='missing'?'unknown':kind==='nested'?'meta.flag':'a,b',h.fields[5].showValue='on',h.fields[5].showFieldPreset=0
 if(kind==='fieldId'||kind==='sessionRef')h.fields[5].name=kind
 const {s,a}=await h.start();if(!['show-other','show-empty'].includes(kind)){expect(a).toBeNull();expect(h.request).not.toHaveBeenCalled();return};expect(a).not.toBeNull();expect(a.validateDraft!({mode:'off'})).toBe(true)
 expect(repeatForm.projectR1RepeatFields(s,{mode:'off'}).find(f=>f.valueKey==='mode')!.supported).toBe(true)
 if(kind==='show-other'||kind==='show-empty'){expect(typeof a.updateCreateDraft).toBe('function');expect(a.updateCreateDraft!({},'mode','off')).toEqual({mode:'off'})}else expect(a.updateCreateDraft).toBeUndefined()
 expect(repeatForm.updateR1FormDraftValue(s,{},'mode','off')).toEqual({mode:'off'})
 expect(h.request).not.toHaveBeenCalled()
})
