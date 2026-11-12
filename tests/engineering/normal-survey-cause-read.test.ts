import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as sharedTypes from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createSurveyLeakageCauseProvider } from '@adapters/api/survey-leakage-cause'
import * as readerPort from '@features/work-orders/r1-node-forms-read'
import * as actionPort from '@features/work-orders/r1-repeat-actions-port'
import * as drafts from '@features/work-orders/r1-normal-form-drafts'
import * as files from '@features/work-orders/r1-normal-file-values'
import * as repeat from '@features/work-orders/r1-repeat-form'
import * as projection from '@features/work-orders/r1-record-read-fields'
import * as causeRead from '@features/work-orders/survey-leakage-cause-read'
import * as workspace from '@features/work-orders/action-workspace'
import { normalSurveyCauseReadFixture } from '../support/normal-survey-cause-read-fixture'
import type { SessionSnapshot } from '@shared/ports'

type Host = { type: string; props: Record<string, any>; text: string; children: Host[]; parent: Host | null }
const node = (type: string, text = ''): Host => ({ type, text, props: {}, children: [], parent: null })
const renderer = Vue.createRenderer<Host, Host>({
 patchProp: (n,k,_p,v) => { n.props[k]=v }, insert(n,p,anchor=null) { if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=anchor?p.children.indexOf(anchor):-1;if(i<0)p.children.push(n);else p.children.splice(i,0,n) },
 remove(n){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1)},createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),setText:(n,t)=>{n.text=t},setElementText:(n,t)=>{n.text=t;n.children=[]},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,
})
const Primitive=Vue.defineComponent({inheritAttrs:false,setup:(_p,c)=>()=>Vue.h('primitive',c.attrs,[c.slots.default?.(),c.slots.actions?.(),c.slots.heading?.()])})
const Button=Vue.defineComponent({inheritAttrs:false,emits:['tap'],setup:(_p,c)=>()=>Vue.h('button',{...c.attrs,onTap:()=>c.emit('tap')},c.slots.default?.())})
const Grouped=Vue.defineComponent({inheritAttrs:false,props:['visible','selectedIds','selectedLabels','readOnly','canOpen','testIdPrefix'],setup:(p,c)=>()=>p.visible?Vue.h('grouped',{...c.attrs,'data-testid':p.testIdPrefix,readOnly:p.readOnly,canOpen:p.canOpen,selectedIds:p.selectedIds},p.selectedLabels?.join('、')):Vue.createCommentVNode('hidden-cause')})
const modules:Record<string,unknown>={vue:Vue,'@shared/types':sharedTypes,'./r1-node-forms-read':readerPort,'./r1-repeat-actions-port':actionPort,'./r1-normal-form-drafts':drafts,'./r1-normal-file-values':files,'./r1-repeat-form':repeat,'./r1-record-read-fields':projection,'./survey-leakage-cause-read':causeRead,'../action-workspace':workspace}
function sfc(name:string):Vue.Component {
 const filename=path.resolve('src/features/work-orders/'+name+'.vue'),parsed=parse(fs.readFileSync(filename,'utf8'),{filename})
 const source=compileScript(parsed.descriptor,{id:'normal-survey-cause-'+name,inlineTemplate:true}).content.replaceAll('import.meta.env','({DEV:false})')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const m={exports:{} as {default:Vue.Component}}
 new Function('require','module','exports',js)((key:string)=>{if(key==='./components/SurveyLeakageCauseExperience.vue')return{__esModule:true,default:sfc('components/SurveyLeakageCauseExperience')};if(key==='./R1NodeFormsReadPanel.vue')return{__esModule:true,default:sfc('R1NodeFormsReadPanel')};if(key==='@shared/ui/AppGroupedMultiSelectField.vue')return{__esModule:true,default:Grouped};if(key==='@shared/ui/AppButton.vue')return{__esModule:true,default:Button};if(key.endsWith('.vue'))return{__esModule:true,default:Primitive};if(!(key in modules))throw Error('Unmapped actual SFC dependency '+key);return modules[key]},m,m.exports)
 return m.exports.default
}
const all=(n:Host):Host[]=>[n,...n.children.flatMap(all)]
const text=(n:Host):string=>n.text+n.children.map(text).join('')
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await Vue.nextTick()}}
function harness(){
 const f=normalSurveyCauseReadFixture(),env={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_R1_FORMS_ACTIONS:'false',VITE_XLINK_R1_REPEAT_ACTIONS:'false'}
 let session={sessionRef:'synthetic-session',user:{id:'u'},currentRole:{id:'r'},capabilityNames:[]} as unknown as SessionSnapshot,listed=true
 const execute=vi.fn(f.execute),reader=createNormalNodeFormsReader({auth:{getCurrentSession:()=>session},read:{listWorkOrders:vi.fn(async()=>({state:'succeeded',data:{items:[{id:'s'}],totalCount:1,page:1,pageSize:20}})),isWorkOrderListedForCurrentSession:()=>listed,getDynamicCodeOptions:vi.fn(async()=>{throw Error('No lossy generic provider')})} as any,tenantId:'t',env,origin:'http://127.0.0.1:5189',transport:{execute}})
 const originalSession=session
 const provider=createSurveyLeakageCauseProvider({execute}),props=Vue.reactive({workOrderId:'s',node:{id:'n',runId:'w',sourceNodeType:'repeat',category:'repeat',lifecycle:'active',formDefinitionId:'e',formFieldIdsReadOnly:f.fields.map(row=>row._id)},actorScope:'synthetic-actor',visible:true})
 return{f,reader,provider,props,execute,revoke:()=>{session={...session,currentRole:{id:'other'} as never}},unlist:()=>{listed=false},restore:()=>{session=originalSession;listed=true}}
}
describe('normal readonly Survey cause experience uses actual normal controller',()=>{
 it('fixture positively reads captured binding and typed numeric zero without writes',async()=>{
  const h=harness(),snapshot=await h.reader.load('s','n')
  expect(h.reader.isCurrent(snapshot)).toBe(true);expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]!.values).toMatchObject({part:['1','130'],leakageCause:['cause-a'],width:0})
  expect(projection.projectR1RecordReadFields(snapshot.definition,snapshot.records[0]!)).toEqual(expect.arrayContaining([expect.objectContaining({valueKey:'width',text:'0'}),expect.objectContaining({valueKey:'leakageCause',text:'未解析（cause-a）'})]))
  expect(h.f.commands).toEqual([]);expect(h.f.uploads).toEqual([]);expect(h.f.processes).toEqual([])
 })
 it('normal ActionContent+Panel renders existing readonly cause experience with provider labels',async()=>{
  const h=harness(),root=node('root'),app=renderer.createApp(sfc('R1NodeFormsActionContent'),h.props)
  app.provide(readerPort.r1NodeFormsReaderKey,h.reader)
  app.provide(causeRead.surveyLeakageCauseReadKey,{provider:h.provider,tenantId:'t'})
  try{app.mount(root);await settle();const read=all(root).find(n=>n.type==='button'&&text(n).includes('读取已保存表单'));expect(read).toBeDefined();await read!.props.onTap();await vi.waitFor(()=>expect(all(root).filter(n=>n.props['data-testid']==='r1-normal-form-record')).toHaveLength(1))
   expect(text(root)).toContain('0');await vi.waitFor(()=>expect(text(root)).toContain('原因A'))
   expect(h.f.calls.filter(p=>p==='biz/extForm/queryByColName/leakageCause')).toHaveLength(1)
   expect(h.f.commands).toEqual([]);expect(h.f.uploads).toEqual([]);expect(h.f.processes).toEqual([])
  }finally{app.unmount()}
 })
})

