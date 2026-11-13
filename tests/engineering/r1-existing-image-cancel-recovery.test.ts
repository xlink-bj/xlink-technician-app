import {it,expect,vi} from 'vitest'
import * as Vue from 'vue'
import {component,node,renderer,find,settle} from '../support/normal-appointment-experience-harness'
import {r1RepeatActionsKey} from '@features/work-orders/r1-repeat-actions-port'
import {r1NormalFormDraftsKey} from '@features/work-orders/r1-normal-form-drafts'
import {formDefinition} from '@adapters/api/read-models/form'
import {asOpaqueId} from '@shared/types'

it('retries failed draft cleanup after existing media cancel consumed its session',async()=>{
 const def=formDefinition({data:[{_id:'photo',name:'photo',nameDisp:'Photo',type:'file',required:0,readOnly:0,preset:0,colName:'notes'}]},asOpaqueId<'FormDefinitionId'>('e'))
 const snapshot:any={workOrderId:'s',definition:def,fillableFieldIds:['photo'],records:[{id:'saved',definitionId:def.id,values:{photo:[]}}],node:{id:'n',runId:'w',formDefinitionId:'e',sourceNodeType:'repeat',category:'repeat',lifecycle:'active',formFieldIdsReadOnly:[]}}
 let session:any
 const media:any={revision:Vue.ref(0),busy:()=>false,message:()=>'',values:()=>[],canPick:()=>true,ready:()=>true,inspect:async()=>true,dispose:vi.fn(),cancel:vi.fn(async()=>{session=undefined;return true})}
 const actions:any={get fileMedia(){return session},retainedFiles:true,locked:()=>false,canCreate:()=>false,canComplete:()=>false,canEdit:()=>true,
  beginEdit:()=>{session=media;return true},initialValues:()=>({photo:[]}),validateDraft:()=>true,saveOnly:vi.fn()}
 // Existing drafts can remain blocked after a record appears or schema changes.
 // The real provider permits explicit discard of such a non-uncertain draft.
 const discard=vi.fn().mockRejectedValueOnce(Error('synthetic local storage failure')).mockResolvedValue(undefined)
 const drafts:any={open:()=>({read:async()=>({state:'blocked',message:'Existing unfinished draft requires explicit cleanup'}),discard,save:vi.fn(),complete:vi.fn(),markUncertain:vi.fn()})}
 const reader:any={enabled:()=>true,isCurrent:(s:any)=>s===snapshot,load:async()=>snapshot,clear:vi.fn()}
 const root=node('root'),Panel=component('R1NodeFormsReadPanel')
 const app=renderer.createApp({render:()=>Vue.h(Panel,{reader,workOrderId:'s',runtimeNodeId:'n',actorScope:'actor-a'})})
 app.provide(r1RepeatActionsKey,{forSnapshot:()=>actions});app.provide(r1NormalFormDraftsKey,drafts);app.mount(root)
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id)
 try{
  find(root,n=>n.type==='button')!.props.onTap();await settle()
  get('r1-normal-edit-saved')!.props.onTap();await settle()
  get('r1-normal-edit-cancel')!.props.onTap();await settle()
  expect(media.cancel).toHaveBeenCalledTimes(1);expect(discard).toHaveBeenCalledTimes(1)
  expect(get('r1-normal-create')).toBeDefined()
  get('r1-normal-edit-cancel')!.props.onTap();await settle()
  expect(discard).toHaveBeenCalledTimes(2)
  expect(get('r1-normal-create')).toBeUndefined();expect(actions.saveOnly).not.toHaveBeenCalled()
 }finally{app.unmount()}
})

it('keeps the existing editor when retried draft cleanup still fails after media cancellation',async()=>{
 const def=formDefinition({data:[{_id:'photo',name:'photo',nameDisp:'Photo',type:'file',required:0,readOnly:0,preset:0,colName:'notes'}]},asOpaqueId<'FormDefinitionId'>('e'))
 const snapshot:any={workOrderId:'s',definition:def,fillableFieldIds:['photo'],records:[{id:'saved',definitionId:def.id,values:{photo:[]}}],node:{id:'n',runId:'w',formDefinitionId:'e',sourceNodeType:'repeat',category:'repeat',lifecycle:'active',formFieldIdsReadOnly:[]}}
 let session:any
 const media:any={revision:Vue.ref(0),busy:()=>false,message:()=>'',values:()=>[],canPick:()=>true,ready:()=>true,inspect:async()=>true,dispose:vi.fn(),cancel:vi.fn(async()=>{session=undefined;return true})}
 const actions:any={get fileMedia(){return session},retainedFiles:true,locked:()=>false,canCreate:()=>false,canComplete:()=>false,canEdit:()=>true,
  beginEdit:()=>{session=media;return true},initialValues:()=>({photo:[]}),validateDraft:()=>true,saveOnly:vi.fn()}
 // Existing drafts can remain blocked after a record appears or schema changes.
 // The real provider permits explicit discard of such a non-uncertain draft.
 const discard=vi.fn().mockRejectedValue(Error('synthetic local storage failure'))
 const drafts:any={open:()=>({read:async()=>({state:'blocked',message:'Existing unfinished draft requires explicit cleanup'}),discard,save:vi.fn(),complete:vi.fn(),markUncertain:vi.fn()})}
 const reader:any={enabled:()=>true,isCurrent:(s:any)=>s===snapshot,load:async()=>snapshot,clear:vi.fn()}
 const root=node('root'),Panel=component('R1NodeFormsReadPanel')
 const app=renderer.createApp({render:()=>Vue.h(Panel,{reader,workOrderId:'s',runtimeNodeId:'n',actorScope:'actor-a'})})
 app.provide(r1RepeatActionsKey,{forSnapshot:()=>actions});app.provide(r1NormalFormDraftsKey,drafts);app.mount(root)
 const get=(id:string)=>find(root,n=>n.props['data-testid']===id)
 try{
  find(root,n=>n.type==='button')!.props.onTap();await settle()
  get('r1-normal-edit-saved')!.props.onTap();await settle()
  get('r1-normal-edit-cancel')!.props.onTap();await settle()
  expect(media.cancel).toHaveBeenCalledTimes(1);expect(discard).toHaveBeenCalledTimes(1)
  expect(get('r1-normal-create')).toBeDefined()
  get('r1-normal-edit-cancel')!.props.onTap();await settle()
  expect(discard).toHaveBeenCalledTimes(2)
  expect(get('r1-normal-create')).toBeDefined();expect(actions.saveOnly).not.toHaveBeenCalled()
 }finally{app.unmount()}
})
