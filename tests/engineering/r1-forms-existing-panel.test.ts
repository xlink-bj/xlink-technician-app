import * as normalFileValues from '@features/work-orders/r1-normal-file-values'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import * as repeatForm from '@features/work-orders/r1-repeat-form'
import * as recordReadFields from '@features/work-orders/r1-record-read-fields'
import * as readerPort from '@features/work-orders/r1-node-forms-read'
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
const draftStore = { snapshot: Vue.reactive({intents: []}), repeatList: null, state: 'ready', clear: vi.fn(), open: vi.fn(async()=>{}), isSyntheticMockDataModeEnabled:()=>false }
function component(file:string, panel?:Vue.Component) {
 const filename=path.resolve('src/features/work-orders/'+file+'.vue'),{descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename})
 const source=compileScript(descriptor,{id:'normal-forms-count-'+file,inlineTemplate:true}).content.replaceAll('import.meta.env','({DEV:false})')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const modules:Record<string,unknown>={vue:Vue,'./r1-normal-file-values':normalFileValues,'./R1NormalFileField.vue':{__esModule:true,default:Vue.defineComponent({render:()=>Vue.h('file-field')})},'./r1-repeat-form':repeatForm,'./r1-record-read-fields':recordReadFields,'./r1-repeat-actions-port':actionPort,'./r1-node-forms-read':readerPort,
 './r1-local-form-drafts':{useR1LocalFormDraftStore:()=>draftStore},'./R1NodeFormsReadPanel.vue':{__esModule:true,default:panel},'@shared/ui/AppButton.vue':{__esModule:true,default:Button},'@shared/ui/AppField.vue':{__esModule:true,default:Field},'./R1FormFieldControl.vue':{__esModule:true,default:Control},'@shared/ui/AppInput.vue':{__esModule:true,default:Field},'./R1LocalFormFieldEditor.vue':{__esModule:true,default:Field}}
 const module={exports:{} as {default:Vue.Component}};new Function('require','module','exports',js)((key:string)=>{if(!(key in modules))throw Error('Unstubbed '+key);return modules[key]},module,module.exports);return module.exports.default
}
function makeSnapshot(nodeId='node-a',count=0,workOrder='work-a'):R1NodeFormsSnapshot{
 const definition=formDefinition({data:[{_id:'note-field',name:'note',nameDisp:'说明',type:'text',required:'1',preset:'1',colName:'synthetic',showList:['2','4'],showType:'1',frontEndConfig:'{}'}]},asOpaqueId<'FormDefinitionId'>('definition-a'))
 return{workOrderId:workOrder,node:{id:asOpaqueId<'WorkflowNodeRuntimeId'>(nodeId),runId:asOpaqueId<'WorkflowRunId'>('run-a'),sourceNodeType:'forms',category:'forms',lifecycle:'active',formDefinitionId:definition.id,formFieldIdsReadOnly:[],formList:{source:'exts.formList',evidence:'available',entries:[],truncated:false}},definition,records:Array.from({length:count},(_,i)=>({id:asOpaqueId<'FormDataId'>('server-'+i),definitionId:definition.id,values:{note:'已保存'}}))}
}
function find(root:Host,predicate:(n:Host)=>boolean):Host|undefined{if(predicate(root))return root;for(const c of root.children){const f=find(c,predicate);if(f)return f}}
function all(root:Host,predicate:(n:Host)=>boolean):Host[]{return[...(predicate(root)?[root]:[]),...root.children.flatMap(c=>all(c,predicate))]}
function text(root:Host):string{return root.text+root.children.map(text).join('')}
async function settle(){for(let i=0;i<6;i++){await Promise.resolve();await Vue.nextTick()}}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve}}
async function mounted(){
 let current:R1NodeFormsSnapshot|null=null,next=makeSnapshot('node-a',1)
 const props=Vue.reactive({workOrderId:'work-a',runtimeNodeId:'node-a',actorScope:'actor-a' as string|null})
 const reader={enabled:()=>true,clear:vi.fn(()=>{current=null}),isCurrent:(s:R1NodeFormsSnapshot)=>s===current,
  load:vi.fn(async()=>{current=next;return next})}
 let permitEdit=true,permitCreate=true
 const saveOnly=vi.fn(async()=>{current=null;throw Error('pre-dispatch read failed')}),complete=vi.fn(async()=>({acknowledged:true,transitionVerified:true}as const)),saveAndComplete=vi.fn(async()=>({acknowledged:true,transitionVerified:true}as const)),changed=vi.fn()
 const provider={forSnapshot:(s:R1NodeFormsSnapshot)=>s===current?{locked:()=>s!==current,canCreate:()=>permitCreate,canEdit:(id:string)=>permitEdit&&id==='server-0',canComplete:()=>true,canSaveAndComplete:()=>true,
  initialValues:()=>({note:'已保存'}),validateDraft:(v:Record<string,unknown>)=>Boolean(v.note),saveOnly,complete,saveAndComplete}:null}
 const Panel=component('R1NodeFormsReadPanel'),root=node('root'),app=renderer.createApp(Vue.defineComponent({setup:()=>()=>Vue.h(Panel,{...props,reader,onChanged:changed})}))
 app.provide(actionPort.r1RepeatActionsKey,provider);app.mount(root);await settle()
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id),read=()=>find(root,n=>n.type==='button')!
 const tap=async(id:string)=>{get(id)!.props.onTap();await settle()},load=async()=>{read().props.onTap();await settle()},input=()=>find(root,n=>n.props['data-key']==='note')!
 const fill=async(value:string)=>{input().props.onInput(value);await settle()}
 return{app,root,props,reader,get,read,tap,load,input,fill,saveOnly,complete,saveAndComplete,changed,setNext:(s:R1NodeFormsSnapshot)=>next=s,revoke:()=>{permitEdit=false;permitCreate=false},permit:()=>{permitEdit=true;permitCreate=true},setCurrent:(s:R1NodeFormsSnapshot)=>current=s}
}
describe('normal forms existing-record panel capability and recovery',()=>{
 it('restores an append draft only after fresh authorized reread following pre-dispatch failure',async()=>{
  const h=await mounted();try{await h.load();await h.tap('r1-normal-append');await h.fill('未提交草稿');await h.tap('r1-normal-save');expect(h.saveOnly).toHaveBeenCalledOnce();expect(h.get('r1-normal-save')).toBeUndefined()
   await h.load();expect(h.input().props.value).toBe('未提交草稿');expect(h.get('r1-normal-save')).toBeDefined()
  }finally{h.app.unmount()}
 })
 it('restores an edit draft with the same record ID through a fresh read and fresh capability',async()=>{
  const h=await mounted();try{await h.load();await h.tap('r1-normal-edit-server-0');await h.fill('编辑草稿');await h.tap('r1-normal-save');expect(h.saveOnly).toHaveBeenCalledWith({note:'编辑草稿'},'server-0')
   await h.load();expect(h.input().props.value).toBe('编辑草稿');await h.tap('r1-normal-save');expect(h.saveOnly).toHaveBeenCalledTimes(2)
  }finally{h.app.unmount()}
 })
 it.each(['append','edit']as const)('keeps the %s draft and identity through consecutive failed rereads until fresh authorization succeeds',async mode=>{
  const h=await mounted();try{
   await h.load();await h.tap(mode==='append'?'r1-normal-append':'r1-normal-edit-server-0');await h.fill('跨失败重读的草稿')
   for(let attempt=0;attempt<2;attempt++){
    h.reader.load.mockRejectedValueOnce(Error('synthetic explicit reread failure'));await h.load()
    expect(h.get('r1-normal-save')).toBeUndefined();expect(text(h.root)).toContain('记录暂时无法完整核实')
   }
   await h.load();expect(h.get('r1-normal-save')).toBeDefined();expect(h.input().props.value).toBe('跨失败重读的草稿')
   await h.tap('r1-normal-save');expect(h.saveOnly).toHaveBeenCalledWith({note:'跨失败重读的草稿'},mode==='edit'?'server-0':undefined)
  }finally{h.app.unmount()}
 })
 it.each(['append','edit']as const)('does not revive a cancelled %s draft after failed then successful rereads',async mode=>{
  const h=await mounted();try{
   await h.load();await h.tap(mode==='append'?'r1-normal-append':'r1-normal-edit-server-0');await h.fill('已取消的草稿');await h.tap('r1-normal-edit-cancel')
   h.reader.load.mockRejectedValueOnce(Error('synthetic reread failure'));await h.load();await h.load()
   expect(h.get('r1-normal-save')).toBeUndefined();expect(h.saveOnly).not.toHaveBeenCalled()
   await h.tap('r1-normal-edit-server-0');expect(h.input().props.value).toBe('已保存')
  }finally{h.app.unmount()}
 })
 for(const mode of ['append','edit']as const){
  it.each(['actor','node','workOrder']as const)(`does not restore the pending ${mode} draft after %s changes`,async change=>{
   const h=await mounted();try{
    await h.load();await h.tap(mode==='append'?'r1-normal-append':'r1-normal-edit-server-0');await h.fill('旧scope草稿')
    h.reader.load.mockRejectedValueOnce(Error('synthetic reread failure'));await h.load()
    if(change==='actor')h.props.actorScope='actor-b'
    if(change==='node')h.props.runtimeNodeId='node-b'
    if(change==='workOrder')h.props.workOrderId='work-b'
    await settle();h.setNext(makeSnapshot(h.props.runtimeNodeId,1,h.props.workOrderId));await h.load()
    expect(h.get('r1-normal-save')).toBeUndefined();expect(h.saveOnly).not.toHaveBeenCalled()
    await h.tap('r1-normal-edit-server-0');expect(h.input().props.value).toBe('已保存')
   }finally{h.app.unmount()}
  })
 }
 it.each(['append','edit']as const)('discards pending %s recovery when fresh read revokes authority, even if authority returns later',async mode=>{
  const h=await mounted();try{
   await h.load();await h.tap(mode==='append'?'r1-normal-append':'r1-normal-edit-server-0');await h.fill('不可复活的草稿')
   h.reader.load.mockRejectedValueOnce(Error('synthetic reread failure'));await h.load();h.revoke();await h.load()
   expect(h.get('r1-normal-save')).toBeUndefined();expect(h.saveOnly).not.toHaveBeenCalled()
   h.permit();await h.load();expect(h.get('r1-normal-save')).toBeUndefined()
   await h.tap('r1-normal-edit-server-0');expect(h.input().props.value).toBe('已保存')
  }finally{h.app.unmount()}
 })
 it('does not restore an editor when reread revokes its record or operation capability',async()=>{
  const h=await mounted();try{await h.load();await h.tap('r1-normal-edit-server-0');await h.fill('草稿');h.revoke();await h.load();expect(h.get('r1-normal-save')).toBeUndefined();expect(h.get('r1-normal-edit-server-0')).toBeUndefined();expect(h.saveOnly).not.toHaveBeenCalled()}finally{h.app.unmount()}
 })
 it('cancels edit without writes and requires separate confirmation before save-and-complete',async()=>{
  const h=await mounted();try{await h.load();await h.tap('r1-normal-edit-server-0');await h.tap('r1-normal-edit-cancel');expect(h.saveOnly).not.toHaveBeenCalled();expect(h.get('r1-normal-save')).toBeUndefined()
   await h.tap('r1-normal-append');await h.fill('新记录');await h.tap('r1-normal-save-complete-request');expect(h.saveAndComplete).not.toHaveBeenCalled();await h.tap('r1-normal-save-complete-confirm');expect(h.saveAndComplete).toHaveBeenCalledWith({note:'新记录'},undefined);expect(h.changed).toHaveBeenCalledOnce();expect(h.complete).not.toHaveBeenCalled()
  }finally{h.app.unmount()}
 })
 it.each(['actor','node','workOrder']as const)('ignores a late save-and-complete result after %s changes',async change=>{
  const h=await mounted(),pending=deferred<{acknowledged:true;transitionVerified:true}>();try{await h.load();await h.tap('r1-normal-edit-server-0');h.saveAndComplete.mockImplementationOnce(()=>pending.promise);await h.tap('r1-normal-save-complete-request');await h.tap('r1-normal-save-complete-confirm')
   if(change==='actor')h.props.actorScope='other';if(change==='node')h.props.runtimeNodeId='other';if(change==='workOrder')h.props.workOrderId='other';await settle();pending.resolve({acknowledged:true,transitionVerified:true});await settle();expect(h.changed).not.toHaveBeenCalled();expect(h.get('r1-normal-save')).toBeUndefined()
  }finally{h.app.unmount()}
 })
})

