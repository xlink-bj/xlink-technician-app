import * as retainedFileValues from '@shared/form/r1-retained-file-values'
import * as configuredFileRead from '@shared/form/r1-configured-file-read-evidence'
import * as normalDraftPort from '@features/work-orders/r1-normal-form-drafts'
import * as normalFileValues from '@features/work-orders/r1-normal-file-values'
import * as sharedTypes from '@shared/types'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
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
 const modules:Record<string,unknown>={vue:Vue,'./r1-normal-form-drafts':normalDraftPort,'./r1-repeat-form':repeatForm, '@shared/form/r1-retained-file-values':retainedFileValues,'@shared/form/r1-configured-file-read-evidence':configuredFileRead,'./r1-normal-file-values': normalFileValues, '@shared/types': sharedTypes, './R1NormalFileField.vue': { __esModule: true, default: Vue.defineComponent({ render: () => Vue.h('file-field') }) },'./r1-record-read-fields':recordReadFields,'./r1-repeat-actions-port':actionPort,'./r1-node-forms-read':readerPort,
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
async function mounted(initial=makeSnapshot(), allowSavedActions=false){
 let current:R1NodeFormsSnapshot|null=null,next=initial;const props=Vue.reactive({node:initial.node,workOrderId:initial.workOrderId,actorScope:'actor-a' as string|null})
 const reader={enabled:()=>true,clear:vi.fn(()=>{current=null}),isCurrent:(s:R1NodeFormsSnapshot)=>s===current,load:vi.fn(async()=>{current=next;return next})}
 const saveOnly=vi.fn(async()=>{next=makeSnapshot(String(props.node.id),1,props.workOrderId);current=next;return next})
 const complete=vi.fn(async()=>({acknowledged:true,transitionVerified:false}as const)),changed=vi.fn()
 const Panel=component('R1NodeFormsReadPanel'),Overview=component('R1NodeFormsOverview',Panel),root=node('root'),app=renderer.createApp(Vue.defineComponent({setup:()=>()=>Vue.h(Overview,{...props,onChanged:changed})}))
 app.provide(readerPort.r1NodeFormsReaderKey,reader);app.provide(actionPort.r1RepeatActionsKey,{forSnapshot:s=>s.records.length&&!allowSavedActions?null:{locked:()=>false,saveOnly,complete}});app.mount(root);await settle()
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id),read=()=>find(root,n=>n.type==='button')!
 const load=async()=>{read().props.onTap();await settle()},fill=async()=>{find(root,n=>n.props['data-key']==='note')!.props.onInput('合成说明');await settle()},save=async()=>{get('r1-normal-save')!.props.onTap();await settle()}
 return{app,root,props,reader,saveOnly,complete,changed,get,read,load,fill,save,count:()=>{const n=get('r1-form-list-count');return n?text(n):null},records:()=>all(root,n=>n.props['data-testid']==='r1-normal-form-record').length,setNext:(s:R1NodeFormsSnapshot)=>next=s,setCurrent:(s:R1NodeFormsSnapshot)=>current=s}
}
describe('actual Overview + normal ReadPanel count synchronization',()=>{
 it('updates the parent count after verified save without parent detail replacement or extra reads',async()=>{const h=await mounted();try{await h.load();expect(h.count()).toBe('已加载 0 条');await h.fill();await h.save();expect(h.records()).toBe(1);expect(h.count()).toBe('已加载 1 条');expect(h.props.node.formList?.entries).toHaveLength(0);expect(h.reader.load).toHaveBeenCalledOnce();expect(h.saveOnly).toHaveBeenCalledOnce()}finally{h.app.unmount()}})
 it('uses authoritative record read count even when parent EXTS still says zero',async()=>{const h=await mounted(makeSnapshot('node-a',1));try{await h.load();expect(h.records()).toBe(1);expect(h.count()).toBe('已加载 1 条')}finally{h.app.unmount()}})
 it('clears count on reread and failure instead of leaving a verified-looking old count',async()=>{const h=await mounted(makeSnapshot('node-a',1)),pending=deferred<R1NodeFormsSnapshot>();try{await h.load();h.reader.load.mockImplementationOnce(()=>pending.promise);h.read().props.onTap();await settle();expect(h.count()).toBeNull();pending.resolve(makeSnapshot('node-a',2));await settle();expect(h.count()).toBeNull();expect(h.records()).toBe(0)}finally{h.app.unmount()}})
 for(const scope of ['actor','node','workOrder']as const)it('rejects late read after '+scope+' switch',async()=>{const h=await mounted(),pending=deferred<R1NodeFormsSnapshot>();try{h.reader.load.mockImplementationOnce(()=>pending.promise);h.read().props.onTap();await settle();if(scope==='actor')h.props.actorScope='actor-b';if(scope==='node')h.props.node=makeSnapshot('node-b').node;if(scope==='workOrder')h.props.workOrderId='work-b';await settle();const old=makeSnapshot('node-a',2);h.setCurrent(old);pending.resolve(old);await settle();expect(h.records()).toBe(0);expect(h.count()).toBeNull()}finally{h.app.unmount()}})
 for(const scope of ['actor','node','workOrder']as const)it('rejects late save after '+scope+' switch and retains the new scope count',async()=>{const h=await mounted(),pending=deferred<R1NodeFormsSnapshot>();try{await h.load();await h.fill();h.saveOnly.mockImplementationOnce(()=>pending.promise);h.get('r1-normal-save')!.props.onTap();await settle();if(scope==='actor')h.props.actorScope='actor-b';else if(scope==='node')h.props.node=makeSnapshot('node-b').node;else h.props.workOrderId='work-b';await settle();const fresh=makeSnapshot(scope==='node'?'node-b':'node-a',1,scope==='workOrder'?'work-b':'work-a');h.setNext(fresh);await h.load();expect(h.count()).toBe('已加载 1 条');const old=makeSnapshot('node-a',2);pending.resolve(old);await settle();expect(h.records()).toBe(1);expect(h.count()).toBe('已加载 1 条')}finally{h.app.unmount()}})
 it('clears a previously read count when the next read fails',async()=>{const h=await mounted(makeSnapshot('node-a',1));try{await h.load();expect(h.count()).toBe('已加载 1 条');h.reader.load.mockRejectedValueOnce(Error('network unavailable'));await h.load();expect(h.records()).toBe(0);expect(h.count()).toBeNull()}finally{h.app.unmount()}})
 it('does not emit completion or publish an old count after actor changes during completion',async()=>{const h=await mounted(makeSnapshot('node-a',1),true),pending=deferred<{acknowledged:true;transitionVerified:false}>();try{await h.load();h.complete.mockImplementationOnce(()=>pending.promise);h.get('r1-normal-complete-request')!.props.onTap();await settle();h.get('r1-normal-complete-confirm')!.props.onTap();await settle();h.props.actorScope='actor-b';await settle();pending.resolve({acknowledged:true,transitionVerified:false});await settle();expect(h.changed).not.toHaveBeenCalled();expect(h.records()).toBe(0);expect(h.count()).toBeNull()}finally{h.app.unmount()}})
 it('clears count on logout and does not retain previous actor data',async()=>{const h=await mounted(makeSnapshot('node-a',1));try{await h.load();h.props.actorScope=null;await settle();expect(h.records()).toBe(0);expect(h.count()).toBeNull()}finally{h.app.unmount()}})
})
