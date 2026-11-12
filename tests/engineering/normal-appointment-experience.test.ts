import {it,expect,beforeEach,afterEach,vi} from 'vitest'
import {createPinia,setActivePinia} from 'pinia'
import * as Vue from 'vue'
import {appointmentFixture} from '../support/normal-appointment-experience-fixture'
import {component,node,renderer,find,all,text,settle} from '../support/normal-appointment-experience-harness'
import {r1RepeatActionsKey} from '@features/work-orders/r1-repeat-actions-port'
import {r1NodeFormsReaderKey} from '@features/work-orders/r1-node-forms-read'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
beforeEach(()=>{setActivePinia(createPinia());installLocalFixtureBrowser()});afterEach(()=>vi.unstubAllGlobals())
async function mounted(host=true,multiple=false){const f=appointmentFixture();if(multiple){const grant=JSON.parse(f.env.VITE_XLINK_R1_REPEAT_GRANT);grant.recordIds=['a','b'];f.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify(grant)}const s=await f.load(),root=node('root'),Panel=component('R1NodeFormsReadPanel'),Content=host?component('R1NodeFormsActionContent',Panel):Panel
 const props=Vue.reactive({reader:f.reader,workOrderId:'s',runtimeNodeId:'n',actorScope:'actor-A',node:s.node,visible:true})
 const app=renderer.createApp(Vue.defineComponent({setup:()=>()=>Vue.h(Content,props)}));app.component('picker',Vue.defineComponent({inheritAttrs:false,setup:(_,ctx)=>()=>Vue.h('picker',ctx.attrs,ctx.slots.default?.())}));app.provide(r1NodeFormsReaderKey,f.reader);app.provide(r1RepeatActionsKey,f.provider());app.mount(root);await settle()
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id),tap=async(id:string)=>{const n=get(id);expect(n,id).toBeDefined();expect(n!.props.disabled).not.toBe(true);await n!.props.onTap();await settle()}
 const read=async()=>{find(root,n=>n.type==='button'&&text(n).includes('读取已保存表单'))!.props.onTap();await settle()}
 const fill=async(key:string,value:string)=>{const n=find(root,n=>n.props['data-key']===key);expect(n,key).toBeDefined();n!.props.onInput(value);await settle()}
 const time=async()=>{await tap('normal-appointment-time-open');const b=all(root,n=>n.type==='button'&&text(n)==='14:00')[0];expect(b).toBeDefined();b.props.onTap();await settle()}
 return{f,app,root,props,get,tap,read,fill,time}}
it('host consumes pure appointment time and confirmation through Panel exact-ID save-only',async()=>{
 const h=await mounted();try{await h.read();await h.tap('r1-normal-edit-a');expect(h.get('normal-appointment-experience')).toBeDefined()
 await h.fill('modifyReason','confirmed change');await h.time();await h.tap('normal-appointment-time-cancel');expect(text(h.get('normal-appointment-time-open')!)).toContain('10:30');expect(h.f.writes).toHaveLength(0)
 await h.time();await h.tap('normal-appointment-time-confirm');expect(text(h.get('normal-appointment-time-open')!)).toContain('14:00');await h.tap('normal-appointment-review');await h.tap('normal-appointment-review-back');await h.fill('note','same controller');await h.tap('normal-appointment-review')
 const save=h.get('normal-appointment-save')!;save.props.onTap();save.props.onTap();await settle();expect(h.f.writes).toHaveLength(1);const value=JSON.parse(h.f.writes[0].body.dataStr);expect(value).toMatchObject({_id:'a',note:'same controller',modifyReason:'confirmed change',datetime:'2026-11-12 14:00'});expect(h.f.other.note).toBe('other')
 }finally{h.app.unmount()}})
it('old confirmation cannot save after cancel and reopening the same record',async()=>{
 const h=await mounted();try{await h.read();await h.tap('r1-normal-edit-a');await h.fill('modifyReason','first edit');await h.tap('normal-appointment-review');const old=h.get('normal-appointment-save')!.props.onTap
 await h.tap('r1-normal-edit-cancel');await h.tap('r1-normal-edit-a');await h.fill('note','new editor');old();await settle();expect(h.f.writes).toHaveLength(0);expect(find(h.root,n=>n.props['data-key']==='note')!.props.value).toBe('new editor')
 }finally{h.app.unmount()}})
it('role revocation removes presentation and rejects a delayed time confirmation',async()=>{
 const h=await mounted();try{await h.read();await h.tap('r1-normal-edit-a');await h.time();const old=h.get('normal-appointment-time-confirm')!.props.onTap;h.f.changeRole();h.props.actorScope='actor-B';await settle();old();await settle();expect(h.get('normal-appointment-experience')).toBeUndefined();expect(h.f.writes).toHaveLength(0)
 }finally{h.app.unmount()}})
it('fresh changed original rejects an old confirmation without dispatch',async()=>{
 const h=await mounted();try{await h.read();await h.tap('r1-normal-edit-a');await h.fill('modifyReason','old edit');await h.tap('normal-appointment-review');const old=h.get('normal-appointment-save')!.props.onTap;h.f.record.note='server changed';await h.read();old();await settle();expect(h.get('normal-appointment-experience')).toBeUndefined();expect(h.f.writes).toHaveLength(0)
 }finally{h.app.unmount()}})
it('Panel without the optional consumer retains the original generic editor',async()=>{
 const h=await mounted(false);try{await h.read();await h.tap('r1-normal-edit-a');expect(h.get('normal-appointment-experience')).toBeUndefined();expect(find(h.root,n=>n.props['data-key']==='datetime')).toBeDefined();expect(h.f.writes).toHaveLength(0)
 }finally{h.app.unmount()}})

it('record-keyed presentation rejects A confirmation after an authorized switch to B',async()=>{
 const h=await mounted(true,true);try{await h.read();await h.tap('r1-normal-edit-a');await h.fill('modifyReason','A confirmed');await h.tap('normal-appointment-review');const old=h.get('normal-appointment-save')!.props.onTap;await h.tap('r1-normal-edit-b');expect(h.get('normal-appointment-review')).toBeDefined();await h.fill('modifyReason','B edit');old();await settle();expect(h.f.writes).toHaveLength(0);expect(find(h.root,n=>n.props['data-key']==='note')!.props.value).toBe('other')}finally{h.app.unmount()}
})