async function bound() {
 const h=harness(),snapshot=await h.reader.load('s','n'),source=Vue.shallowRef<{snapshot:readerPort.R1NodeFormsSnapshot;actorScope:string;workOrderId:string;nodeId:string}|null>({snapshot,actorScope:'synthetic-actor',workOrderId:'s',nodeId:'n'})
 const binding=causeRead.createNormalSurveyCauseRead({reader:h.reader,provider:h.provider,tenantId:'t',source:()=>source.value})
 await settle()
 return{...h,snapshot,source,binding,view:()=>binding.forRecord(snapshot,snapshot.records[0]!)}
}
function noCommands(h:ReturnType<typeof harness>){expect(h.f.commands).toEqual([]);expect(h.f.uploads).toEqual([]);expect(h.f.processes).toEqual([])}
describe('consumed readonly cause binding guard and lifecycle',()=>{
 it('resolves existing scoped provider labels but exposes readonly data only',async()=>{
  const h=await bound();try{await vi.waitFor(()=>expect(h.view()?.selectedLabels).toEqual(['原因A']))
   expect(h.view()).toMatchObject({visible:true,selectedIds:['cause-a']});expect(h.view()).not.toHaveProperty('applySelection')
   expect(h.f.calls.filter(p=>p==='biz/extForm/queryByColName/leakageCause')).toHaveLength(1);noCommands(h)
  }finally{h.binding.dispose()}
 })
 it.each(['role','listed','source-null','dispose'] as const)('retracts %s and never revives the old read',async change=>{
  const h=await bound();try{await vi.waitFor(()=>expect(h.view()?.selectedLabels).toEqual(['原因A']))
   const old=h.source.value
   if(change==='role')h.revoke();if(change==='listed')h.unlist();if(change==='source-null')h.source.value=null;if(change==='dispose')h.binding.dispose()
   expect(h.view()).toBeNull();h.restore();h.source.value=old;expect(h.view()).toBeNull();noCommands(h)
  }finally{h.binding.dispose()}
 })
 it('refuses record and snapshot copies instead of laundering private raw proof',async()=>{
  const h=await bound();try{
   expect(h.binding.forRecord(h.snapshot,{...h.snapshot.records[0]!})).toBeNull()
   expect(h.binding.forRecord({...h.snapshot},h.snapshot.records[0]!)).toBeNull();noCommands(h)
  }finally{h.binding.dispose()}
 })
 it('a fresh explicit reader load invalidates old binding and uses a new provider generation',async()=>{
  const h=await bound();try{
   const fresh=await h.reader.load('s','n');expect(h.view()).toBeNull()
   h.source.value={snapshot:fresh,actorScope:'synthetic-actor',workOrderId:'s',nodeId:'n'}
   await vi.waitFor(()=>expect(h.binding.forRecord(fresh,fresh.records[0]!)?.selectedLabels).toEqual(['原因A']))
   expect(h.view()).toBeNull();noCommands(h)
  }finally{h.binding.dispose()}
 })
 it.each(['root-exts-conflict','wrong-binding','wrong-preset'] as const)('denies dedicated UI for %s without authorizing a write',async change=>{
  const h=harness()
  if(change==='root-exts-conflict')(h.f.raw.exts as Record<string,unknown>).leakageCause=['other-cause']
  if(change==='wrong-binding')h.f.fields.find(f=>f.name==='leakageCause')!.multiple=false
  if(change==='wrong-preset')h.f.fields.find(f=>f.name==='leakageCause')!.preset=0
  let binding:ReturnType<typeof causeRead.createNormalSurveyCauseRead>|undefined
  try{const snapshot=await h.reader.load('s','n')
   binding=causeRead.createNormalSurveyCauseRead({reader:h.reader,provider:h.provider,tenantId:'t',source:()=>({snapshot,actorScope:'synthetic-actor',workOrderId:'s',nodeId:'n'})})
   await settle();expect(binding.forRecord(snapshot,snapshot.records[0]!)).toBeNull();noCommands(h)
  }finally{binding?.dispose()}
 })
 it('foreign record tenant is rejected by the actual reader before any domain display',async()=>{
  const h=harness();h.f.raw.tenantId='foreign';await expect(h.reader.load('s','n')).rejects.toThrow();noCommands(h)
 })
 it('duplicate provider IDs remain unresolved instead of acquiring a false verified label',async()=>{
  const h=harness();h.f.providerRows.push({part:'1',leakageCause:'cause-a',label:'歧义原因'})
  const snapshot=await h.reader.load('s','n'),binding=causeRead.createNormalSurveyCauseRead({reader:h.reader,provider:h.provider,tenantId:'t',source:()=>({snapshot,actorScope:'synthetic-actor',workOrderId:'s',nodeId:'n'})})
  try{await vi.waitFor(()=>expect(binding.forRecord(snapshot,snapshot.records[0]!)?.selectedLabels).toEqual(['未解析（cause-a）']));noCommands(h)}finally{binding.dispose()}
 })
 it('late old provider completion cannot overwrite a new read or survive leaving the host',async()=>{
  const h=harness();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});let count=0
  h.f.hook(async path=>{if(path==='biz/extForm/queryByColName/leakageCause'&&++count===1)await gate})
  const initial=await h.reader.load('s','n'),source=Vue.shallowRef<{snapshot:readerPort.R1NodeFormsSnapshot;actorScope:string;workOrderId:string;nodeId:string}|null>({snapshot:initial,actorScope:'synthetic-actor',workOrderId:'s',nodeId:'n'})
  const binding=causeRead.createNormalSurveyCauseRead({reader:h.reader,provider:h.provider,tenantId:'t',source:()=>source.value})
  try{await vi.waitFor(()=>expect(count).toBe(1));source.value=null;const fresh=await h.reader.load('s','n');source.value={snapshot:fresh,actorScope:'synthetic-actor',workOrderId:'s',nodeId:'n'}
   await vi.waitFor(()=>expect(binding.forRecord(fresh,fresh.records[0]!)?.selectedLabels).toEqual(['原因A']))
   h.f.providerRows[0]!.label='过期原因';release();await settle();expect(binding.forRecord(fresh,fresh.records[0]!)?.selectedLabels).toEqual(['原因A'])
   source.value=null;expect(binding.forRecord(fresh,fresh.records[0]!)).toBeNull();noCommands(h)
  }finally{release();binding.dispose()}
 })
})

