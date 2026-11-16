import {createApp,h,nextTick,ref} from 'vue'
import R1NormalFileField from '../../../src/features/work-orders/R1NormalFileField.vue'
import OrderMediaField from '../../../src/features/work-orders/quotation/OrderMediaField.vue'
import type {MediaUploadTask,R1FileWireValue} from '../../../src/shared/types'
import type {R1NormalFormFileSessionView} from '../../../src/features/work-orders/r1-normal-form-media-port'
import type {OrderMediaSession} from '../../../src/features/work-orders/quotation/order-field-session'

/** Actual component integration, like attachment-theme-states: synthetic props and
 * local callbacks only. Not an App business journey, queue/persistence or permission proof. */
export async function mountP08MixedAttachments(kind:'normal'|'order'){
 const host=document.createElement('div');host.id='p08-mixed-state';document.body.append(host)
 Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'3000',overflow:'auto',padding:'16px',boxSizing:'border-box',background:'var(--app-color-page)'})
 const original:readonly R1FileWireValue[]=[1,2].map(i=>({url:`https://attachment.example.invalid/old-${i}.png`,name:`/private/old-${i}.png`,extname:'png'}))
 const values=ref(original),revision=ref(0),discarded:string[]=[]
 const task={schemaVersion:1,taskId:'p08-local-failed-task',scope:{userId:'u',workOrderId:'w',workflowNodeId:'n',fieldId:'photos',valueKey:'photos',localAssetId:'p08-local-asset'},state:'failed_retryable',attempts:1,createdAt:'2026-11-16T00:00:00Z',updatedAt:'2026-11-16T00:00:01Z',lastError:{category:'network_retryable',message:'Synthetic rejection',retryable:true}} as MediaUploadTask
 let tasks:readonly MediaUploadTask[]=[task]
 const publish=()=>{host.dataset.remaining=JSON.stringify(values.value.map(x=>x.url));host.dataset.discarded=JSON.stringify(discarded)}
 const normal:R1NormalFormFileSessionView={revision,busy:()=>false,message:()=>'',values:()=>values.value,canPick:()=>false,ready:()=>false,inspect:async()=>true,cancel:async()=>false,pick:async()=>null,retry:async()=>null,
  items:()=>tasks.map(task=>({task,media:{mimeType:'image/png'},ambiguous:false})),
  remove:async(_field,index)=>values.value.filter((_v,i)=>i!==index),
  discardFailed:async(_field,_draft,id)=>{if(id!==task.taskId)throw Error('Wrong task');discarded.push(id);tasks=[];revision.value++;publish();return values.value},dispose:()=>{}}
 const order:OrderMediaSession={list:async()=>tasks,pick:async()=>{},retry:async()=>{},discard:async id=>{if(id!==task.taskId)throw Error('Wrong task');discarded.push(id);tasks=[];publish()},finalize:async()=>false,verify:async()=>false}
 const app=createApp({render:()=>h('div',[
  h('h2',{style:'font-size:18px'},kind==='normal'?'已有表单附件':'已有订单附件'),
  h('p','两份已保存附件与一份本次失败任务'),
  kind==='normal'?h(R1NormalFileField,{field:{fieldId:'photos',valueKey:'photos'},retained:true,commercial:true,media:normal,modelValue:values.value,
   'onUpdate:modelValue':(v:readonly R1FileWireValue[])=>{values.value=v;publish()}})
   :h(OrderMediaField,{fieldId:'photos',valueKey:'photos',media:order,disabled:false,modelValue:values.value,
    'onUpdate:modelValue':(v:readonly {url:string}[])=>{values.value=original.filter(x=>v.some(y=>y.url===x.url));publish()}}),
 ])})
 app.mount(host);publish();await nextTick();await nextTick()
}
