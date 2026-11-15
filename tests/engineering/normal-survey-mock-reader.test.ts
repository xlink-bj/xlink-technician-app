import { describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader, normalNodeFormsReadEnabled } from '@app/r1-node-forms-read'
import { normalSurveyMockIds as ids, normalSurveyMockRead } from '@adapters/api/mock/normal-survey-read'
import type { SessionSnapshot } from '@shared/ports'
const origin='http://localhost:5174'
const env={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_H5_MOCK_E2E:'true',
 VITE_XLINK_R1_MP_UX_FIXTURES:'true',VITE_XLINK_MOCK:'true',VITE_XLINK_ENABLE_REAL_WRITES:'false',
 VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_API_BASE_URL:'https://example.invalid',VITE_XLINK_AUTH_TENANT:ids.tenant}
function harness(){
 let session={sessionRef:'synthetic-session',user:{id:'synthetic-user'},currentRole:{id:'synthetic-role'},capabilityNames:[]} as unknown as SessionSnapshot
 let listed=true
 let alter:((path:string,value:any)=>void)|undefined
 const calls:string[]=[]
 const execute=vi.fn(async(request:{path:string;body?:Readonly<Record<string,unknown>>})=>{
  calls.push(request.path)
  const value=normalSurveyMockRead(request.path,request.body??{})
  if(value===null)throw Error('Unexpected synthetic read '+request.path)
  const copy=structuredClone(value);alter?.(request.path,copy);return copy
 })
 const reader=createNormalNodeFormsReader({auth:{getCurrentSession:()=>session},tenantId:ids.tenant,env,origin,transport:{execute},
 read:{isWorkOrderListedForCurrentSession:(id:string)=>listed&&id===ids.work,
 listWorkOrders:vi.fn(async()=>({state:'succeeded' as const,data:{items:listed?[{id:ids.work}]:[],totalCount:listed?1:0,page:1,pageSize:20}}))} as any})
 return{reader,calls,execute,alter:(fn:typeof alter)=>{alter=fn},unlist:()=>{listed=false},role:()=>{session={...session,currentRole:{id:'foreign-role'} as never}},user:()=>{session={...session,user:{id:'foreign-user'} as never}}}
}
describe('normal Mock Survey uses the existing source reader and read-only joins',()=>{
 it('reads the exact source-shaped forms/Ext/field/provider/FormData chain without commands',async()=>{
  const h=harness(),snapshot=await h.reader.load(ids.work,ids.node)
  expect(snapshot.definition.purpose).toBe('survey');expect(snapshot.node.sourceNodeType).toBe('forms')
  expect(snapshot.records).toHaveLength(1);expect(snapshot.records[0]?.values).toMatchObject({part:['survey-option-6b86b273ff34','survey-option-38d66d9692ac'],width:0,leakageCause:['mock-leakage-cause-roof-1']})
  expect(snapshot.fillableFieldIds).toEqual([]);expect(h.reader.isCurrent(snapshot)).toBe(true)
  expect(h.calls).toContain('biz/ext/queryById.do');expect(h.calls).toContain('i/code/selectMultistageCode.do')
  expect(h.calls.filter(path=>/upsert|process|updateExts|upload/.test(path))).toEqual([])
 })
 it.each(['role','user','unlist'] as const)('revokes %s without reviving the old snapshot',async key=>{
  const h=harness(),snapshot=await h.reader.load(ids.work,ids.node);h[key]()
  expect(h.reader.isCurrent(snapshot)).toBe(false);await expect(h.reader.load(ids.work,ids.node)).rejects.toThrow()
 })
 it.each(['tenant','definition','record-owner'] as const)('rejects source %s mismatch',async key=>{
  const h=harness();h.alter((path,value)=>{
   if(key==='tenant'&&path==='biz/ext/queryById.do')value.tenantId='foreign'
   if(key==='definition'&&path==='biz/extField/query')value.data[0].extId='foreign'
   if(key==='record-owner'&&path.startsWith('biz/extForm/query/'))value.data[0].sid='foreign'
  });await expect(h.reader.load(ids.work,ids.node)).rejects.toThrow()
 })
 it('rejects a foreign node before querying its form definition',async()=>{
  const h=harness();await expect(h.reader.load(ids.work,'foreign-node')).rejects.toThrow()
  expect(h.calls).not.toContain('biz/ext/queryById.do')
 })
 it('does not accept metadata discovery or turn a read fixture into a command',()=>{
  expect(normalSurveyMockRead('biz/ext/queryById.do',{id:ids.definition,_all:'1'})).toBeNull()
  expect(normalSurveyMockRead('biz/extField/query',{extId:ids.definition,_all:'1'})).toBeNull()
  expect(normalSurveyMockRead('biz/extForm/upsert/'+ids.definition,{sid:ids.work})).toBeNull()
 })
 it('keeps the offline profile closed outside its exact environment',()=>{
  expect(normalNodeFormsReadEnabled(env,origin)).toBe(true)
  for(const override of [{DEV:false},{VITE_XLINK_ENVIRONMENT:'prod'},{VITE_XLINK_MOCK:'false'},
   {VITE_XLINK_ENABLE_REAL_WRITES:'true'},{VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true'},
   {VITE_XLINK_R1_MP_UX_FIXTURES:'false'},{VITE_XLINK_AUTH_TENANT:'foreign'},
   {VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS:'true'},{VITE_XLINK_AUTH_API_BASE_URL:'https://production.invalid'},
   {VITE_XLINK_API_BASE_URL:'https://production.invalid'}])expect(normalNodeFormsReadEnabled({...env,...override},origin)).toBe(false)
  expect(normalNodeFormsReadEnabled(env,'http://127.0.0.1:5189')).toBe(false)
 })
})
