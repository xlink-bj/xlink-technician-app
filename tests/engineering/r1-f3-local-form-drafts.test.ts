import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useR1LocalFormDraftStore } from '@features/work-orders/r1-local-form-drafts'
import type { StorageKey, StoragePort, WorkflowNodeRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const scope = {
  actorScope:'actor:session-1:role-1', workOrderId:'work-order-A',
  runtimeNodeId:'runtime-A',sourceNodeType:'repeat' as const,
  formDefinitionId:'definition-R',
}
const node:WorkflowNodeRead={
  id:asOpaqueId<'WorkflowNodeRuntimeId'>('runtime-A'),category:'repeat',lifecycle:'active',
  sourceNodeType:'repeat',formDefinitionId:asOpaqueId<'FormDefinitionId'>('definition-R'),
  formList:{
    source:'formDataList',evidence:'available',truncated:false,entries:[
      {id:asOpaqueId<'FormDataId'>('saved-1'),formDefinitionId:asOpaqueId<'FormDefinitionId'>('definition-R'),title:'真实已保存表单',state:'active'},
      {id:asOpaqueId<'FormDataId'>('saved-2'),formDefinitionId:asOpaqueId<'FormDefinitionId'>('definition-R'),title:'已删除',state:'deleted'},
    ],
  },
}
function memory() {
  const records=new Map<string,unknown>()
  const port={
    read:vi.fn(async(key:StorageKey)=>({state:'succeeded' as const,data:records.get(key.key)??null})),
    write:vi.fn(async(key:StorageKey,value:unknown)=>{
      records.set(key.key,JSON.parse(JSON.stringify(value)))
      return {state:'succeeded' as const}
    }),
    remove:vi.fn(async(key:StorageKey)=>{records.delete(key.key);return {state:'succeeded' as const}}),
    listKeys:vi.fn(async()=>({state:'succeeded' as const,data:[...records.keys()]})),
  } as unknown as StoragePort
  return {records,port}
}
describe('F3 persistent LOCAL form intent UI store — no backend commands',()=>{
  beforeEach(()=>setActivePinia(createPinia()))
  it('fails closed when an App-owned synthetic preview policy is absent or throws',()=>{
    const {port}=memory()
    const store=useR1LocalFormDraftStore()
    store.configure(port)
    expect(store.isSyntheticMockDataModeEnabled()).toBe(false)
    store.configure(port,undefined,{
      isSyntheticMockDataModeEnabled:()=>{throw new Error('policy unavailable')},
    })
    expect(store.isSyntheticMockDataModeEnabled()).toBe(false)
    store.configure(port,undefined,{isSyntheticMockDataModeEnabled:()=>false})
    expect(store.isSyntheticMockDataModeEnabled()).toBe(false)
  })
  it('creates, edits, marks delete and discards local intents without assigning server IDs',async()=>{
    const {port,records}=memory()
    const store=useR1LocalFormDraftStore()
    store.configure(port)
    await store.open(scope,node)
    expect(store.state).toBe('ready')
    expect(await store.add(' 合成新增草稿 ')).toBe(true)
    expect(await store.stageEditTitle('saved-1','改名草稿')).toBe(true)
    expect(await store.stageDelete('saved-2')).toBe(false)
    expect(await store.stageDelete('saved-1')).toBe(false) // already staged edit for this ID
    expect(store.snapshot.intents).toMatchObject([
      {localId:'local-1',kind:'new',title:'合成新增草稿',definitionId:'definition-R'},
      {localId:'local-2',kind:'edit_title',targetFormDataId:'saved-1',title:'改名草稿'},
    ])
    expect(store.snapshot.intents[0]).not.toHaveProperty('targetFormDataId')
    expect(records.size).toBe(1)
    expect(await store.discard('local-2')).toBe(true)
    expect(await store.stageDelete('saved-1')).toBe(true)
    expect(store.snapshot.intents.map(x=>x.kind)).toEqual(['new','delete'])
    expect(JSON.stringify([...records.values()])).not.toContain('formData.values')
  })
  it('restores after a fresh pinia store, isolates actor and work order and forbids cross-scope edits',async()=>{
    const {port}=memory()
    const a=useR1LocalFormDraftStore()
    a.configure(port)
    await a.open(scope,node)
    expect(await a.add('现场草稿')).toBe(true)
    setActivePinia(createPinia())
    const restored=useR1LocalFormDraftStore()
    restored.configure(port)
    await restored.open(scope,node)
    expect(restored.snapshot.intents).toHaveLength(1)
    await restored.open({...scope,actorScope:'different-role'},node)
    expect(restored.snapshot.intents).toHaveLength(0)
    expect(await restored.add('其它角色自己的草稿')).toBe(true)
    await restored.open({...scope,workOrderId:'another-work-order'},node)
    expect(restored.snapshot.intents).toHaveLength(0)
    await restored.open(scope,node)
    expect(restored.snapshot.intents).toHaveLength(1)
  })
  it('blocks staging on malformed, truncated, missing and wrong-node evidence',async()=>{
    const {port}=memory()
    const s=useR1LocalFormDraftStore()
    s.configure(port)
    for(const formList of [
      {...node.formList!,evidence:'invalid' as const},
      {...node.formList!,truncated:true},
    ]){
      await s.open(scope,{...node,formList})
      expect(await s.add('不可操作')).toBe(false)
      expect(await s.stageDelete('saved-1')).toBe(false)
    }
    await s.open(scope,{...node,formList:undefined})
    expect(await s.add('不可操作')).toBe(false)
    await s.open(scope,{...node,id:asOpaqueId<'WorkflowNodeRuntimeId'>('different')})
    expect(s.state).toBe('failed')
  })
  it('preserves all old data when storage read, write or stored receipt validation fails',async()=>{
    const {port,records}=memory()
    const s=useR1LocalFormDraftStore()
    s.configure(port)
    vi.mocked(port.read).mockRejectedValueOnce(new Error('storage offline'))
    await s.open(scope,node)
    expect(s.state).toBe('failed')
    expect(await s.add('not safe')).toBe(false)
    await s.open(scope,node)
    vi.mocked(port.write).mockRejectedValueOnce(new Error('disk failure'))
    expect(await s.add('no save')).toBe(false)
    expect(s.snapshot.intents).toEqual([])
    expect(records.size).toBe(0)
    expect(await s.add('valid')).toBe(true)
    const k=[...records.keys()][0]!
    records.set(k,{version:1,nextSequence:0,intents:[{localId:'invalid',kind:'new',title:'bad'}]})
    await s.open(scope,node)
    expect(s.state).toBe('failed')
    expect(await s.add('must not replace corrupt persisted data')).toBe(false)
    expect(records.get(k)).toMatchObject({nextSequence:0})
  })
  it('does not invent definition identity for forms or stage actions without valid list evidence',async()=>{
    const {port}=memory()
    const s=useR1LocalFormDraftStore()
    s.configure(port)
    await s.open({...scope,sourceNodeType:'forms',formDefinitionId:undefined},{
      ...node,sourceNodeType:'forms',category:'forms',formDefinitionId:undefined,
      formList:{source:'exts.formList',evidence:'available',truncated:false,entries:[]},
    })
    expect(await s.add('No R1 addFormCodeId')).toBe(false)
    expect(s.snapshot.intents).toEqual([])
  })
  it('does not apply an async read from a previously opened node to the next role context',async()=>{
    const {port}=memory()
    let release!:()=>void
    const block=new Promise<void>(resolve=>{release=resolve})
    vi.mocked(port.read).mockImplementationOnce(async()=>{await block;return {state:'succeeded',data:{
      version:1,nextSequence:2,intents:[{localId:'local-1',kind:'new',definitionId:'d',title:'old'}],
    }}})
    const s=useR1LocalFormDraftStore()
    s.configure(port)
    const pending=s.open(scope,node)
    await s.open({...scope,actorScope:'another-role'},node)
    release()
    await pending
    expect(s.state).toBe('ready')
    expect(s.snapshot.intents).toHaveLength(0)
  })
})
