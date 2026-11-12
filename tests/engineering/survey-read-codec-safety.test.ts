import historyFixture from '../../contracts/beta/survey/historical.json'
import {it,expect,vi,afterEach}from'vitest'
import {formData}from'@adapters/api/read-models/form'
import {surveyMediaValueCodec,createSurveyReadValueCodec}from'@adapters/api/survey-form-codec'
import {createTechnicianApiReadAdapter}from'@adapters/api/technician-api'
import {createTechnicianApiCommandAdapter}from'@adapters/api/technician-api-commands'
import {formDataUpsertCommand}from'@adapters/api/action-command-wires'
import {beginActionMutation,recordActionFormSaved}from'@features/work-orders/action-mutation-receipt'
import {recoverActionFormFromReceipt}from'@features/work-orders/action-workspace-form-recovery'
import {succeeded}from'@adapters/common/operations'
const image={url:'https://synthetic.invalid/p.png',name:'p.png',extname:'png'}
afterEach(()=>vi.restoreAllMocks())
function definition(fields:any[]=[{fieldId:'memo-field',valueKey:'memo',type:'text'}]):any{return{id:'def',purpose:'survey',fields:fields.map(f=>({required:false,readOnly:false,preset:false,...f}))}}
const codec=(fields?:any[])=>createSurveyReadValueCodec(definition(fields))
const raw=(values:any)=>({_id:'record',formDefId:'def',workflowId:'run',...values})
function adapter(row:any,def=definition([{fieldId:'photo',valueKey:'customPhoto',type:'file'}])){
 const command=vi.fn(()=>{throw Error('NO_BUSINESS_COMMAND')})
 const transport={execute:vi.fn(async(r:any)=>{expect(r.method).toBe('POST');expect(r.path).toBe('biz/extForm/query/def');return{data:[structuredClone(row)],total:1,page:1,rows:20}})}
 const realRead=createTechnicianApiReadAdapter(transport)
 const getFormData=vi.fn(realRead.getFormData.bind(realRead))
 const a=createTechnicianApiCommandAdapter({execute:command},{getFormDefinition:async()=>succeeded(def),getFormData}as never)
 return{a,command,getFormData,transport}
}
it('metadata-aware declared object array is explicitly unsupported, never silently dropped',()=>{
 expect(()=>formData(raw({exts:{customPhoto:[image]}}),codec([{fieldId:'photo',valueKey:'customPhoto',type:'file'}]),'def'as never)).toThrow('不支持该字段')
})
it('raw conflicting declared root/EXTS is refused before projection; this is App safety rather than old R1 precedence',()=>{
 expect(()=>formData(raw({memo:'root',exts:{memo:'extension'}}),codec(),'def'as never)).toThrow('存储副本不一致')
 expect(formData(raw({memo:'root',exts:{memo:'extension'}})).values?.memo).toBe('extension') // Generic legacy precedence is unchanged.
})
it('identical raw copies retain normal legacy media, including object key order differences',()=>{
 const c=codec([{fieldId:'photo',valueKey:'images1',type:'file'}])
 expect(formData(raw({images1:[{name:'p.png',extname:'png',url:image.url}],exts:{images1:[image]}}),c,'def'as never).values?.images1).toEqual([{url:image.url,objectKey:'p.png',extension:'png'}])
})
it('unsupported EXTS cannot fall back to an old root primitive',()=>{
 expect(()=>formData(raw({memo:'old root',exts:{memo:[{nested:true}]}}),codec(),'def'as never)).toThrow()
})
it('unknown backend objects and arrays do not trigger declared-field refusal',()=>{
 const value=formData(raw({audit:{old:1},history:[{label:'server'}],exts:{memo:'kept',unknownAudit:[{label:'server'}]}}),codec(),'def'as never)
 expect(value.values?.memo).toBe('kept');expect(value.values?.audit).toBeUndefined();expect(value.values?.history).toBeUndefined();expect(value.values?.unknownAudit).toBeUndefined()
})
it.each(['',0,false,null,[],['one','two']])('declared scalar/empty/null/primitive arrays keep original value %#',value=>{
 expect(formData(raw({exts:{memo:value}}),codec(),'def'as never).values?.memo).toEqual(value)
})
it.each([null,[]])('arbitrary file empty/null remains explicit %#',value=>{
 expect(formData(raw({exts:{customPhoto:value}}),codec([{fieldId:'photo',valueKey:'customPhoto',type:'file'}]),'def'as never).values?.customPhoto).toEqual(value)
})
it('legacy known bad media still refuses; no arbitrary shape-based file support is introduced',()=>{
 const c=codec([{fieldId:'photo',valueKey:'images1',type:'file'}])
 expect(()=>formData(raw({exts:{images1:[{name:'missing url'}]}}),c,'def'as never)).toThrow('missing a usable url')
 expect(()=>formData(raw({exts:{customPhoto:['some-path']}}),codec([{fieldId:'photo',valueKey:'customPhoto',type:'file'}]),'def'as never)).toThrow('不支持该字段')
})
it('unbound historical value codec is not a complete-record read contract; value-level compatibility remains',()=>{
 expect(()=>formData(raw({exts:{memo:'text'}}),surveyMediaValueCodec)).toThrow('字段配置尚未完整核实')
 expect(surveyMediaValueCodec.decode([image],{valueKey:'images1'})).toEqual([{url:image.url,objectKey:'p.png',extension:'png'}])
})
it('missing/unclassified/ambiguous metadata and mismatched definition fail explicitly',()=>{
 for(const d of [{id:'def',purpose:'survey'},{...definition(),purpose:undefined},definition([{fieldId:'same',valueKey:'a',type:'text'},{fieldId:'same',valueKey:'b',type:'text'}]),definition([{fieldId:'a',valueKey:'same',type:'text'},{fieldId:'b',valueKey:'same',type:'file'}])])expect(()=>createSurveyReadValueCodec(d as never)).toThrow()
 expect(()=>formData(raw({}),codec(),'foreign'as never)).toThrow('字段配置尚未完整核实')
})
it('declaration is captured, not a mutable later field list or a public marker granting authority',()=>{
 const d=definition(),c=createSurveyReadValueCodec(d);d.fields.push({fieldId:'injected',valueKey:'customPhoto',type:'file'})
 expect(formData(raw({exts:{memo:'safe',customPhoto:[image]}}),c,'def'as never).values?.memo).toBe('safe')
 expect(()=>c.encode('text',{valueKey:'memo'})).toThrow('读取上下文不能用于保存')
})
it('actual read adapter + command consumer returns explicit failure for unsupported configured value',async()=>{
 const x=adapter(raw({exts:{customPhoto:[image]}})),result=await x.a.readDynamicForm!({definitionId:'def',formDataId:'record',expectedWorkflowRunId:'run'}as never)
 expect(result.state).toBe('failed_terminal');expect(result.error?.message).toContain('不支持该字段');expect(x.command).not.toHaveBeenCalled();expect(x.transport.execute).toHaveBeenCalledOnce()
})
it('actual read consumer preserves valid known media and metadata, with exact record/run identity',async()=>{
 const d=definition([{fieldId:'photo',valueKey:'images1',type:'file'},{fieldId:'memo',valueKey:'memo',type:'text'}]),x=adapter(raw({history:[{audit:true}],exts:{images1:[image],memo:'kept'}}),d)
 const r=await x.a.readDynamicForm!({definitionId:'def',formDataId:'record',expectedWorkflowRunId:'run'}as never)
 expect(r.state).toBe('succeeded');expect(r.data?.values).toMatchObject({images1:[{url:image.url,objectKey:'p.png',extension:'png'}],memo:'kept'});expect(x.command).not.toHaveBeenCalled()
 const wrong=await x.a.readDynamicForm!({definitionId:'def',formDataId:'record',expectedWorkflowRunId:'different'}as never);expect(wrong.state).toBe('failed_terminal')
})
it('consumer refuses missing metadata before reading stored data, rather than inventing an empty declaration',async()=>{
 const x=adapter(raw({exts:{}}),{id:'def',purpose:'survey'}as never),r=await x.a.readDynamicForm!({definitionId:'def',formDataId:'record'}as never)
 expect(r.state).toBe('failed_terminal');expect(r.error?.category).toBe('unsupported_capability');expect(x.getFormData).not.toHaveBeenCalled();expect(x.command).not.toHaveBeenCalled()
})
async function recover(x:ReturnType<typeof adapter>){
 const rows=new Map<string,unknown>(),storage:any={read:async(k:any)=>succeeded(rows.get(k.key)??null),write:async(k:any,v:any)=>{rows.set(k.key,v);return succeeded(undefined)},remove:vi.fn(),listKeys:vi.fn()}
 const scope={userId:'user',workOrderId:'order',workflowNodeId:'node',formDefinitionId:'def',authorizationScope:'offline-role'}
 await beginActionMutation(storage,scope,'form_dispatched');await recordActionFormSaved(storage,scope,'record'as never)
 const result=await recoverActionFormFromReceipt({storage,descriptor:{userId:'user',workOrderId:'order',workflowNodeId:'node',contentIdentity:'def'}as never,initialForm:{definitionId:'def',fields:[],values:{}}as never,commandApi:x.a,appointment:false,formDefinitionId:'def'as never,workflowRunId:'run'as never,authorizationScope:scope.authorizationScope,stillCurrent:()=>true})
 return{result,rows}
}
it('receipt recovery blocks unsupported data, retaining original receipt and zero dispatch',async()=>{
 const x=adapter(raw({exts:{customPhoto:[image]}})),{result,rows}=await recover(x)
 expect(result.kind).toBe('blocked');expect(rows.size).toBe(1);expect([...rows.values()][0]).toMatchObject({phase:'form_saved',formDataId:'record'});expect(x.command).not.toHaveBeenCalled()
})
it('valid known-media receipt recovery remains ready, without a write or upload',async()=>{
 const x=adapter(raw({exts:{images1:[image]}}),definition([{fieldId:'photo',valueKey:'images1',type:'file'}])),{result}=await recover(x)
 expect(result.kind).toBe('ready');if(result.kind==='ready')expect(result.form.values.images1).toHaveLength(1);expect(x.command).not.toHaveBeenCalled()
})
it('unchanged encoder and command guards still reject arbitrary media, typed existing edit and forms/repeat legacy writes',async()=>{
 expect(()=>formDataUpsertCommand({workOrderId:'order',workflowNodeId:'node',definitionId:'def',purpose:'survey',values:{customPhoto:[{url:image.url,objectKey:image.name,extension:'png'}]}}as never)).toThrow('No verified Survey media field contract')
 expect(()=>formDataUpsertCommand({workOrderId:'order',workflowNodeId:'node',definitionId:'def',formDataId:'record',purpose:'survey',values:{images1:[]}}as never)).toThrow('Typed Survey replacement is unsupported')
 const x=adapter(raw({}));for(const sourceNodeType of ['forms','repeat']){const r=await x.a.saveDynamicForm!({sourceNodeType,workOrderId:'order',workflowNodeId:'node',definitionId:'def',purpose:'survey',values:{}}as never);expect(r.state).toBe('failed_terminal')};expect(x.command).not.toHaveBeenCalled()
})

it('historical length/width repeated instances with different required/conditions remain readable',()=>{
 const history=historyFixture
 const fields=history.fieldRows.filter((f:any)=>['survey-field-021','survey-field-022','survey-field-023','survey-field-024'].includes(f.fieldId))
 expect(fields).toHaveLength(4);expect(new Set(fields.map((f:any)=>f.valueKey)).size).toBe(2)
 const d={id:'def',purpose:'survey',fields},c=createSurveyReadValueCodec(d as never)
 expect(formData(raw({length:2.345,width:3,exts:{}}),c,'def'as never).values).toMatchObject({length:2.345,width:3})
})
it.each(['carrier','preset'])('same-key genuinely conflicting read representation is explicitly unsupported: %s',kind=>{
 const fields=[{fieldId:'a',valueKey:'memo',type:'text',preset:true},{fieldId:'b',valueKey:'memo',type:kind==='carrier'?'file':'text',preset:kind==='preset'?false:true}]
 expect(()=>createSurveyReadValueCodec(definition(fields))).toThrow('同名字段的读取存储配置不一致')
})
