import { describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'

const ordinary = {
  definitionId: asOpaqueId<'FormDefinitionId'>('source-forms-definition'),
  dataId: asOpaqueId<'FormDataId'>('saved-form-data-1'),
}

describe('R1 Stage1 existing FormData detail — source-specific read contract', () => {
  it('uses exact-ID bounded extForm/query for ordinary forms/repeat, no read bypass', async () => {
    const execute = vi.fn(async () => ({data:[{
      _id:'saved-form-data-1',formDefId:'source-forms-definition',
      exts:{inspectionNote:'roof'},state:1,
    }],total:1,page:1,rows:2}))
    const adapter=createTechnicianApiReadAdapter({execute})
    const result=await adapter.getFormDetail(ordinary)
    expect(result).toMatchObject({state:'succeeded',data:{
      id:'saved-form-data-1',definitionId:'source-forms-definition',
      values:{inspectionNote:'roof'},
    }})
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({
      method:'POST',path:'biz/extForm/query/source-forms-definition',
      body:{sortField:'createTime',sortOrder:'desc',
        'is:_id|string#and':'saved-form-data-1',page:1,rows:2},
    })
    expect(JSON.stringify(vi.mocked(execute).mock.calls[0])).not.toContain('notFilterBelongTo')
  })
  it('rejects wrong identity, missing results and duplicate rows', async () => {
    for(const rows of [[],[
      {_id:'other',formDefId:'source-forms-definition'},
    ],[
      {_id:'saved-form-data-1',formDefId:'source-forms-definition'},
      {_id:'saved-form-data-1',formDefId:'source-forms-definition'},
    ]]){
      const adapter=createTechnicianApiReadAdapter({execute:async()=>({data:rows})})
      expect((await adapter.getFormDetail(ordinary)).state).toBe('failed_terminal')
    }
  })
  it('retains the R1 construction-acceptance exception without widening other reads', async () => {
    const execute=vi.fn(async()=>({data:{
      _id:'special-saved',formDefId:'3285058246984486156',
    }}))
    const adapter=createTechnicianApiReadAdapter({execute})
    expect((await adapter.getFormDetail({
      definitionId:asOpaqueId<'FormDefinitionId'>('3285058246984486156'),
      dataId:asOpaqueId<'FormDataId'>('special-saved'),
    })).state).toBe('succeeded')
    expect(execute).toHaveBeenCalledWith({method:'GET',
      path:'biz/extForm/findByIdWithWorkflow',
      query:{extId:'3285058246984486156',id:'special-saved'}})
  })
})