it('mounts decoded Survey attachment metadata as inert text in the actual normal SFC', async () => {
  const h = await mounted(), network = vi.fn(() => { throw Error('Media must not be requested') })
  vi.stubGlobal('fetch', network); vi.stubGlobal('uni', { request: network, downloadFile: network, previewImage: network, uploadFile: network, chooseImage: network })
  try {
    const base = makeSnapshot('node-a', 1), definition = formDefinition({ data: [{ _id: 'media-field',
      name: 'images1', nameDisp: '现场附件', type: 'file', state: 1, colName: 'Survey', showList: ['4'], multiple: false }] }, base.definition.id)
    const codec = createSurveyReadOnlyMediaCodec(definition, 'Survey', [{ _id: 'media-field', name: 'images1', type: 'file',
      state: 1, extId: definition.id, colName: 'Survey', preset: 0 }])!
    const raw = { _id: 'server-0', tenantId: 'tenant', sid: 'work', nodeId: 'node', workflowId: 'run', state: 1,
      exts: { images1: [{ url: 'https://media.example.test/a?token=PRIVATE_TOKEN', name: 'PRIVATE_KEY', extname: 'jpg' }] } }
    const scoped = createR1ScopedFormReader({ scope: { tenantId: 'tenant', workOrderId: 'work', runtimeNodeId: 'node',
      workflowRunId: 'run', formDefinitionId: String(definition.id), sourceNodeType: 'repeat' }, isCurrent: () => true,
      readOnlySurveyMedia: codec, transport: { execute: async request => ({ data: [raw], total: 1, page: 1, size: request.body?.rows }) } })
    await scoped.discover()
    const record = (await scoped.select('server-0')).data
    h.setNext({ ...base, definition, records: [record] }); h.revoke(); await h.load()
    const value = h.get('r1-normal-value-images1')!
    expect(text(value)).toBe('已保存 1 个附件（暂不支持打开）：附件 1（JPG）')
    expect(text(h.root)).not.toMatch(/https:|PRIVATE_TOKEN|PRIVATE_KEY/)
    expect(all(h.root, el => ['img','image','a','video','iframe'].includes(el.type) || 'href' in el.props || 'src' in el.props)).toHaveLength(0)
    expect(Object.keys(value.props).some(key => /^on/.test(key))).toBe(false)
    expect(h.saveOnly).not.toHaveBeenCalled(); expect(h.saveAndComplete).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled()
    h.props.actorScope = null; await settle(); expect(text(h.root)).not.toContain('附件 1（JPG）')
  } finally { h.app.unmount(); vi.unstubAllGlobals() }
})
