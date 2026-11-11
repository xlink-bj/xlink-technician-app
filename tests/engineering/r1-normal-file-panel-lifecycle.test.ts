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

const imageSnapshot = (): R1NodeFormsSnapshot => {
 const definition=formDefinition({data:[{_id:'photo',name:'photo',nameDisp:'Synthetic photo',type:'file',required:0,readOnly:0,preset:0,colName:'syntheticImages'}]},asOpaqueId<'FormDefinitionId'>('e'))
 return {workOrderId:'s',definition,fillableFieldIds:['photo'],records:[],node:{id:asOpaqueId<'WorkflowNodeRuntimeId'>('n'),runId:asOpaqueId<'WorkflowRunId'>('w'),formDefinitionId:definition.id,sourceNodeType:'forms',category:'forms',lifecycle:'active',formFieldIdsReadOnly:[]}}
}
function find(root:Host,predicate:(n:Host)=>boolean):Host|undefined {if(predicate(root))return root;for(const child of root.children){const v=find(child,predicate);if(v)return v}}
async function settle(){for(let i=0;i<10;i++){await Promise.resolve();await Vue.nextTick()}}
async function mounted(distinctProviderSessions=false){
 let current=imageSnapshot()
 const media={revision:Vue.ref(0),busy:()=>false,message:()=>'',values:()=>[],canPick:()=>true,ready:()=>true,
  inspect:vi.fn(async()=>true),cancel:vi.fn(async()=>true),dispose:vi.fn()}
 const actions:any={fileMedia:media,locked:()=>false,canCreate:()=>true,canComplete:()=>false,validateDraft:()=>true,
  saveOnly:vi.fn(async()=>current),complete:vi.fn()}
 const reader={enabled:()=>true,isCurrent:(s:R1NodeFormsSnapshot)=>s===current,clear:vi.fn(),load:vi.fn(async()=>current)}
 const props=Vue.reactive({reader:Vue.markRaw(reader),workOrderId:'s',runtimeNodeId:'n',actorScope:'actor-a'})
 const component=panel(),root=node('root'),app=renderer.createApp({setup:()=>()=>Vue.h(component,props)})
 app.provide(actionPort.r1RepeatActionsKey,{forSnapshot:()=>distinctProviderSessions?{...actions,fileMedia:{...media}}:actions});app.mount(root)
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id)
 const read=async()=>{find(root,n=>n.type==='button')!.props.onTap();await settle()}
 await read();return{app,root,props,reader,media,actions,get,read}
}
it('provides real cancel on the automatic first file create, then reopens a clear draft',async()=>{
 const h=await mounted();try{
  expect(h.get('r1-normal-create')).toBeDefined();expect(h.get('r1-normal-edit-cancel')).toBeDefined()
  h.get('r1-normal-edit-cancel')!.props.onTap();await settle()
  expect(h.media.cancel).toHaveBeenCalledTimes(1);expect(h.get('r1-normal-create')).toBeUndefined()
  expect(h.get('r1-normal-append')).toBeDefined();h.get('r1-normal-append')!.props.onTap();await settle()
  expect(h.get('r1-normal-create')).toBeDefined();expect(h.media.cancel).toHaveBeenCalledTimes(1)
 }finally{h.app.unmount()}
})
it('inspects the real session before presenting it as a usable new draft',async()=>{
 const h=await mounted();try{expect(h.media.inspect).toHaveBeenCalledTimes(1);expect(h.actions.saveOnly).not.toHaveBeenCalled()}finally{h.app.unmount()}
})
it('keeps the editor and recovery message when local cancellation cannot be verified',async()=>{
 const h=await mounted();try{
  h.media.cancel.mockResolvedValueOnce(false);h.media.message=()=> 'Synthetic local cancellation requires verification'
  expect(h.get('r1-normal-edit-cancel')).toBeDefined();h.get('r1-normal-edit-cancel')!.props.onTap();await settle()
  expect(h.get('r1-normal-create')).toBeDefined();expect(h.get('r1-normal-append')).toBeUndefined()
  expect(h.get('r1-normal-form-read-message')?.text).toContain('Synthetic local cancellation requires verification')
  expect(h.actions.saveOnly).not.toHaveBeenCalled()
 }finally{h.app.unmount()}
})
it('does not apply a late cancel completion to a new actor editor',async()=>{
 const h=await mounted();let done!:(v:boolean)=>void;const pending=new Promise<boolean>(r=>{done=r})
 try{
  h.media.cancel.mockImplementationOnce(()=>pending);expect(h.get('r1-normal-edit-cancel')).toBeDefined();h.get('r1-normal-edit-cancel')!.props.onTap();await settle()
  h.props.actorScope='actor-b';await settle();await h.read();expect(h.get('r1-normal-create')).toBeDefined()
  done(true);await settle();expect(h.get('r1-normal-create')).toBeDefined();expect(h.actions.saveOnly).not.toHaveBeenCalled()
  expect(h.media.dispose).toHaveBeenCalled()
 }finally{done?.(false);h.app.unmount()}
})

it('inspects the rendered session rather than creating a second unused capability',async()=>{
 const h=await mounted(true);try{expect(h.get('r1-normal-form-read-message')?.text).toContain('已从后台读取 0 条');expect(h.media.inspect).toHaveBeenCalledTimes(1)}finally{h.app.unmount()}
})
