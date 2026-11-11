import { bindR1ConfiguredFileReadDisplay } from '@shared/form/r1-configured-file-read-evidence'
import { configuredFileStorage } from '@adapters/api/r1-configured-file-storage'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { formDefinition } from '@adapters/api/read-models/form'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { configuredFileSource, surveyMediaSourceSeal } from '@app/r1-survey-media-source'
import { supportsR1ConfiguredFileSchema } from '@features/work-orders/r1-normal-file-values'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalNodeFormActionProvider } from '@app/r1-forms-authorization'

const metadata = () => JSON.parse(readFileSync('tests/fixtures/synthetic-java-configured-file-metadata.json', 'utf8'))
const origin = 'http://127.0.0.1:5189'
function fixture(grantMode = 'none') {
  const { fields, ext } = metadata(), tenant = ext.tenantId
  let session: any = { sessionRef: 'synthetic-read-only-not-real-auth', user: { id: 'synthetic-reader' }, currentRole: { id: 'synthetic-role' } }
  const node: any = { _id: 'synthetic-node', tenantId: tenant, workflowId: 'synthetic-run', workflowFormDataId: 'synthetic-work', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: [session.user.id], nodeDef: { nodeType: 'repeat', formDefId: ext._id, formFieldIdsFill: fields.data.map((f: any) => f._id), formFieldIdsReadOnly: [] } }
  const file = (key: string) => ({ url: 'https://synthetic-read.invalid/' + key + '.png', name: key + '.png', extname: 'png' })
  const original: any = { _id: 'synthetic-record', tenantId: tenant, sid: 'synthetic-work', nodeId: node._id, workflowId: 'synthetic-run', state: 1, memo: 'synthetic readonly', width: 0, exts: { evidenceNorth: [file('north')], qualityProof: [file('proof')] } }
  const scope = { tenantId: tenant, userId: session.user.id, roleId: session.currentRole.id, workOrderId: 'synthetic-work', workflowRunId: 'synthetic-run', runtimeNodeId: node._id, formDefinitionId: ext._id }
  const grant: any = { version: 4, profile: 'dynamic-file-first', scope, fieldIds: fields.data.map((f: any) => f._id), operations: ['create'], expiresAt: '2099-01-01T00:00:00Z' }
  if (grantMode === 'v3') { grant.version = 3; grant.profile = 'survey-media-first' }
  const env: any = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: tenant, VITE_XLINK_API_BASE_URL: origin + '/xlink/wm', VITE_XLINK_MOCK: 'false', VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false', VITE_XLINK_R1_REPEAT_ACTIONS: grantMode === 'none' ? 'false' : 'true', VITE_XLINK_R1_REPEAT_GRANT: grantMode === 'none' ? '' : JSON.stringify(grant) }
  let listed = true
  const calls: string[] = []
  const transport = { execute: vi.fn(async (req: any) => {
    calls.push(req.path)
    if (req.path === 'basic/serviceAppointment/queryById/synthetic-work') return { success: true, status: 1, data: { serviceAppointment: { _id: 'synthetic-work', tenantId: tenant, workflowId: 'synthetic-run', state: 1 }, workflow: { _id: 'synthetic-run', tenantId: tenant, formDataId: 'synthetic-work', state: 0 }, workflowNode: [structuredClone(node)] } }
    if (req.path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (req.path === 'biz/extField/query') return structuredClone(fields)
    if (req.path === 'biz/extForm/query/' + ext._id) return { data: [structuredClone(original)], total: 1, page: 1, size: Number(req.body.rows), dataCount: 1 }
    throw Error('Read-only fixture forbids every command and external provider')
  }) }
  const auth = { getCurrentSession: () => session }
  const reader = createNormalNodeFormsReader({ auth, read: { listWorkOrders: vi.fn(), isWorkOrderListedForCurrentSession: () => listed, getDynamicCodeOptions: vi.fn() } as any, tenantId: tenant, env, origin, transport })
  const provider = createNormalNodeFormActionProvider({ auth, reader, env, origin })
  const source = () => { const definition = formDefinition(fields, ext._id), snapshot = { workOrderId: 'synthetic-work', node: workflowNode(node), definition, records: [], fillableFieldIds: fields.data.map((f: any) => f._id) }; return { snapshot, source: configuredFileSource(snapshot as any, ext, fields.data, tenant) } }
  return { fields, ext, node, original, reader, provider, calls, source, role: () => { session = { ...session, currentRole: { id: 'other' } } }, restoreRole: () => { session = { ...session, currentRole: { id: 'synthetic-role' } } }, unlist: () => { listed = false }, relist: () => { listed = true } }
}
describe('actual synthetic Java column metadata and independent readonly file decoding', () => {
  it('accepts the ordinary Java customizeFlag=1 column marker without deleting metadata', () => {
    const h = fixture(), { snapshot, source } = h.source()
    expect(h.fields.data.map((f: any) => f.customizeFlag)).toEqual([1, 1, 1, 1, 1])
    expect(snapshot.definition.fields!.map(f => f.presentation?.customizeFlag)).toEqual([true, true, true, true, true])
    expect(supportsR1ConfiguredFileSchema(snapshot as any)).toBe(true)
    expect(source?.storage.kind).toBe('survey-dto')
  })
  it.each(['none', 'v4', 'v3'])('cold-decodes arbitrary existing EXTS pictures with writes off / %s grant', async mode => {
    const h = fixture(mode), s = await h.reader.load('synthetic-work', 'synthetic-node')
    expect(s.records[0]!.values?.evidenceNorth).toEqual(h.original.exts.evidenceNorth)
    expect(s.records[0]!.values?.qualityProof).toEqual(h.original.exts.qualityProof)
    expect(s.records[0]!.values?.memo).toBe('synthetic readonly'); expect(s.records[0]!.values?.width).toBe(0)
    expect(s.records[0]!.values).not.toHaveProperty('spareAttachment')
    expect(h.reader.currentFormOriginal!(s, 'synthetic-record')).toEqual(h.original)
    const view = projectR1RecordReadFields(s.definition, s.records[0]!)
    expect(view.find(f => f.valueKey === 'evidenceNorth')).toMatchObject({ unavailable: false, text: '1 个附件' })
    expect(view.find(f => f.valueKey === 'qualityProof')).toMatchObject({ unavailable: false, text: '1 个附件' })
    expect(view.find(f => f.valueKey === 'spareAttachment')).toMatchObject({ unavailable: false, text: '未保存' })
    expect(h.reader.isCurrent(s)).toBe(true); expect(h.reader.currentSurveyMediaSource!(s)).toBeNull()
    expect(h.provider.forSnapshot(s)).toBeNull()
    expect(h.calls.some(p => /upsert|updateExts|process|upload|upToken/i.test(p))).toBe(false)
  })
})


describe('column marker and readonly evidence remain strict', () => {
  it.each([0, 1])('accepts only source numeric marker %i with matching projection', marker => {
    const h = fixture(); h.fields.data.forEach((f: any) => { f.customizeFlag = marker })
    expect(h.source().source).toBeTruthy()
  })
  it('keeps legacy missing marker distinct and compatible', () => {
    const h = fixture(); h.fields.data.forEach((f: any) => { delete f.customizeFlag })
    expect(h.source().source).toBeTruthy()
  })
  it.each([undefined, null, '1', '0', true, false, 2, -1, {}, []])('rejects explicit invalid raw marker %j', marker => {
    const h = fixture(); h.fields.data[0].customizeFlag = marker
    expect(h.source().source).toBeUndefined()
  })
  it('rejects raw/mapped marker contradiction', () => {
    const h = fixture(), { snapshot } = h.source()
    ;(snapshot.definition.fields![0]!.presentation as any).customizeFlag = false
    expect(configuredFileSource(snapshot as any, h.ext, h.fields.data, h.ext.tenantId)).toBeUndefined()
  })
  it.each(['componentType', 'url', 'params', 'surveyTool'])('does not turn genuine %s behavior into the ordinary column marker', name => {
    const h = fixture(); h.fields.data[0][name] = name === 'surveyTool' ? true : 'unverified'
    expect(h.source().source).toBeUndefined()
  })
  it('reads without fillable authority and never issues a write proof', async () => {
    const h = fixture(); delete h.node.nodeDef.formFieldIdsFill
    h.node.nodeDef.formFieldIdsReadOnly = h.fields.data.map((f: any) => f._id)
    const s = await h.reader.load('synthetic-work', 'synthetic-node')
    expect(s.records[0]!.values?.evidenceNorth).toEqual(h.original.exts.evidenceNorth)
    expect(h.provider.forSnapshot(s)).toBeNull(); expect(h.reader.currentSurveyMediaSource!(s)).toBeNull()
  })
  it.each([null, {}, [null], [{}], [{ url: 'https://', name: 'bad.png', extname: 'png' }]])('rejects malformed optional own slot %j', async value => {
    const h = fixture(); h.original.exts.spareAttachment = value
    await expect(h.reader.load('synthetic-work', 'synthetic-node')).rejects.toThrow()
  })
  it('preserves legitimate empty optional array without fabricating an absent value', async () => {
    const h = fixture(); h.original.exts.spareAttachment = []
    const s = await h.reader.load('synthetic-work', 'synthetic-node')
    expect(s.records[0]!.values).toHaveProperty('spareAttachment', [])
    expect(projectR1RecordReadFields(s.definition, s.records[0]!).find(f => f.valueKey === 'spareAttachment')).toMatchObject({ unavailable: false, text: '空值' })
  })
  it('rejects a conflicting unknown typed root despite correct EXTS display data', async () => {
    const h = fixture(); h.original.evidenceNorth = h.original.exts.evidenceNorth
    await expect(h.reader.load('synthetic-work', 'synthetic-node')).rejects.toThrow()
  })
  it('requires exact mirrored slots on generic Map storage', async () => {
    const h = fixture(); h.ext.type = '0'; h.ext.colName = 'syntheticReadMap'; h.fields.data.forEach((f: any) => { f.colName = h.ext.colName })
    Object.assign(h.original, structuredClone(h.original.exts))
    const s = await h.reader.load('synthetic-work', 'synthetic-node')
    expect(projectR1RecordReadFields(s.definition, s.records[0]!).find(f => f.valueKey === 'evidenceNorth')).toMatchObject({ unavailable: false, text: '1 个附件' })
    h.original.evidenceNorth = []
    await expect(h.reader.load('synthetic-work', 'synthetic-node')).rejects.toThrow(); expect(h.reader.isCurrent(s)).toBe(false)
  })
  it('copies, role revocation and external reread cannot retain display evidence', async () => {
    const h = fixture(), s = await h.reader.load('synthetic-work', 'synthetic-node')
    const view = (definition: any, record: any) => projectR1RecordReadFields(definition, record).find(f => f.valueKey === 'spareAttachment')!
    expect(view(s.definition, s.records[0])).toMatchObject({ unavailable: false, text: '未保存' })
    expect(view(s.definition, { ...s.records[0] }).unavailable).toBe(true)
    expect(view({ ...s.definition }, s.records[0]).unavailable).toBe(true)
    await h.reader.load('synthetic-work', 'synthetic-node'); expect(view(s.definition, s.records[0]).unavailable).toBe(true)
    const next = await h.reader.load('synthetic-work', 'synthetic-node'); h.role()
    expect(h.reader.isCurrent(next)).toBe(false); expect(view(next.definition, next.records[0]).unavailable).toBe(true)
  })
  it('mutated public metadata cannot prove optional absence', async () => {
    const h = fixture(), s = await h.reader.load('synthetic-work', 'synthetic-node')
    ;(s.definition.fields![0] as any).required = false
    expect(projectR1RecordReadFields(s.definition, s.records[0]!).find(f => f.valueKey === 'spareAttachment')!.unavailable).toBe(true)
  })
})


it('unverified tools never turn lost file projection into verified absence', async () => {
  const h = fixture(); h.fields.data[0].frontEndConfig = '{"max":2,"surveyTool":true}'
  const s = await h.reader.load('synthetic-work', 'synthetic-node')
  const view = projectR1RecordReadFields(s.definition, s.records[0]!)
  expect(view.find(f => f.valueKey === 'evidenceNorth')!.unavailable).toBe(true)
  expect(view.find(f => f.valueKey === 'spareAttachment')!.unavailable).toBe(true)
  expect(h.provider.forSnapshot(s)).toBeNull()
})
it('public node metadata mutation revokes read display evidence', async () => {
  const h = fixture(), s = await h.reader.load('synthetic-work', 'synthetic-node')
  ;(s.node as any).formFieldIdsReadOnly = ['different']
  expect(projectR1RecordReadFields(s.definition, s.records[0]!).find(f => f.valueKey === 'spareAttachment')!.unavailable).toBe(true)
})


it('the v3 legacy profile retains its two fields and rejects malformed column markers', () => {
  const h = fixture(); h.fields.data = h.fields.data.filter((f: any) => f.type === 'file').slice(0, 2)
  h.fields.data.forEach((f: any, i: number) => { f.name = i ? 'images1' : 'infraredImageList'; f.preset = i ? 0 : 1; f.required = i ? '1' : '0'; f.frontEndConfig = JSON.stringify({ max: i ? 10 : 4 }) })
  h.node.nodeDef.formFieldIdsFill = h.fields.data.map((f: any) => f._id)
  const snapshot = h.source().snapshot
  expect(surveyMediaSourceSeal(snapshot as any, h.ext, h.fields.data, h.ext.tenantId)).toBeTruthy()
  h.fields.data[0].customizeFlag = true
  expect(surveyMediaSourceSeal(snapshot as any, h.ext, h.fields.data, h.ext.tenantId)).toBeUndefined()
})


describe('observed display revocation cannot revive or fall through',()=>{
 const picture=(s:any)=>projectR1RecordReadFields(s.definition,s.records[0]).find(f=>f.valueKey==='evidenceNorth')!
 const absent=(s:any)=>projectR1RecordReadFields(s.definition,s.records[0]).find(f=>f.valueKey==='spareAttachment')!
 function map(h:ReturnType<typeof fixture>){h.ext.type='0';h.ext.colName='syntheticReadMap';h.fields.data.forEach((f:any)=>{f.colName=h.ext.colName});Object.assign(h.original,structuredClone(h.original.exts))}
 it.each(['typed','map'])('%s copies cannot preview through shape fallback',async kind=>{
  const h=fixture();if(kind==='map')map(h);const s=await h.reader.load('synthetic-work','synthetic-node')
  expect(picture(s).unavailable).toBe(false)
  expect(picture({...s,records:[{...s.records[0]}]}).unavailable).toBe(true)
  expect(picture({...s,definition:{...s.definition}}).unavailable).toBe(true)
 })
 it.each(['typed','map'])('%s observed actor/listed revocation is permanent for files and absence',async kind=>{
  for(const mode of ['actor','listed']){
   const h=fixture();if(kind==='map')map(h);const s=await h.reader.load('synthetic-work','synthetic-node')
   if(mode==='actor')h.role();else h.unlist()
   expect(picture(s).unavailable).toBe(true);expect(absent(s).unavailable).toBe(true)
   if(mode==='actor')h.restoreRole();else h.relist()
   expect(picture(s).unavailable).toBe(true);expect(absent(s).unavailable).toBe(true)
   const fresh=await h.reader.load('synthetic-work','synthetic-node')
   expect(picture(fresh).unavailable).toBe(false);expect(absent(fresh).text).toBe('未保存');expect(picture(s).unavailable).toBe(true)
  }
 })
 it.each(['typed','map'])('%s observed mutation/restoration cannot revive old display',async kind=>{
  for(const mode of ['schema','node']){
   const h=fixture();if(kind==='map')map(h);const s=await h.reader.load('synthetic-work','synthetic-node');let restore:()=>void
   if(mode==='schema'){const old=s.definition.fields![0]!.label;(s.definition.fields![0]as any).label='changed';restore=()=>{(s.definition.fields![0]as any).label=old}}
   else{const old=s.node.formFieldIdsReadOnly;(s.node as any).formFieldIdsReadOnly=['changed'];restore=()=>{(s.node as any).formFieldIdsReadOnly=old}}
   expect(picture(s).unavailable).toBe(true);restore();expect(picture(s).unavailable).toBe(true);expect(absent(s).unavailable).toBe(true)
   const fresh=await h.reader.load('synthetic-work','synthetic-node');expect(picture(fresh).unavailable).toBe(false);expect(picture(s).unavailable).toBe(true)
  }
 })
})


it.each(['typed','map'])('%s observed API isCurrent=false permanently revokes the display epoch',async kind=>{
 const h=fixture();if(kind==='map'){h.ext.type='0';h.ext.colName='syntheticReadMap';h.fields.data.forEach((f:any)=>{f.colName=h.ext.colName});Object.assign(h.original,structuredClone(h.original.exts))}
 const s=await h.reader.load('synthetic-work','synthetic-node');h.unlist();expect(h.reader.isCurrent(s)).toBe(false);h.relist()
 expect(h.reader.isCurrent(s)).toBe(false)
 expect(projectR1RecordReadFields(s.definition,s.records[0]!).find(f=>f.valueKey==='evidenceNorth')!.unavailable).toBe(true)
 const fresh=await h.reader.load('synthetic-work','synthetic-node');expect(h.reader.isCurrent(fresh)).toBe(true)
})
it.each(['typed','map'])('%s private display evidence rejects observed mutable value seal restoration',async kind=>{
 const h=fixture();if(kind==='map'){h.ext.type='0';h.ext.colName='syntheticReadMap';h.fields.data.forEach((f:any)=>{f.colName=h.ext.colName});Object.assign(h.original,structuredClone(h.original.exts))}
 const s=await h.reader.load('synthetic-work','synthetic-node')
 expect(Object.isFrozen(s.records[0]!.values)).toBe(true)
 // Real reader values are frozen; exercise the private evidence module itself
 // with an explicitly mutable synthetic record, not a forged reader credential.
 const definition=structuredClone(s.definition),record=structuredClone(s.records[0]!)
 bindR1ConfiguredFileReadDisplay(definition,record,configuredFileStorage(definition,h.ext)!,h.original,()=>true)
 const view=()=>projectR1RecordReadFields(definition,record).find(f=>f.valueKey==='evidenceNorth')!
 expect(view().unavailable).toBe(false);const memo=record.values!.memo;(record.values as any).memo='mutated'
 expect(view().unavailable).toBe(true);(record.values as any).memo=memo;expect(view().unavailable).toBe(true)
 expect(()=>bindR1ConfiguredFileReadDisplay(definition,record,configuredFileStorage(definition,h.ext)!,h.original,()=>true)).toThrow()
})


it('legacy Map display binds only codec-verified fields, preserving the full schema',async()=>{
 const h=fixture();h.ext.type='0';h.ext.colName='syntheticReadMap'
 h.node.nodeDef.nodeType='forms';h.node.exts={formList:[{_id:'synthetic-record',formDefId:h.ext._id,state:1}]}
 h.fields.data.forEach((f:any)=>{f.colName=h.ext.colName;f.required=0})
 Object.assign(h.original,structuredClone(h.original.exts))
 const unsupported=h.fields.data.find((f:any)=>f.name==='spareAttachment')!
 unsupported.readOnly=1;unsupported.frontEndConfig='{"max":3,"surveyTool":true}'
 h.node.nodeDef.formFieldIdsFill=h.fields.data.filter((f:any)=>f!==unsupported).map((f:any)=>f._id)
 h.node.nodeDef.formFieldIdsReadOnly=[unsupported._id]
 const s=await h.reader.load('synthetic-work','synthetic-node'),view=projectR1RecordReadFields(s.definition,s.records[0]!)
 expect(s.definition.fields).toHaveLength(5)
 expect(view.find(f=>f.valueKey==='evidenceNorth')).toMatchObject({unavailable:false,text:'1 个附件'})
 expect(view.find(f=>f.valueKey==='spareAttachment')!.unavailable).toBe(true)
 expect(h.provider.forSnapshot(s)).toBeNull()
})