it.each(['workOrderId','nodeId','actorScope'] as const)('consumed source %s change cannot revive its prior binding on restoration',async key=>{
 const h=await bound();try{await vi.waitFor(()=>expect(h.view()?.selectedLabels).toEqual(['原因A']))
  const old=h.source.value!;h.source.value={...old,[key]:'foreign-source'};expect(h.view()).toBeNull()
  h.source.value=old;expect(h.view()).toBeNull();noCommands(h)
 }finally{h.binding.dispose()}
})
it('actual normal reader freezes saved values against an in-place mutation',async()=>{
 const h=await bound();try{await vi.waitFor(()=>expect(h.view()?.selectedLabels).toEqual(['原因A']))
  const values=h.snapshot.records[0]!.values as Record<string,unknown>;expect(Object.isFrozen(values)).toBe(true)
  expect(()=>{values.width=9}).toThrow();expect(values.width).toBe(0);expect(h.view()?.selectedLabels).toEqual(['原因A']);noCommands(h)
 }finally{h.binding.dispose()}
})

async function reactiveHost(h:ReturnType<typeof harness>){
 const root=node('root'),Content=sfc('R1NodeFormsActionContent'),app=renderer.createApp(Vue.defineComponent({setup:()=>()=>Vue.h(Content,{...h.props})}))
 app.provide(readerPort.r1NodeFormsReaderKey,h.reader);app.provide(causeRead.surveyLeakageCauseReadKey,{provider:h.provider,tenantId:'t'})
 app.mount(root);await settle()
 const load=async()=>{const read=all(root).find(n=>n.type==='button'&&text(n).includes('读取已保存表单'));expect(read).toBeDefined();read!.props.onTap();await vi.waitFor(()=>expect(all(root).filter(n=>n.props['data-testid']==='r1-normal-value-width')).toHaveLength(1))}
 const expectCleared=()=>{expect(all(root).filter(n=>n.props['data-testid']==='r1-normal-value-width')).toHaveLength(0);expect(all(root).filter(n=>n.props['data-testid']==='survey-leakage-cause-read')).toHaveLength(0);expect(text(root)).not.toContain('原因A')}
 return{root,app,load,expectCleared}
}
describe('actual reactive normal host retracts all old read content',()=>{
 it('work order and node replacements clear both scalar and cause DOM',async()=>{
  for(const target of ['work','node'] as const){
   const h=harness(),mounted=await reactiveHost(h)
   try{await mounted.load();await vi.waitFor(()=>expect(text(mounted.root)).toContain('原因A'))
    if(target==='work')h.props.workOrderId='foreign-work';else h.props.node={...h.props.node,id:'foreign-node'}
    await settle();mounted.expectCleared();noCommands(h)
   }finally{mounted.app.unmount()}
  }
 })
 it('actor scope plus actual role revocation clear scalar and cause DOM without restoring on identity return',async()=>{
  const h=harness(),mounted=await reactiveHost(h)
  try{await mounted.load();await vi.waitFor(()=>expect(text(mounted.root)).toContain('原因A'))
   h.revoke();h.props.actorScope='other-actor';await settle();mounted.expectCleared()
   h.restore();h.props.actorScope='synthetic-actor';await settle();mounted.expectCleared();noCommands(h)
  }finally{mounted.app.unmount()}
 })
 it('leaving while provider is held clears scalar DOM and cannot render a late cause response',async()=>{
  const h=harness();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});let arrived=false
  h.f.hook(async path=>{if(path==='biz/extForm/queryByColName/leakageCause'){arrived=true;await gate}})
  const mounted=await reactiveHost(h)
  try{await mounted.load();await vi.waitFor(()=>expect(arrived).toBe(true));expect(text(mounted.root)).toContain('0')
   h.props.visible=false;await settle();mounted.expectCleared();release();await settle();mounted.expectCleared()
   h.props.visible=true;await settle();mounted.expectCleared();noCommands(h)
  }finally{release();mounted.app.unmount()}
 })
})
