import { describe,expect,it } from 'vitest'
import { parseR1RepeatGrant,createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'
import { normalNodeFormsReadEnabled } from '@app/r1-node-forms-read'
import { normalizeR1RepeatValues,projectR1RepeatFields } from '@features/work-orders/r1-repeat-form'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
const fields=[
 {fieldId:'f1',valueKey:'need',type:'radio',label:'上门',required:true,readOnly:false,valueOption:'code1',options:[{value:'1',label:'需要上门'},{value:'2',label:'不需要上门'}]},
 {fieldId:'f2',valueKey:'reasons1',type:'select',label:'原因',required:true,readOnly:false,valueOption:'code2',options:[{value:'other',label:'其他'}],visibility:{kind:'equals',path:'need',value:'2'}},
 {fieldId:'f3',valueKey:'otherReason',type:'text',label:'其他',required:true,readOnly:false,visibility:{kind:'equals',path:'reasons1',value:'other'}},
 {fieldId:'f4',valueKey:'datetime',type:'datetime',label:'时间',required:true,readOnly:false,visibility:{kind:'equals',path:'need',value:'1'}},
 {fieldId:'f5',valueKey:'note',type:'text',label:'备注',required:false,readOnly:false},
 {fieldId:'f6',valueKey:'modifyReason',type:'text',label:'修改原因',required:true,readOnly:false,visibility:{kind:'exists',path:'_id',expected:true}},
]
const snapshot={workOrderId:'s',node:{id:'n',runId:'w',formDefinitionId:'e',sourceNodeType:'repeat',formFieldIdsReadOnly:[]},definition:{id:'e',fields},fillableFieldIds:fields.map(f=>f.fieldId),records:[]} as unknown as R1NodeFormsSnapshot
const grant={version:1,scope,expiresAt:'2040-01-01T00:00:00Z',fieldIds:fields.map(f=>f.fieldId),operations:['create','complete']}
const origin='http://127.0.0.1:5189',env={DEV:true,VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_REPEAT_ACTIONS:'true',VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:origin+'/xlink/wm',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify(grant)}
describe('explicit deployment grant and actual six-field normal form',()=>{
 it('keeps default/read-only capabilities separate from narrowly granted local writes',()=>{
  expect(normalNodeFormsReadEnabled(env,origin)).toBe(true)
  expect(normalNodeFormsReadEnabled({...env,VITE_XLINK_R1_REPEAT_GRANT:''},origin)).toBe(false)
  expect(normalNodeFormsReadEnabled({...env,VITE_XLINK_R1_REPEAT_ACTIONS:undefined},origin)).toBe(false)
  expect(normalNodeFormsReadEnabled({...env,VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_R1_REPEAT_GRANT:''},origin)).toBe(true)
 })
 it.each(['scope','expired','fields','extra','ops','identity'])('rejects malformed %s grants',kind=>{
  const g=structuredClone(grant) as any
  if(kind==='scope')delete g.scope.workflowRunId
  if(kind==='expired')g.expiresAt='2000-01-01T00:00:00Z'
  if(kind==='fields')g.fieldIds.push(g.fieldIds[0])
  if(kind==='extra')g.any=true
  if(kind==='ops')g.operations.push('edit')
  if(kind==='identity')g.scope.userId=' u'
  expect(parseR1RepeatGrant(JSON.stringify(g))).toBeNull()
 })
 it('binds the exact verified snapshot, schema and actor; no other node becomes writable',()=>{
  let current=true
  const auth={getCurrentSession:()=>({sessionRef:'secret',user:{id:'u'},currentRole:{id:'r'},capabilityNames:[]} as never)}
  const reader={enabled:()=>true,load:async()=>snapshot,isCurrent:()=>current,clear:()=>{}}
  const p=createNormalRepeatActionProvider({auth,reader,env,origin})
  expect(p.forSnapshot(snapshot)).not.toBeNull()
  expect(p.forSnapshot({...snapshot,node:{...snapshot.node,id:'elsewhere' as never}})).toBeNull()
  expect(p.forSnapshot({...snapshot,definition:{...snapshot.definition,fields:fields.slice(0,5) as never}})).toBeNull()
  expect(p.forSnapshot({...snapshot,fillableFieldIds:undefined})).toBeNull()
  expect(p.forSnapshot({...snapshot,fillableFieldIds:['f1']})).toBeNull()
  current=false;expect(p.forSnapshot(snapshot)).toBeNull()
 })
 it('shows and saves the same three need1 fields, without fabricated record _id',()=>{
  const values={need:'1',datetime:'2026-11-09 10:30',note:'Synthetic local visit'}
  expect(projectR1RepeatFields(snapshot,values).filter(f=>f.visible).map(f=>f.valueKey)).toEqual(['need','datetime','note'])
  expect(normalizeR1RepeatValues(snapshot,values)).toEqual(values)
  expect(()=>normalizeR1RepeatValues(snapshot,{...values,_id:'invented'})).toThrow()
 })
 it('uses actual need2 and reasons1=other conditions without guessing an extra AND',()=>{
  const values={need:'2',reasons1:'other',otherReason:'Synthetic reason',note:''}
  expect(projectR1RepeatFields(snapshot,values).filter(f=>f.visible).map(f=>f.valueKey)).toEqual(['need','reasons1','otherReason','note'])
  expect(normalizeR1RepeatValues(snapshot,values)).toMatchObject({need:'2',reasons1:'other',otherReason:'Synthetic reason'})
  expect(projectR1RepeatFields(snapshot,{need:'1',reasons1:'other'}).find(f=>f.valueKey==='otherReason')?.visible).toBe(true)
  expect(()=>normalizeR1RepeatValues(snapshot,{...values,datetime:'2026-11-09 10:30'})).toThrow()
 })
})
