import { describe,expect,it } from 'vitest'
import { genericMapFixture as fixture } from '../fixtures/generic-map-route'
describe('lease-bound Ext.type0 existing-record route facts, never edit permission',()=>{
 it('issues route facts from the actual Ext and exact original read',async()=>{
  const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s)
  expect(e).toMatchObject({tenantId:'t',workOrderId:'s',runtimeNodeId:'n',workflowRunId:'w',formDefinitionId:'e',recordId:'v',type:'0',colName:'syntheticScalar',collectionName:'frm_t_syntheticScalar',original:h.record})
  expect(h.valid(s,e)).toBe(true)
  expect(h.calls.some(p=>/upsert|updateExts|process|upload/.test(p))).toBe(false)
 })
 it.each([1,'1',0,undefined,'generic'])('does not infer generic from raw Ext.type %s',async type=>{
  const h=fixture();h.ext.type=type
  if([1,'1',0].includes(type as never)){const s=await h.reader.load('s','n');expect(h.route(s)).toBeNull()}
  else await expect(h.reader.load('s','n')).rejects.toThrow()
 })
 it.each(['missing','wrong','id-alias','collection-alias'])('refuses missing/conflicting schema or Ext identity: %s',async kind=>{
  const h=fixture()
  if(kind==='missing')delete h.fields[50].colName
  if(kind==='wrong')h.fields[50].colName='other'
  if(kind==='id-alias')h.ext.id='other'
  if(kind==='collection-alias')h.ext.collectionName='other'
  const s=await h.reader.load('s','n');expect(h.route(s)).toBeNull()
 })
 it('refuses the type0 serviceAppointment privacy projection',async()=>{
  const h=fixture();h.ext.colName='serviceAppointment';h.fields.forEach(f=>{f.colName='serviceAppointment'})
  const s=await h.reader.load('s','n');expect(h.route(s)).toBeNull()
 })
 it('rejects copied/forged tokens and binds the exact original object',async()=>{
  const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s)
  expect(h.valid(s,{...e})).toBe(false);expect(h.valid(s,JSON.parse(JSON.stringify(e)))).toBe(false)
  expect(h.valid({...s},e)).toBe(false);expect(h.valid(s,e,'unknown')).toBe(false)
  e.original.exts.memo='mutated';expect(h.valid(s,e)).toBe(false)
 })
 it.each(['role','logout','unlist','clear'])('revokes route proof after %s',async kind=>{
  const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s)
  if(kind==='clear')h.reader.clear();else h[kind as 'role'|'logout'|'unlist']()
  expect(h.valid(s,e)).toBe(false);expect(h.route(s)).toBeNull()
 })
 it('does not authorize an ACK ID and revokes old proof on a fresh type change',async()=>{
  const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s)
  expect(h.route(s,'ack-only')).toBeNull();h.ext.type='1';const fresh=await h.reader.load('s','n')
  expect(h.valid(s,e)).toBe(false);expect(h.route(fresh)).toBeNull()
 })
 it.each(['tenantId','_id','state'])('invalid fresh Ext.%s revokes the old lease',async key=>{
  const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s);h.ext[key]=key==='state'?0:'other'
  await expect(h.reader.load('s','n')).rejects.toThrow();expect(h.valid(s,e)).toBe(false)
 })
})
it('revokes proof on public schema mutation and ignores a forged snapshot label',async()=>{
 const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s)
 ;(s.definition.fields![0] as any).required=true
 expect(h.valid(s,e)).toBe(false);expect(h.route(s)).toBeNull()
})
it('rejects an old role late response before any proof becomes current',async()=>{
 const h=fixture();let release!:()=>void,arrived!:()=>void
 const ready=new Promise<void>(r=>{arrived=r}),gate=new Promise<void>(r=>{release=r})
 h.hook(async path=>{if(path==='biz/ext/queryById.do'){arrived();await gate}})
 const pending=h.reader.load('s','n');await ready;h.role();release();await expect(pending).rejects.toThrow()
 expect(h.calls.some(p=>/upsert|process|upload|updateExts/.test(p))).toBe(false)
})
it('uses type0 existing Map route facts even when a collection label looks Survey-like',async()=>{
 const h=fixture();h.ext.colName='survey';h.fields.forEach(f=>{f.colName='survey'})
 const s=await h.reader.load('s','n'),e=h.route(s)
 expect(e?.type).toBe('0');expect(e?.collectionName).toBe('frm_t_survey');expect(h.valid(s,e)).toBe(true)
})
it('rejects a publicly mutated node-definition relation on an issued proof',async()=>{
 const h=fixture(),s=await h.reader.load('s','n'),e=h.route(s)
 ;(s.node as any).formDefinitionId='other-definition'
 expect(h.valid(s,e)).toBe(false);expect(h.route(s)).toBeNull()
})

// Real R1 DataEntity#getCollectionName serializes an exact empty-string sentinel.
// It is not a collection identity; all other present conflicting values remain closed.
it.each(['definition','fields'])('accepts the real inherited empty collectionName sentinel: %s',async where=>{
 const h=fixture()
 if(where==='definition')h.ext.collectionName=''
 else h.fields.forEach(f=>{f.collectionName=''})
 const s=await h.reader.load('s','n'),e=h.route(s)
 expect(e?.collectionName).toBe('frm_t_syntheticScalar');expect(h.valid(s,e)).toBe(true)
 expect(h.calls.some(p=>/upsert|updateExts|process|upload/.test(p))).toBe(false)
})
it.each(['definition','fields'].flatMap(where=>[null,undefined,' ','\t',0,1,false,'other'].map(value=>({where,value}))))('rejects present non-sentinel collectionName $where/$value',async({where,value})=>{
 const h=fixture()
 if(where==='definition')h.ext.collectionName=value
 else h.fields.forEach(f=>{f.collectionName=value})
 const s=await h.reader.load('s','n');expect(h.route(s)).toBeNull()
 expect(h.calls.some(p=>/upsert|updateExts|process|upload/.test(p))).toBe(false)
})
