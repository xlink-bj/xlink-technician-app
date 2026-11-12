import { createActionDraftRepository, type ActionDraftIdentity, type ActionDraftRecord } from '@runtimes/action'
import type { FormDefinitionRead, StoragePort } from '@shared/ports'
import type { R1SpecialMockFields } from '@features/work-orders/r1-special-mock-form-fields'
import { isR1FileWireArray } from '@shared/types'
import { withR1SpecialMockTransaction } from '@adapters/api/mock/r1-special-state'
type RecordData=ActionDraftRecord<Readonly<Record<string,unknown>>>
type Context={base:ActionDraftIdentity;identity:ActionDraftIdentity;key:string;generation:number;record:RecordData|null}
/** Local lifecycle adapter on the existing repository. No command/grant/ACK. */
export function createAStageDynamicFormDraftSession(input:{
 storage:StoragePort;identity:(formId:string,recordId?:string)=>ActionDraftIdentity;isCurrent:()=>boolean
 fields:(formId:string)=>Promise<NonNullable<FormDefinitionRead['fields']>>;hasReceipt:()=>Promise<boolean>
}){
 const drafts=createActionDraftRepository(input.storage),generations=new Map<string,number>()
 const check=()=>{if(!input.isCurrent())throw Error('草稿身份已失效')}
 const marked=(record:RecordData|null)=>{
  const source=record as (RecordData&{specialSubmissionPending?:unknown})|null
  if(source&&Object.hasOwn(source,'specialSubmissionPending')&&typeof source.specialSubmissionPending!=='boolean')throw Error('本机提交标记无法核验')
  return source?.specialSubmissionPending===true
 }
 async function owned<T>(formId:string,recordId:string|undefined,work:(context:Context)=>Promise<T>):Promise<T>{
  const base=input.identity(formId,recordId),key=JSON.stringify(base),claimed=generations.get(key)
  return withR1SpecialMockTransaction('draft:'+key,async()=>{
   check();const root=await drafts.read(base);check()
   if(root.state!=='succeeded'||root.data===undefined)throw Error('本机草稿读取失败')
   const rootMarked=marked(root.data)
   const metadata=root.data as (RecordData&{specialDraftGeneration?:unknown})|null
   const hasGeneration=metadata!==null&&Object.hasOwn(metadata,'specialDraftGeneration')
   const generation=hasGeneration?metadata!.specialDraftGeneration:0
   if(typeof generation!=='number'||!Number.isSafeInteger(generation)||generation<(hasGeneration?1:0)
     ||generation>0&&(rootMarked||metadata?.status!=='completed'||Object.keys(metadata.values).length!==0))throw Error('本机草稿代际无法核验')
   if(claimed!==undefined&&claimed!==generation)throw Error('旧草稿页面代际已失效')
   if(claimed===undefined)generations.set(key,generation)
   const identity=generation===0?base:{...base,contentIdentity:JSON.stringify([formId,recordId??null,generation])}
   const current=generation===0?root:await drafts.read(identity);check()
   if(current.state!=='succeeded'||current.data===undefined)throw Error('当前草稿读取失败')
   marked(current.data)
   if(generation>0&&current.data&&Object.hasOwn(current.data,'specialDraftGeneration'))throw Error('草稿代际标记位置无效')
   return work({base,identity,key,generation,record:current.data})
  })
 }
 const record=(identity:ActionDraftIdentity,values:Readonly<Record<string,unknown>>,status:'unfinished'|'completed')=>({version:1 as const,identity,values,status,updatedAt:new Date().toISOString()})
 async function valuesFor(formId:string,current:RecordData):Promise<R1SpecialMockFields>{
  const fields=await input.fields(formId);check();const values=current.values
  if(Object.keys(values).length>50||Object.entries(values).some(([key,value])=>
   !fields.some(field=>field.valueKey===key&&!field.readOnly&&!field.presentationOnly)
   ||!(typeof value==='string'&&value.length<=4000||typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'
     ||Array.isArray(value)&&(value.length<=30&&value.every(item=>typeof item==='string'&&item.length<=256)||isR1FileWireArray(value)))))throw Error('草稿内容无法安全恢复')
  return values as R1SpecialMockFields
 }
 return{
  readDraft:(formId:string,recordId?:string)=>owned(formId,recordId,async ctx=>{
   if(!ctx.record||ctx.record.status!=='unfinished')return null
   if(marked(ctx.record)&&!await input.hasReceipt())throw Error('已封存输入不能恢复为新增草稿')
   return valuesFor(formId,ctx.record)
  }),
  readSealedDraft:(formId:string,recordId?:string)=>owned(formId,recordId,async ctx=>{
   return ctx.record&&(marked(ctx.record)||ctx.record.status==='completed'&&ctx.generation>0)?valuesFor(formId,ctx.record):null
  }),
  isDraftSubmissionPending:(formId:string,recordId?:string)=>owned(formId,recordId,async ctx=>{
   if(!marked(ctx.record)&&!(ctx.record?.status==='completed'&&ctx.generation>0))return false
   const pending=await input.hasReceipt();check();return !pending
  }),
  async sealDraftForSubmission(formId:string,values:R1SpecialMockFields,recordId?:string){
   try{const captured=JSON.parse(JSON.stringify(values)) as R1SpecialMockFields
   return await owned(formId,recordId,async ctx=>{
    if(marked(ctx.record)||ctx.record?.status==='completed')return false
    const sealed={...record(ctx.identity,captured,'unfinished'),specialSubmissionPending:true}
    const result=await drafts.write(sealed);check()
    return result.state==='succeeded'
   })}catch{return false}
  },
  async writeDraft(formId:string,values:R1SpecialMockFields,recordId?:string){
   try{const captured=JSON.parse(JSON.stringify(values)) as R1SpecialMockFields
   return await owned(formId,recordId,async ctx=>{
    if(marked(ctx.record)||ctx.record?.status==='completed')return false
    const result=await drafts.write(record(ctx.identity,captured,'unfinished'));check();return result.state==='succeeded'
   })}catch{return false}
  },
  async removeDraft(formId:string,recordId?:string){
   try{return await owned(formId,recordId,async ctx=>{
    const next=ctx.generation+1;if(!Number.isSafeInteger(next))return false
    // Keep a completed clock instead of deleting the key and reopening an ABA hole.
    if(ctx.generation>0){
     const tombstone=await drafts.write(record(ctx.identity,ctx.record?.values??{},'completed'));check()
     if(tombstone.state!=='succeeded')return false
    }
    const nextClock={...record(ctx.base,{},'completed'),specialDraftGeneration:next}
    const clock=await drafts.write(nextClock);check()
    if(clock.state!=='succeeded')return false
    generations.set(ctx.key,next);return true
   })}catch{return false}
  },
 }
}
