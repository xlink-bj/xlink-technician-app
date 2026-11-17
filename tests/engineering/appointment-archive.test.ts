import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest'
import {appointmentFixture} from '../support/normal-appointment-experience-fixture'
import {createHistoricalFormsReader} from '@app/r1-historical-forms-read'
import {appointmentArchiveNodes,appointmentArchiveRoute} from '@features/work-orders/appointment-archive'
import {appointmentDateForSelection,appointmentDateTimeForSelection,appointmentDisplayFor} from '@features/work-orders/appointment-time'
import {appointmentFormDefinitionWireId as appointmentArchiveDefinitionId} from '@adapters/api/appointment-contract'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
beforeEach(installLocalFixtureBrowser);afterEach(()=>vi.unstubAllGlobals())
const offlineEnv={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_H5_MOCK_E2E:'true',VITE_XLINK_R1_MP_UX_FIXTURES:'true',VITE_XLINK_MOCK:'true',VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS:'false',VITE_XLINK_AUTH_API_BASE_URL:'',VITE_XLINK_API_BASE_URL:'https://example.invalid',VITE_XLINK_AUTH_TENANT:'synthetic-qa-tenant'}
function historicalFixture(){
 const f=appointmentFixture();f.node.state=10
 let session:any={sessionRef:'synthetic-appointment-session',user:{id:'u'},currentRole:{id:'r'}}
 let listed=true
 const historyEnv={...offlineEnv};const execute=f.transport.execute.getMockImplementation()!
 f.transport.execute.mockImplementation(async request=>JSON.parse(JSON.stringify(await execute(request)).replaceAll('"t"','"synthetic-qa-tenant"')))
 const reader=createHistoricalFormsReader({auth:{getCurrentSession:()=>session},read:{isWorkOrderListedForCurrentSession:()=>listed,listWorkOrders:async()=>({state:'succeeded',data:{items:[],totalCount:0}} as never)},tenantId:'synthetic-qa-tenant',env:historyEnv,origin:'http://localhost:5174',transport:f.transport,appointmentArchive:true,appointmentNodeId:'n'})
 return{...f,historyEnv,history:reader,changeHistoryRole:()=>{session={...session,currentRole:{id:'other'}}},unlistHistory:()=>{listed=false}}
}
describe('appointment archive read authority stays separate from editing',()=>{
 it('discovers every completed repeat record and reads the selected ID with exact scope, without exposing mutation originals',async()=>{
  const f=historicalFixture(),targets=await f.history.discover('s');expect(targets.map(t=>t.recordId)).toEqual(['a','b'])
  const result=await f.history.read(targets[1]!);expect(result.record.values?.note).toBe('other');expect(f.history.isCurrent(result)).toBe(true)
  expect(Object.keys(result).sort()).toEqual(['definition','kind','record','target']);expect(Object.keys(f.history).sort()).toEqual(['clear','discover','enabled','isCurrent','read'])
  const calls=f.transport.execute.mock.calls.map(([request])=>request)
  for(const request of calls.filter(r=>r.path.includes('extForm/query'))){expect(request.body).toMatchObject({'is:sid|string#and':'s','is:nodeId|string#and':'n','is:workflowId|string#and':'w'});expect(request.body).not.toHaveProperty('notFilterBelongTo');expect(request.body).not.toHaveProperty('notFilterOrgId')}
  expect(calls.some(r=>/upsert|process|takeback|upload|delete/i.test(r.path))).toBe(false);expect(f.writes).toHaveLength(0)
 })
 it('reads a completed forms node direct formDataId without fabricating formList',async()=>{
  const f=historicalFixture();f.node.nodeDef.nodeType='forms';f.node.formDataId='a'
  const targets=await f.history.discover('s');expect(targets.map(t=>t.recordId)).toEqual(['a']);expect((await f.history.read(targets[0]!)).record.values?.note).toBe('old')
 })
 it('retains forms reference semantics and never substitutes its node default for a foreign definition',async()=>{
  const f=historicalFixture();f.node.nodeDef.nodeType='forms';f.node.exts={formList:[{_id:'a',formDefId:appointmentArchiveDefinitionId,state:1},{_id:'b',formDefId:appointmentArchiveDefinitionId,state:-1}]}
  expect((await f.history.discover('s')).map(t=>t.recordId)).toEqual(['a'])
  f.node.exts.formList[0].formDefId='foreign';await expect(f.history.discover('s')).rejects.toThrow()
 })
 it('missing completed forms references are unknown, distinct from explicit empty formList',async()=>{
  const f=historicalFixture();f.node.nodeDef.nodeType='forms';await expect(f.history.discover('s')).rejects.toThrow()
  f.node.exts={formList:[]};expect(await f.history.discover('s')).toEqual([])
 })
 it('a guessed node or a same-name survey cannot create appointment provenance',async()=>{
  const f=historicalFixture();f.node.nodeDef.formDefId='7971040108398070730';f.node.nodeDef.name='预约';await expect(f.history.discover('s')).rejects.toThrow()
 })
 it.each(['tenantId','sid','nodeId','workflowId','formDefId'] as const)('rejects a completed repeat record with foreign %s',async key=>{
  const f=historicalFixture();f.record[key]='foreign';await expect(f.history.discover('s')).rejects.toThrow()
 })
 it('does not use handler-role matching as historical user permission',async()=>{
  const f=historicalFixture();f.node.nodeDef.viewableRoleIds=[];f.node.handlerIds=['r'];await expect(f.history.discover('s')).rejects.toThrow()
 })
 it.each(['changeHistoryRole','unlistHistory'] as const)('revokes a historical target after %s',async change=>{
  const f=historicalFixture(),targets=await f.history.discover('s');f[change]();expect(f.history.isCurrent(targets[0]!)).toBe(false);await expect(f.history.read(targets[0]!)).rejects.toThrow()
 })
 it('rejects copied targets, late node changes and late permission loss',async()=>{
  const f=historicalFixture(),targets=await f.history.discover('s');await expect(f.history.read({...targets[0]!})).rejects.toThrow()
  f.node.state=0;await expect(f.history.read(targets[0]!)).rejects.toThrow();expect(f.writes).toHaveLength(0)
 })
 it('rechecks the completed source after the record read',async()=>{
  const f=historicalFixture(),targets=await f.history.discover('s');f.afterRead(()=>{f.node.nodeDef.viewableRoleIds=[];f.node.handlerIds=[]})
  await expect(f.history.read(targets[0]!)).rejects.toThrow();expect(f.history.isCurrent(targets[0]!)).toBe(false)
 })

 it.each(['readonly','scoped'] as const)('does not treat localhost %s proxy as offline authorization',async mode=>{
  const f=appointmentFixture();if(mode==='readonly'){f.env.VITE_XLINK_ENABLE_REAL_WRITES='false';f.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES='false'}
  const reader=createHistoricalFormsReader({auth:{getCurrentSession:()=>({sessionRef:'test',user:{id:'u'},currentRole:{id:'r'}} as never)},read:{isWorkOrderListedForCurrentSession:()=>true,listWorkOrders:async()=>({state:'failed_terminal'})},tenantId:'t',env:f.env,origin:'http://127.0.0.1:5189',transport:f.transport,appointmentArchive:true,appointmentNodeId:'n'})
  expect(reader.enabled()).toBe(false);await expect(reader.discover('s')).rejects.toThrow();expect(f.transport.execute).not.toHaveBeenCalled()
 })
 it('blocks unmatched offline fixture requests before invoking any network executor',async()=>{
  const request=vi.fn();vi.stubGlobal('uni',{request,getStorageSync:()=>undefined})
  const reader=createHistoricalFormsReader({auth:{getCurrentSession:()=>({sessionRef:'synthetic',user:{id:'u'},currentRole:{id:'r'}} as never)},read:{isWorkOrderListedForCurrentSession:()=>true,listWorkOrders:async()=>({state:'failed_terminal'})},tenantId:'synthetic-qa-tenant',env:offlineEnv,origin:'http://localhost:5174',appointmentArchive:true,appointmentNodeId:'n'})
  expect(reader.enabled()).toBe(true);await expect(reader.discover('unmatched-synthetic-work')).rejects.toThrow();expect(request).not.toHaveBeenCalled()
 })
 it('cannot open the historical rollout in production or beta',async()=>{
  for(const environment of ['production','beta']){const f=historicalFixture();f.historyEnv.VITE_XLINK_ENVIRONMENT=environment;expect(f.history.enabled()).toBe(false);await expect(f.history.discover('s')).rejects.toThrow();expect(f.transport.execute).not.toHaveBeenCalled()}
 })
})
describe('minute presentation preserves datetime wire precision',()=>{
 it('preserves seconds through minute selection without UTC conversion',()=>{
  expect(appointmentDisplayFor('2026-11-20 10:37:42')?.timeLabel).toBe('10:37')
  expect(appointmentDateTimeForSelection('2026-11-20 10:37:42','2026-11-21','14:09')).toBe('2026-11-21 14:09:42')
  expect(appointmentDateTimeForSelection('2026-11-20 10:37','2026-11-20','14:09')).toBe('2026-11-20 14:09')
 })
 it('retains a date-only seed and requires explicit time selection',()=>{
  expect(appointmentDateForSelection('2026-11-20')).toBe('2026-11-20');expect(appointmentDisplayFor('2026-11-20')).toBeUndefined()
  expect(appointmentDateTimeForSelection('2026-11-20','2026-11-20','')).toBeUndefined()
  expect(appointmentDateTimeForSelection('2026-11-20','2026-11-20','14:09')).toBe('2026-11-20 14:09')
  expect(appointmentDateTimeForSelection('','2026-02-30','14:09')).toBeUndefined();expect(appointmentDateTimeForSelection('','2026-11-20','24:00')).toBeUndefined()
 })
 it('uses exact definition and runtime provenance and URL-encodes identities',()=>{
  const node:any={id:'n',formDefinitionId:appointmentArchiveDefinitionId,nodeTypeEvidence:'runtime_node_def',sourceNodeType:'repeat',formPurpose:'appointment'}
  expect(appointmentArchiveNodes([node,{...node,id:'survey',formPurpose:'survey',formDefinitionId:'7971040108398070730',displayName:'预约'}])).toEqual([node])
  expect(appointmentArchiveNodes([{...node,nodeTypeEvidence:'unknown'}])).toEqual([])
  expect(appointmentArchiveRoute('s a','n?','a&b')).toBe('/pages/work-orders/detail?id=s%20a&read=appointment&node=n%3F&record=a%26b')
 })
})
