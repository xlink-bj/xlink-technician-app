import fs from 'node:fs'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as localFields from '@features/work-orders/r1-local-form-fields'
import * as validation from '@features/work-orders/r1-special-mock-form-fields'
import * as sharedTypes from '@shared/types'
import { uxStateLanguage } from '@shared/ui/ux-state-language'
type Host={type:string;props:Record<string,any>;children:Host[];parent:Host|null;text:string}
const node=(type:string,text=''):Host=>({type,text,props:{},children:[],parent:null})
const renderer=Vue.createRenderer<Host,Host>({
 patchProp:(n,k,_p,v)=>{n.props[k]=v},insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=a?p.children.indexOf(a):-1;p.children.splice(i<0?p.children.length:i,0,n)},remove(n){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=null},
 createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),setText:(n,t)=>{n.text=t},setElementText:(n,t)=>{n.text=t;n.children=[]},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,
})
const Primitive=Vue.defineComponent({inheritAttrs:false,props:['disabled','message'],emits:['tap'],setup:(p,c)=>()=>Vue.h('primitive',{...c.attrs,disabled:p.disabled,onTap:()=>c.emit('tap')},[p.message,...(c.slots.default?.()??[])])})
const Control=Vue.defineComponent({props:['field','modelValue','disabled'],emits:['update:modelValue'],setup:(p,c)=>()=>Vue.h('input',{'data-key':p.field.valueKey,value:p.modelValue,onInput:(v:unknown)=>c.emit('update:modelValue',v)})})
function find(root:Host,match:(n:Host)=>boolean):Host|undefined{return match(root)?root:root.children.map(n=>find(n,match)).find(Boolean)}
async function settle(){for(let i=0;i<15;i++){await Promise.resolve();await Vue.nextTick()}}
async function fixture(){
 const actor=Vue.reactive({session:{sessionRef:'session',user:{id:'synthetic-user'},currentRole:{id:'synthetic-role'},roleVersion:'1'}})
 const source=compileScript(parse(fs.readFileSync('src/features/work-orders/R1DevMockDynamicFormTransactionPanel.vue','utf8')).descriptor,{id:'special-host-lifecycle',inlineTemplate:true}).content
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const modules:Record<string,any>={vue:Vue,'@shared/state':{useSessionStore:()=>actor},'./r1-local-form-fields':localFields,'./r1-special-mock-form-fields':validation,'@shared/types':sharedTypes,'@shared/ui/ux-state-language':{uxStateLanguage}}
 const module={exports:{} as any};new Function('require','exports','module',js)((name:string)=>name.endsWith('.vue')?{__esModule:true,default:name.includes('R1FormFieldControl')?Control:Primitive}:modules[name],module.exports,module)
 const definition={id:'def',fields:[{fieldId:'memo',valueKey:'memo',label:'Memo',type:'text',required:false,readOnly:false}]}
 const view={kind:'forms',definition,definitions:[{id:'def',label:'Form',definition}],nodeActive:true,entries:[],receiptPending:false,pendingRecoverable:false,pendingNeedsOriginalFields:false}
 let getActor!:()=>unknown
 const controller={readSealedDraft:vi.fn(async()=>null),sealDraftForSubmission:vi.fn(async()=>true),isDraftSubmissionPending:vi.fn(async()=>false),network:{current:async()=>'online',subscribe:()=>()=>{}},load:vi.fn(async()=>view),readDraft:vi.fn(async()=>null),writeDraft:vi.fn(async()=>true),removeDraft:vi.fn(async()=>true),execute:vi.fn(async()=>({state:'succeeded',view})),listMediaTasks:vi.fn(async()=>[]),finalizeMedia:vi.fn(async()=>true)}
 const factory=vi.fn((options:any)=>{getActor=options.getActor;return controller})
 const exposed=Vue.ref<any>(),root=node('root'),app=renderer.createApp({render:()=>Vue.h(module.exports.default,{ref:exposed,kind:'forms',workOrderId:'order',node:{id:'node'},createController:factory})});app.mount(root);await settle()
 const field=()=>find(root,n=>n.props['data-key']==='memo')!
 return{app,root,exposed,controller,actor,factory,getActor:()=>getActor(),captureActor:()=>getActor,input:async(v:string)=>{field().props.onInput(v);await settle()},get:(id:string)=>find(root,n=>n.props['data-testid']===id)}
}
describe('actual special Panel lifetime and persistence handoff',()=>{
 it('exposes a flush that waits the latest real write and fails on false',async()=>{
  const f=await fixture();try{
   expect(typeof f.exposed.value.flushLocalDraft).toBe('function')
   let release!:(v:boolean)=>void;f.controller.writeDraft.mockImplementationOnce(()=>new Promise(r=>{release=r}))
   await f.input('first');let done=false;const pending=f.exposed.value.flushLocalDraft().then((v:boolean)=>{done=true;return v})
   await f.input('second');expect(done).toBe(false);release(true);expect(await pending).toBe(true)
   expect(f.controller.writeDraft).toHaveBeenCalledTimes(2)
   f.controller.writeDraft.mockResolvedValueOnce(false);await f.input('failed');expect(await f.exposed.value.flushLocalDraft()).toBe(false)
  }finally{f.app.unmount()}
 })
 it('allows an untouched page to leave and keeps a throwing or latest-failed write on the page',async()=>{
  const f=await fixture();try{
   expect(await f.exposed.value.flushLocalDraft()).toBe(true)
   f.controller.writeDraft.mockRejectedValueOnce(Error('local disk'))
   await f.input('throw');expect(await f.exposed.value.flushLocalDraft()).toBe(false)
   let release!:(v:boolean)=>void;f.controller.writeDraft.mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValueOnce(false)
   await f.input('first');const pending=f.exposed.value.flushLocalDraft();await f.input('latest');release(true)
   expect(await pending).toBe(false);expect(f.controller.execute).not.toHaveBeenCalled()
  }finally{f.app.unmount()}
 })
 it('revokes the actor getter captured by an old controller on unmount and user replacement',async()=>{
  const f=await fixture();const old=f.captureActor();expect(old()).not.toBeNull();f.actor.session.user.id='replacement';await settle()
  // Factory callbacks are view-generation-bound, even when the sessionRef stays equal.
  expect(f.factory).toHaveBeenCalledTimes(2);expect(old()).toBeNull();f.app.unmount();expect(f.getActor()).toBeNull()
 })
 it('does not silently clear a successful save when the completed draft tombstone fails',async()=>{
  const f=await fixture();try{
   await f.input('retain until local cleanup succeeds');f.controller.removeDraft.mockResolvedValueOnce(false)
   await f.get('a-special-save')!.props.onTap();await settle()
   expect(f.get('a-special-local-draft')?.text).toContain('失败')
   expect(f.get('a-special-cleanup-retry')).toBeDefined()
   expect(f.get('a-special-save')).toBeUndefined();expect(f.controller.execute).toHaveBeenCalledTimes(1)
   await f.get('a-special-cleanup-retry')!.props.onTap();await settle()
   expect(f.get('a-special-cleanup-retry')).toBeUndefined();expect(f.controller.execute).toHaveBeenCalledTimes(1)
   expect(f.controller.removeDraft).toHaveBeenCalledTimes(2)
  }finally{f.app.unmount()}
 })
 it.each(['seal','pending'] as const)('ignores a late %s response after a new actor view owns the Panel',async kind=>{
  const f=await fixture();try{
   await f.input('old owned input');let release!:(v:boolean)=>void,arrived=false
   if(kind==='seal')f.controller.sealDraftForSubmission.mockImplementationOnce(()=>new Promise(r=>{arrived=true;release=r}))
   else{
    f.controller.execute.mockResolvedValueOnce({state:'blocked',message:'old refusal'} as never)
    f.controller.isDraftSubmissionPending.mockImplementationOnce(()=>new Promise(r=>{arrived=true;release=r}))
   }
   f.get('a-special-save')!.props.onTap();await settle();expect(arrived).toBe(true)
   f.actor.session.user.id='new-owner';await settle()
   release(kind==='pending');await settle()
   expect(f.get('a-special-local-submission-pending')).toBeUndefined()
   expect(f.get('a-special-operation-feedback')).toBeUndefined()
   expect(f.get('a-special-save')).toBeDefined()
  }finally{f.app.unmount()}
 })

 it.each(['false','throw'] as const)('a failed seal (%s) never calls the business controller',async mode=>{
  const f=await fixture();try{
   await f.input('must stay local')
   if(mode==='false')f.controller.sealDraftForSubmission.mockResolvedValueOnce(false)
   else f.controller.sealDraftForSubmission.mockRejectedValueOnce(Error('seal storage error'))
   f.get('a-special-save')!.props.onTap();await settle()
   expect(f.controller.execute).not.toHaveBeenCalled()
   expect(f.get('a-special-operation-feedback')).toBeDefined()
   expect(f.get('a-special-save')).toBeDefined()
  }finally{f.app.unmount()}
 })

 it('reads a changed edit revision after local generation rejection without any business dispatch',async()=>{
  const f=await fixture();try{
   const base=await f.controller.load.mock.results[0]!.value
   const entry={id:'saved-row',formDefinitionId:'def',editable:true,revision:'old',values:{memo:'saved'}}
   f.controller.load.mockResolvedValue({...base,entries:[entry]} as never)
   f.actor.session.user.id='owned-new-view';await settle()
   f.get('a-special-edit-saved-row')!.props.onTap();await settle()
   f.controller.writeDraft.mockResolvedValueOnce(false);await f.input('stale edit')
   f.controller.load.mockResolvedValue({...base,entries:[{...entry,revision:'new',values:{memo:'newer saved'}}]} as never)
   await f.get('a-special-save')!.props.onTap();await settle()
   const content=(n:Host):string=>n.text+n.children.map(content).join(' ')
   expect(content(f.get('a-special-operation-feedback')!)).toContain('记录已被其他编辑器更新')
   expect(f.controller.execute).not.toHaveBeenCalled()
   expect(f.controller.sealDraftForSubmission).not.toHaveBeenCalled()
  }finally{f.app.unmount()}
 })

})
