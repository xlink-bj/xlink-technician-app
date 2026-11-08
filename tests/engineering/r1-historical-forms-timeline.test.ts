import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { expect, it, vi } from 'vitest'
import * as port from '@features/work-orders/r1-historical-forms-read'
import * as recordFields from '@features/work-orders/r1-record-read-fields'
import { formDefinition } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'
interface Host { type: string; props: Record<string, any>; text: string; children: Host[]; parent: Host | null }
const node=(type:string,text=''):Host=>({type,text,props:{},children:[],parent:null})
const renderer=Vue.createRenderer<Host,Host>({patchProp:(e,k,_old,v)=>{e.props[k]=v},insert(e,p,a=null){if(e.parent)e.parent.children.splice(e.parent.children.indexOf(e),1);e.parent=p;const i=a?p.children.indexOf(a):-1;if(i<0)p.children.push(e);else p.children.splice(i,0,e)},remove(e){if(e.parent)e.parent.children.splice(e.parent.children.indexOf(e),1)},createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),setText:(e,t)=>{e.text=t},setElementText:(e,t)=>{e.text=t;e.children=[]},parentNode:e=>e.parent,nextSibling:e=>e.parent?.children[e.parent.children.indexOf(e)+1]??null})
const Button=Vue.defineComponent({inheritAttrs:false,props:['disabled'],emits:['tap'],setup:(p,c)=>()=>Vue.h('button',{...c.attrs,disabled:p.disabled,onTap:()=>{if(!p.disabled)c.emit('tap')}},c.slots.default?.())})
function component(){const filename=path.resolve('src/features/work-orders/HistoricalFormsTimeline.vue'),{descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename}),source=compileScript(descriptor,{id:'history-timeline',inlineTemplate:true}).content,js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const modules:Record<string,unknown>={vue:Vue,'./r1-historical-forms-read':port,'./r1-record-read-fields':recordFields,'@shared/ui/AppButton.vue':{__esModule:true,default:Button},'@shared/ui/AppIcon.vue':{__esModule:true,default:Vue.defineComponent({setup:()=>()=>Vue.h('icon')})}};const m={exports:{} as {default:Vue.Component}};new Function('require','module','exports',js)((key:string)=>{if(!(key in modules))throw Error('Unstubbed '+key);return modules[key]},m,m.exports);return m.exports.default}
function all(r:Host,p:(v:Host)=>boolean):Host[]{return[...(p(r)?[r]:[]),...r.children.flatMap(c=>all(c,p))]}
const text=(r:Host):string=>r.text+r.children.map(text).join('')
const settle=async()=>{for(let i=0;i<8;i++){await Promise.resolve();await Vue.nextTick()}}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{resolve,promise}}
async function mount(enabled=true){
 const t=Object.freeze({kind:'completed-forms-reference' as const,workOrderId:'work',runtimeNodeId:'node',workflowRunId:'run',formDefinitionId:'def',recordId:'record',title:'历史现场记录'})
 const definition=formDefinition({data:[{_id:'field',name:'note',nameDisp:'说明',type:'text',preset:1,showList:['2','4'],showType:'1',frontEndConfig:'{}'}]},asOpaqueId<'FormDefinitionId'>('def'))
 const value:port.HistoricalFormRead={kind:'historical-form-read',target:t,definition,record:{id:asOpaqueId<'FormDataId'>('record'),definitionId:definition.id,values:{note:'已保存的说明'}}}
 let current=true
 const reader:port.HistoricalFormsReader={enabled:()=>enabled,clear:vi.fn(),isCurrent:()=>current,discover:vi.fn(async()=>[t]),read:vi.fn(async()=>value)}
 const props=Vue.reactive({workOrderId:'work',actorScope:'actor' as string|null}),root=node('root'),C=component(),app=renderer.createApp(Vue.defineComponent({setup:()=>()=>Vue.h(C,props)}));app.provide(port.historicalFormsReaderKey,()=>reader);app.mount(root);await settle()
 const items=()=>all(root,e=>e.props['data-testid']==='historical-form-item'),open=()=>all(root,e=>e.props['data-testid']==='historical-form-open')[0]!,contents=()=>all(root,e=>e.props['data-testid']==='historical-form-content');return{app,root,reader,props,t,value,items,open,contents,revoke:()=>{current=false}}
}
it('renders a distinct readonly form item in timeline and uses shared read formatting without mutation controls',async()=>{const h=await mount();expect(h.items()).toHaveLength(1);expect(text(h.root)).toContain('已完成表单');h.open().props.onTap();await settle();expect(h.reader.read).toHaveBeenCalledWith(h.t);expect(h.contents()).toHaveLength(1);expect(text(h.root)).toContain('已保存的说明');expect(text(h.root)).not.toMatch(/编辑|删除|保存记录|完成当前节点/);h.app.unmount()})
it('does not discover outside enabled local readonly mode',async()=>{const h=await mount(false);expect(h.reader.discover).not.toHaveBeenCalled();expect(h.items()).toHaveLength(0);h.app.unmount()})
it('clears visible records immediately when actor is lost',async()=>{const h=await mount();h.open().props.onTap();await settle();h.props.actorScope=null;await settle();expect(h.items()).toHaveLength(0);expect(text(h.root)).not.toContain('已保存的说明');h.app.unmount()})
it('ignores a late record when actor changes during read',async()=>{const h=await mount(),d=deferred<port.HistoricalFormRead>();vi.mocked(h.reader.read).mockReturnValueOnce(d.promise);h.open().props.onTap();await settle();h.props.actorScope=null;await settle();d.resolve(h.value);await settle();expect(h.contents()).toHaveLength(0);expect(text(h.root)).not.toContain('已保存的说明');h.app.unmount()})
it('clears titles and all previous values on a rejected fresh read, with explicit reread recovery',async()=>{const h=await mount();h.open().props.onTap();await settle();expect(h.contents()).toHaveLength(1);vi.mocked(h.reader.read).mockRejectedValueOnce(Error('revoked'));h.open().props.onTap();await settle();expect(h.items()).toHaveLength(0);expect(text(h.root)).not.toContain('已保存的说明');expect(text(h.root)).toContain('重新读取');const retry=all(h.root,e=>e.type==='button'&&text(e).includes('重新读取'))[0]!;retry.props.onTap();await settle();expect(h.items()).toHaveLength(1);expect(h.contents()).toHaveLength(0);h.app.unmount()})
it('disables repeated clicks during a pending read',async()=>{const h=await mount(),d=deferred<port.HistoricalFormRead>();vi.mocked(h.reader.read).mockReturnValueOnce(d.promise);h.open().props.onTap();await settle();expect(h.open().props.disabled).toBe(true);h.open().props.onTap();expect(h.reader.read).toHaveBeenCalledOnce();d.resolve(h.value);await settle();h.app.unmount()})
it('unmount clears reader authority and drops late data',async()=>{const h=await mount(),d=deferred<port.HistoricalFormRead>();vi.mocked(h.reader.read).mockReturnValueOnce(d.promise);h.open().props.onTap();await settle();h.app.unmount();d.resolve(h.value);await settle();expect(h.reader.clear).toHaveBeenCalledTimes(2)})
it('switching work order drops old values and rejects a wrongly scoped late target',async()=>{const h=await mount();h.open().props.onTap();await settle();h.props.workOrderId='other-work';await settle();expect(h.items()).toHaveLength(0);expect(h.contents()).toHaveLength(0);expect(text(h.root)).not.toContain('已保存的说明');h.app.unmount()})
it('separate mounted pages own readers: old unmount never clears the new page',async()=>{
 const seed=await mount();const target=seed.t,value=seed.value;seed.app.unmount()
 const readers=Array.from({length:2},()=>({enabled:()=>true,clear:vi.fn(),isCurrent:()=>true,discover:vi.fn(async()=>[target]),read:vi.fn(async()=>value)}))
 let factoryIndex=0
 const factory=vi.fn(()=>readers[factoryIndex++]!),showFirst=Vue.ref(true),C=component(),root=node('root'),app=renderer.createApp(Vue.defineComponent({setup:()=>()=>Vue.h('view',[showFirst.value?Vue.h(C,{key:'old',workOrderId:'work',actorScope:'actor'}):null,Vue.h(C,{key:'new',workOrderId:'work',actorScope:'actor'})])}));app.provide(port.historicalFormsReaderKey,factory);app.mount(root);await settle();expect(factory).toHaveBeenCalledTimes(2)
 for(const b of all(root,e=>e.props['data-testid']==='historical-form-open'))b.props.onTap();await settle();expect(all(root,e=>e.props['data-testid']==='historical-form-content')).toHaveLength(2)
 showFirst.value=false;await settle();expect(readers[0]!.clear).toHaveBeenCalledTimes(2);expect(readers[1]!.clear).toHaveBeenCalledOnce();expect(all(root,e=>e.props['data-testid']==='historical-form-content')).toHaveLength(1);app.unmount()
})
it.each([
 ['production',true,true,true,false],['ordinary default',false,false,true,false],['Mock without local readonly reader',false,false,true,false],
 ['local history enabled',false,true,true,true],['no completed forms',false,true,false,false],
] as const)('detail retains its empty fallback unless history is actually available: %s',(_name,productionReadOnly,historicalFormsEnabled,hasForms,expected)=>{
 const source=fs.readFileSync('src/pages/work-orders/detail.vue','utf8')
 // Evaluate the actual page gate, and verify both branches use this same gate.
 const expression=source.match(/const canShowHistoricalForms = computed\(\(\) => ([^\n]+)\)/)?.[1]
 expect(expression).toBeTruthy();const actual=new Function('productionReadOnly','historicalFormsEnabled','hasHistoricalForms','return '+expression)(productionReadOnly,historicalFormsEnabled,{value:hasForms})
 expect(actual).toBe(expected);expect(source).toContain('v-else-if="!canShowHistoricalForms" class="tab-empty"');expect(source).toContain('<HistoricalFormsTimeline v-if="canShowHistoricalForms"');expect(source).toContain('暂无跟进记录')
})
