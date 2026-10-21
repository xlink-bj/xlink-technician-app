import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { allowsR1LocalDefinitionPreview, normalizeR1LocalFieldPatch, projectR1LocalFields } from '@features/work-orders/r1-local-form-fields'
import { useR1LocalFormDraftStore } from '@features/work-orders/r1-local-form-drafts'
import { asOpaqueId } from '@shared/types'
import type { FormDefinitionRead, StorageKey, StoragePort, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'

const def:FormDefinitionRead={
  id:asOpaqueId<'FormDefinitionId'>('mock-formdef-repeat'),
  fields:[
    {fieldId:'title-1',valueKey:'inspectionText',label:'现场情况',type:'textarea',required:true,readOnly:false},
    {fieldId:'number-1',valueKey:'area',label:'面积',type:'digit',required:false,readOnly:false},
    {fieldId:'choice-1',valueKey:'result',label:'结论',type:'radio',required:true,readOnly:false,
      options:[{value:'fix',label:'维修'},{value:'watch',label:'观察'}]},
    {fieldId:'checkbox-1',valueKey:'tags',label:'部位',type:'checkbox',required:false,readOnly:false,
      multiple:true,options:[{value:'roof',label:'屋面'},{value:'wall',label:'墙面'}]},
    {fieldId:'switch-1',valueKey:'safe',label:'是否安全',type:'switch',required:false,readOnly:false},
    {fieldId:'readonly-1',valueKey:'serverPrice',label:'服务端价格',type:'number',required:false,readOnly:true},
    {fieldId:'upload-1',valueKey:'sitePhotos',label:'现场媒体',type:'image',required:false,readOnly:false},
  ],
}
const node:WorkflowNodeRead={
  id:asOpaqueId<'WorkflowNodeRuntimeId'>('mock-node-repeat'),
  category:'repeat',sourceNodeType:'repeat',lifecycle:'active',
  formDefinitionId:def.id,
  formList:{source:'formDataList',evidence:'available',truncated:false,entries:[]},
}
const scope={
  actorScope:'account-X:role-A',workOrderId:'mock-work-order-synthetic',
  runtimeNodeId:'mock-node-repeat',sourceNodeType:'repeat' as const,
  formDefinitionId:'mock-formdef-repeat',
}
function storageHarness(){
  const map=new Map<string,unknown>()
  const storage={
    read:vi.fn(async(key:StorageKey)=>({state:'succeeded' as const,data:map.get(key.key)??null})),
    write:vi.fn(async(key:StorageKey,value:unknown)=>{
      map.set(key.key,JSON.parse(JSON.stringify(value)))
      return {state:'succeeded' as const}
    }),
    remove:vi.fn(async(key:StorageKey)=>{map.delete(key.key);return {state:'succeeded' as const}}),
    listKeys:vi.fn(async()=>({state:'succeeded' as const,data:[...map.keys()]})),
  } as unknown as StoragePort
  return {storage,map}
}
describe('F4 guarded field editor – source-backed local repeat field values',()=>{
  beforeEach(()=>setActivePinia(createPinia()))
  it('maps supported dynamic fields and exposes unsupported or read-only ones',()=>{
    const fields=projectR1LocalFields(def)
    expect(fields.filter(x=>x.supported).map(x=>x.valueKey))
      .toEqual(['inspectionText','area','result','tags','safe'])
    expect(fields.find(x=>x.valueKey==='serverPrice')?.supported).toBe(false)
    expect(fields.find(x=>x.valueKey==='sitePhotos')?.supported).toBe(false)
  })
  it('normalizes the exact defined values; blocks wrong enum, unknown row, media and price',()=>{
    let values={}
    for(const [field,value] of [
      ['inspectionText','漏水勘察记录'],['area','12.5'],['result','fix'],
      ['tags',['roof','wall']],['safe',false],
    ] as const){
      const next=normalizeR1LocalFieldPatch(def,values,field,value)
      expect(next).not.toBeNull()
      values=next!
    }
    expect(values).toEqual({inspectionText:'漏水勘察记录',area:12.5,result:'fix',
      tags:['roof','wall'],safe:false})
    expect(normalizeR1LocalFieldPatch(def,values,'result','made-up')).toBeNull()
    expect(normalizeR1LocalFieldPatch(def,values,'serverPrice','10')).toBeNull()
    expect(normalizeR1LocalFieldPatch(def,values,'sitePhotos','fake-file')).toBeNull()
    expect(normalizeR1LocalFieldPatch(def,values,'absent','data')).toBeNull()
    expect(normalizeR1LocalFieldPatch(def,values,'inspectionText','x'.repeat(4100))).toBeNull()
    const removed=normalizeR1LocalFieldPatch(def,values,'area','')
    expect(removed).not.toHaveProperty('area')
  })
  it('keeps duplicate business valueKey fail-closed rather than editing either row',()=>{
    const collision:FormDefinitionRead={...def,fields:[
      def.fields![0]!,{...def.fields![0]!,fieldId:'same-name-second'},
    ]}
    expect(normalizeR1LocalFieldPatch(collision,{},'inspectionText','bad')).toBeNull()
  })
  it('persists local values and restores only under the same actor, node and definition',async()=>{
    const {storage,map}=storageHarness()
    const store=useR1LocalFormDraftStore()
    store.configure(storage)
    await store.open(scope,node)
    expect(await store.add('重复勘察草稿')).toBe(true)
    expect(await store.setDraftField('local-1',def,'inspectionText','雨后漏水')).toBe(true)
    expect(await store.setDraftField('local-1',def,'area','16.5')).toBe(true)
    expect(await store.setDraftField('local-1',def,'serverPrice','999')).toBe(false)
    expect(store.snapshot.intents[0]?.values).toEqual({inspectionText:'雨后漏水',area:16.5})
    expect(JSON.stringify([...map.values()])).not.toContain('999')
    setActivePinia(createPinia())
    const restored=useR1LocalFormDraftStore()
    restored.configure(storage)
    await restored.open(scope,node)
    expect(restored.snapshot.intents[0]?.values).toEqual({inspectionText:'雨后漏水',area:16.5})
    expect(await restored.setDraftField('local-1',{...def,id:asOpaqueId<'FormDefinitionId'>('wrong')},'area','2'))
      .toBe(false)
    await restored.open({...scope,actorScope:'different-role'},node)
    expect(restored.snapshot.intents).toHaveLength(0)
  })
  it('never permits FormDefinition read for real WorkOrders or real definition IDs',()=>{
    expect(allowsR1LocalDefinitionPreview({
      dev:true,mockDataMode:true,workOrderId:'mock-work-order-synthetic',
      definitionId:'mock-formdef-repeat',
    })).toBe(true)
    for(const args of [
      {dev:false,mockDataMode:true,workOrderId:'mock-work-order-synthetic',definitionId:'mock-formdef-repeat'},
      {dev:true,mockDataMode:false,workOrderId:'mock-work-order-synthetic',definitionId:'mock-formdef-repeat'},
      {dev:true,mockDataMode:true,workOrderId:'real-business-id',definitionId:'mock-formdef-repeat'},
      {dev:true,mockDataMode:true,workOrderId:'mock-work-order-synthetic',definitionId:'real-formdef-id'},
    ])expect(allowsR1LocalDefinitionPreview(args)).toBe(false)
  })
  it('blocks live definition reads from an ordinary runtime even with an injected adapter',async()=>{
    const {storage}=storageHarness()
    const reader={getFormDefinition:vi.fn(async()=>({state:'succeeded' as const,data:def}))}
      as unknown as TechnicianApiReadPort
    const store=useR1LocalFormDraftStore()
    store.configure(storage,reader)
    await store.open(scope,node)
    expect(await store.add('草稿')).toBe(true)
    // In CI tests the production-equivalent runtime is not a DEV data-mode
    // synthetic fixture; an injected reader must not create live authority.
    expect(await store.loadDraftDefinition('local-1')).toBeNull()
    expect(reader.getFormDefinition).not.toHaveBeenCalled()
  })
})
