import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StoragePort, StorageKey, WorkflowNodeRead } from '@shared/ports'

/**
 * Client-only multi-form action queue. Every operation is a DRAFT INTENT,
 * never a backend command. Do not turn these records into R1 _id or
 * workflows without separate form-schema, read and write verification.
 */
export interface R1LocalFormIntent {
  readonly localId: string
  readonly kind: 'new' | 'edit_title' | 'delete'
  readonly targetFormDataId?: string
  readonly definitionId: string
  readonly title: string
}
export interface R1LocalFormScope {
  readonly actorScope: string
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly formDefinitionId?: string
}
export interface R1LocalFormSnapshot {
  readonly version: 1
  readonly nextSequence: number
  readonly intents: readonly R1LocalFormIntent[]
}
const initial: R1LocalFormSnapshot = { version: 1, nextSequence: 1, intents: [] }
type DraftState = 'idle' | 'loading' | 'ready' | 'failed'
const inFlight = new Set<string>()
function key(scope:R1LocalFormScope): StorageKey {
  return { namespace:'draft',key:['r1-forms-local:v1',
    scope.actorScope,scope.workOrderId,scope.runtimeNodeId,scope.sourceNodeType,
  ].map(encodeURIComponent).join(':') }
}
function validated(value: unknown): value is R1LocalFormSnapshot {
  if (!value || typeof value!=='object' || Array.isArray(value)) return false
  const o=value as Record<string,unknown>
  if(o.version!==1 || typeof o.nextSequence!=='number' || !Number.isInteger(o.nextSequence)
    || o.nextSequence<1 || o.nextSequence>10000 || !Array.isArray(o.intents)
    || o.intents.length>50)return false
  const seen=new Set<string>()
  for (const item of o.intents) {
    if (!item || typeof item!=='object' || Array.isArray(item)) return false
    const q=item as Record<string,unknown>
    if(typeof q.localId!=='string'||!/^local-[1-9][0-9]*$/.test(q.localId)||seen.has(q.localId)
      ||!['new','edit_title','delete'].includes(String(q.kind))
      ||typeof q.definitionId!=='string'||!q.definitionId.trim()
      ||typeof q.title!=='string'||q.title.length>80)return false
    if(q.kind!=='new' && (typeof q.targetFormDataId!=='string'||!q.targetFormDataId.trim()))return false
    if(q.kind==='new' && q.targetFormDataId!==undefined)return false
    seen.add(q.localId)
  }
  return true
}
export const useR1LocalFormDraftStore=defineStore('r1LocalFormDraft',()=>{
  const state=ref<DraftState>('idle')
  const snapshot=ref<R1LocalFormSnapshot>(initial)
  const message=ref('')
  let storage:StoragePort|null=null
  let current:R1LocalFormScope|null=null
  let currentNode:WorkflowNodeRead|null=null
  let version=0

  function configure(port:StoragePort){storage=port}
  function clear() {
    version++;current=null;currentNode=null
    snapshot.value=initial;state.value='idle';message.value=''
  }
  async function open(scope:R1LocalFormScope,node:WorkflowNodeRead):Promise<void> {
    clear()
    const ticket=version
    if(!storage||!scope.actorScope||!scope.workOrderId||!scope.runtimeNodeId
      ||String(node.id)!==scope.runtimeNodeId||node.sourceNodeType!==scope.sourceNodeType) {
      state.value='failed';message.value='当前身份或节点无法安全恢复草稿。';return
    }
    current=scope;currentNode=node;state.value='loading'
    try {
      const read=await storage.read<R1LocalFormSnapshot>(key(scope))
      if(ticket!==version)return
      if(read.state!=='succeeded'||(read.data!==null&&!validated(read.data))){
        state.value='failed';message.value='草稿读取或格式校验失败，禁止覆盖。';return
      }
      snapshot.value=read.data??initial
      state.value='ready'
    } catch {
      if(ticket!==version)return
      state.value='failed';message.value='本地草稿无法读取。'
    }
  }
  function permitted():boolean{
    if(!current||!currentNode||!storage||state.value!=='ready')return false
    const list=currentNode.formList
    return list?.evidence==='available' && !list.truncated && list.entries.length<=50
      && String(currentNode.id)===current.runtimeNodeId
      && currentNode.sourceNodeType===current.sourceNodeType
  }
  async function update(create:(previous:R1LocalFormSnapshot,node:WorkflowNodeRead,scope:R1LocalFormScope)=>R1LocalFormSnapshot|undefined):Promise<boolean>{
    const port=storage,scope=current,node=currentNode
    if(!port||!scope||!node||!permitted()) {
      message.value='当前节点的表单记录尚未完整核验，仅可查看。';return false
    }
    const k=key(scope).key
    if(inFlight.has(k))return false
    inFlight.add(k)
    const ticket=version
    // This is only a local-draft write; nonetheless serialize it within one
    // instance and refuse stale session or switched-node updates.
    try {
      const read=await port.read<R1LocalFormSnapshot>(key(scope))
      if(read.state!=='succeeded'||(read.data!==null&&!validated(read.data))){
        message.value='保存前草稿读取失败，不会覆盖原数据。';return false
      }
      if(ticket!==version)return false
      const next=create(read.data??initial,node,scope)
      if(!next||!validated(next))return false
      const write=await port.write(key(scope),next)
      if(write.state!=='succeeded'||ticket!==version){
        message.value='本地草稿保存失败；请勿认为已保存。';return false
      }
      snapshot.value=next;message.value='已保存在本机，尚未提交到业务系统。'
      return true
    }catch{message.value='本地存储失败；没有发送任何业务命令。';return false}
    finally{inFlight.delete(k)}
  }
  async function add(title:string,formDefinitionId?:string):Promise<boolean> {
    const name=title.trim().slice(0,80)
    if(!name){message.value='请输入草稿名称。';return false}
    return update((previous,_node,scope)=>{
      const id=(formDefinitionId??scope.formDefinitionId)?.trim()
      if(!id){message.value='当前节点未提供已核验的表单定义，不能创建草稿。';return undefined}
      if(previous.intents.length>=50||previous.nextSequence>=10000)return undefined
      return {version:1,nextSequence:previous.nextSequence+1,
        intents:[...previous.intents,{localId:`local-${previous.nextSequence}`,kind:'new',definitionId:id,title:name}]}
    })
  }
  async function stageDelete(recordId:string):Promise<boolean> {
    return update((previous,node)=>{
      const existing=node.formList?.entries.find(x=>String(x.id)===recordId&&x.state!=='deleted')
      if(!existing||previous.intents.some(x=>x.targetFormDataId===recordId))return undefined
      return {...previous,nextSequence:previous.nextSequence+1,
        intents:[...previous.intents,{localId:`local-${previous.nextSequence}`,kind:'delete',
          targetFormDataId:recordId,definitionId:String(existing.formDefinitionId??node.formDefinitionId??''),
          title:existing.title??'未命名表单'}]}
    })
  }
  async function stageEditTitle(recordId:string,title:string):Promise<boolean> {
    const name=title.trim().slice(0,80)
    if(!name)return false
    return update((previous,node)=>{
      const existing=node.formList?.entries.find(x=>String(x.id)===recordId&&x.state!=='deleted')
      const definition=existing?.formDefinitionId??node.formDefinitionId
      if(!existing||!definition||previous.intents.some(x=>x.targetFormDataId===recordId))return undefined
      return {...previous,nextSequence:previous.nextSequence+1,
        intents:[...previous.intents,{localId:`local-${previous.nextSequence}`,kind:'edit_title',
          targetFormDataId:recordId,definitionId:String(definition),title:name}]}
    })
  }
  async function discard(localId:string):Promise<boolean> {
    return update(previous=>({...previous,intents:previous.intents.filter(x=>x.localId!==localId)}))
  }
  return {state,snapshot,message,configure,clear,open,add,stageDelete,stageEditTitle,discard}
})
