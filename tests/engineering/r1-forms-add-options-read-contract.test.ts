import { describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'
import { createPinia, setActivePinia } from 'pinia'
import { useR1LocalFormDraftStore } from '@features/work-orders/r1-local-form-drafts'
import type { StoragePort, TechnicianApiReadPort } from '@shared/ports'

describe('R1 source forms add options and read-only provenance',()=>{
  it('uses addFormCodeId parentId, filters active codes and retains only EXTS definition IDs',async()=>{
    const execute=vi.fn(async()=>({data:[
      {name:'平屋顶漏水勘察',exts:{formDefId:'mock-roof-inspection',privateTag:'not exposed'}},
    ],total:1,page:1,rows:50}))
    const adapter=createTechnicianApiReadAdapter({execute})
    const result=await adapter.listR1FormsAddOptions!('mock-forms-parent')
    expect(result).toMatchObject({state:'succeeded',data:{items:[{
      label:'平屋顶漏水勘察',formDefinitionId:'mock-roof-inspection',
    }]}})
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      path:'code/query',body:expect.objectContaining({parentId:'mock-forms-parent',
        'is:state|integer#and':1}),
    }))
    expect(JSON.stringify(result.data)).not.toContain('privateTag')
  })
  it('fails closed when add choice lacks ext.formDefId',async()=>{
    const adapter=createTechnicianApiReadAdapter({execute:async()=>({data:[{name:'no identity',exts:{}}]})})
    expect((await adapter.listR1FormsAddOptions!('parent')).state).toBe('failed_terminal')
    expect((await adapter.listR1FormsAddOptions!('')).state).toBe('failed_terminal')
  })
  it('does not authorize real tenant choice reads by injecting a custom read port',async()=>{
    setActivePinia(createPinia())
    const listR1FormsAddOptions=vi.fn(async()=>({state:'succeeded' as const,
      data:{items:[{label:'bad',formDefinitionId:asOpaqueId<'FormDefinitionId'>('real-definition')}]}}))
    const storage={read:vi.fn(async()=>({state:'succeeded',data:null})),
      write:vi.fn(async()=>({state:'succeeded'}))} as unknown as StoragePort
    const draft=useR1LocalFormDraftStore()
    draft.configure(storage,{listR1FormsAddOptions} as unknown as TechnicianApiReadPort)
    await draft.open({actorScope:'actor:role',workOrderId:'real-customer-1',runtimeNodeId:'runtime-a',
      sourceNodeType:'forms'}, {id:asOpaqueId<'WorkflowNodeRuntimeId'>('runtime-a'),
      category:'forms',sourceNodeType:'forms',lifecycle:'active',addFormCodeId:'source-parent',
      formList:{source:'exts.formList',evidence:'available',entries:[],truncated:false}})
    expect(await draft.loadAddOptions()).toBe(false)
    expect(listR1FormsAddOptions).not.toHaveBeenCalled()
  })
})
