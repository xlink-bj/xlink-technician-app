import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import {createMediaQueueRepository,createMediaUploadQueue,InMemoryDurableMediaStore} from '@runtimes/media'
import {asOpaqueId,createCapabilityResult,createOperationError} from '@shared/types'
import type {StoragePort,UploadPort} from '@shared/ports'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())
function fixture(route:'map'|'survey-root'|'survey-exts'='map'){
 const h=existingRecordFixture();if(route==='map')h.mapRoute()
 const key=route==='survey-root'?'surveyDrawing':'renamedFiles',preset=route==='survey-root'?1:0
 Object.assign(h.fields[1],{name:key,type:'file',preset,required:'0',multiple:false})
 const old=[{url:'https://files.example.invalid/old.png',name:'old.png',extname:'png',opaque:{keep:[1,null]}}]
 for(const r of[h.record,h.other]){const value=r===h.record?old:[{...old[0],url:'https://files.example.invalid/other.png'}]
  if(route==='map'||preset===1)r[key]=structuredClone(value);else delete r[key]
  if(!preset)r.exts[key]=structuredClone(value);else delete r.exts[key]}
 const memory=new Map<string,unknown>()
 const storage:StoragePort={read:async<T>(k:any)=>({state:'succeeded',data:structuredClone(memory.get(k.key)??null) as T|null}),
  write:async(k,v)=>{memory.set(k.key,structuredClone(v));return{state:'succeeded'}},remove:async k=>{memory.delete(k.key);return{state:'succeeded'}},
  listKeys:async()=>({state:'succeeded',data:[...memory.keys()]})}
 let seq=0
 const upload=vi.fn<UploadPort['upload']>(async media=>({state:'succeeded',data:{url:`https://files.example.invalid/${media.ref}.png`,key:`${media.ref}.png`,extension:'png',mimeType:'image/png',source:media.source,uploadState:'uploaded'}}))
 const queue=createMediaUploadQueue(new InMemoryDurableMediaStore(),createMediaQueueRepository(storage),{upload})
 const picker={pick:vi.fn(async()=>createCapabilityResult('media_file_picker','granted',[{ref:asOpaqueId<'LocalMediaRef'>(`new-${++seq}`),source:'library' as const,mimeType:'image/png',localPath:'/synthetic/fixed.png',name:'fixed.png',size:68}]))}
 const media={queue,picker}
 const open=async()=>{const s=await h.load(),a=h.provider(media).forSnapshot(s)!;expect(a?.canEdit?.(h.record._id)).toBe(true);expect(a.beginEdit?.(h.record._id)).toBe(true);await vi.waitFor(()=>expect(a.fileMedia?.busy()??false).toBe(false));return a}
 return{...h,key,old,upload,queue,picker,open,media}
}
it.each(['map','survey-root','survey-exts'] as const)('%s appends only owned queue receipts and preserves old metadata and slots',async route=>{
 const h=fixture(route),before=structuredClone(h.record),other=structuredClone(h.other),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 const files=await a.fileMedia!.pick(h.fields[1]._id,draft);expect(files).toHaveLength(2);draft[h.key]=files
 expect(a.validateDraft!(draft,h.record._id)).toBe(true)
 const task=(await h.queue.listForAction({userId:h.scope.userId as never,workOrderId:h.scope.workOrderId as never,workflowNodeId:h.scope.runtimeNodeId as never,formDefinitionId:h.scope.formDefinitionId as never,formDataId:h.record._id as never})).data![0]!
 expect(task.scope.formDataId).toBe(h.record._id)
 const saved=await a.saveOnly(draft,h.record._id)
 expect(h.writes).toHaveLength(1);expect(h.upload).toHaveBeenCalledTimes(1);expect(h.reader.isCurrent(saved)).toBe(true)
 const sent=JSON.parse(h.writes[0].body.dataStr)
 for(const slot of ['root','exts']){const b=slot==='root'?before:before.exts,s=slot==='root'?sent:sent.exts
  expect(Object.hasOwn(s,h.key)).toBe(Object.hasOwn(b,h.key));if(Object.hasOwn(b,h.key)){expect(s[h.key]).toEqual(files);expect(s[h.key][0]).toEqual(h.old[0])}}
 expect(h.other).toEqual(other)
})
it('cannot append arbitrary URLs or steal another record reference',async()=>{
 const h=fixture(),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 for(const forged of[[...h.old,{...h.old[0],url:'https://files.example.invalid/forged.png'}],h.other.exts[h.key]]){
  expect(a.validateDraft!({...draft,[h.key]:forged},h.record._id)).toBe(false)
  await expect(a.saveOnly({...draft,[h.key]:forged},h.record._id)).rejects.toThrow()}
 expect(h.writes).toHaveLength(0);expect(h.upload).not.toHaveBeenCalled()
})
it('cancel after upload removes local tasks only and can reopen the same record',async()=>{
 const h=fixture(),before=structuredClone(h.record),a=await h.open(),draft=a.initialValues!(h.record._id)!
 await a.fileMedia!.pick(h.fields[1]._id,draft);expect(await a.fileMedia!.cancel()).toBe(true)
 expect(h.record).toEqual(before);expect(h.writes).toHaveLength(0);expect(a.beginEdit!(h.record._id)).toBe(true)
 expect(a.initialValues!(h.record._id)![h.key]).toEqual(h.old)
})
it('known rejection is blocked until explicit retry; uncertain upload never retries',async()=>{
 const h=fixture(),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 h.upload.mockResolvedValueOnce({state:'failed_retryable',error:createOperationError('network_retryable','known rejection')})
 expect(await a.fileMedia!.pick(h.fields[1]._id,draft)).toBeNull();expect(a.fileMedia!.ready(draft)).toBe(false);expect(a.validateDraft!(draft,h.record._id)).toBe(false)
 const files=await a.fileMedia!.retry(h.fields[1]._id,draft);expect(files).toHaveLength(2);expect(h.upload).toHaveBeenCalledTimes(2)
 draft[h.key]=files;await a.saveOnly(draft,h.record._id);expect(h.writes).toHaveLength(1)
 installLocalFixtureBrowser()
 const b=fixture(),c=await b.open(),d=c.initialValues!(b.record._id)!
 b.upload.mockResolvedValueOnce({state:'failed_retryable',error:createOperationError('network_retryable','unknown',{code:'ambiguous_upload'})})
 expect(await c.fileMedia!.pick(b.fields[1]._id,d)).toBeNull();expect(await c.fileMedia!.retry(b.fields[1]._id,d)).toBeNull()
 expect(c.fileMedia!.ready(d)).toBe(false);expect(b.upload).toHaveBeenCalledTimes(1);expect(b.writes).toHaveLength(0)
})
it('old count plus reserved failed tasks prevents overbooking',async()=>{
 const h=fixture();h.fields[1].frontEndConfig=JSON.stringify({max:2})
 const a=await h.open(),draft=a.initialValues!(h.record._id)!
 h.upload.mockResolvedValueOnce({state:'failed_retryable',error:createOperationError('network_retryable','known rejection')})
 await a.fileMedia!.pick(h.fields[1]._id,draft)
 expect(a.fileMedia!.canPick(h.fields[1]._id,draft)).toBe(false);expect(await a.fileMedia!.pick(h.fields[1]._id,draft)).toBeNull()
 expect(h.picker.pick).toHaveBeenCalledTimes(1);expect(h.writes).toHaveLength(0)
})
it('actor loss while uploading never adopts a late receipt',async()=>{
 const h=fixture(),a=await h.open(),draft=a.initialValues!(h.record._id)!
 let release!:(x:any)=>void;h.upload.mockImplementationOnce(()=>new Promise(r=>release=r))
 const picking=a.fileMedia!.pick(h.fields[1]._id,draft);await vi.waitFor(()=>expect(h.upload).toHaveBeenCalledTimes(1))
 h.changeActor();release({state:'succeeded',data:{url:'https://files.example.invalid/late.png',key:'late.png',extension:'png',mimeType:'image/png',source:'library',uploadState:'uploaded'}})
 expect(await picking).toBeNull();expect(a.fileMedia!.ready(draft)).toBe(false);expect(h.writes).toHaveLength(0)
})
it('old removals and new owned receipt share the single draft without rewriting old metadata',async()=>{
 const h=fixture(),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 draft[h.key]=await a.fileMedia!.remove(h.fields[1]._id,0,draft);expect(draft[h.key]).toEqual([])
 draft[h.key]=await a.fileMedia!.pick(h.fields[1]._id,draft);expect(draft[h.key]).toHaveLength(1)
 expect(a.validateDraft!(draft,h.record._id)).toBe(true);await a.saveOnly(draft,h.record._id)
 expect(h.writes).toHaveLength(1);expect(h.record.exts[h.key]).toEqual(draft[h.key])
})
it('new receipt metadata cannot be changed and a fresh editor cannot import durable uploaded tasks',async()=>{
 const h=fixture(),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 const files=await a.fileMedia!.pick(h.fields[1]._id,draft)
 const forged=structuredClone(files!);(forged[1] as any).extra='not-receipted'
 expect(a.validateDraft!({...draft,[h.key]:forged},h.record._id)).toBe(false)
 const fresh=await h.open();expect(fresh.fileMedia!.ready({...draft,[h.key]:files})).toBe(false)
 await expect(fresh.saveOnly({...draft,[h.key]:files},h.record._id)).rejects.toThrow();expect(h.writes).toHaveLength(0);expect(h.upload).toHaveBeenCalledTimes(1)
})
it('readonly attachments expose no upload session while another field saves and preserves both slots',async()=>{
 const h=fixture(),before=structuredClone(h.record);h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id];h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id];h.grant.fieldIds=[h.fields[0]._id];h.setGrant()
 const a=await h.open();expect(a.fileMedia).toBeUndefined()
 await a.saveOnly({...a.initialValues!(h.record._id),[h.keys[0]]:15},h.record._id)
 expect(h.record[h.key]).toEqual(before[h.key]);expect(h.record.exts[h.key]).toEqual(before.exts[h.key]);expect(h.upload).not.toHaveBeenCalled()
})
it('required existing empty file refuses save and becomes valid only after a proven upload',async()=>{
 const h=fixture();h.fields[1].required='1';h.record[h.key]=[];h.record.exts[h.key]=[]
 const a=await h.open(),draft={...a.initialValues!(h.record._id)}
 expect(a.validateDraft!(draft,h.record._id)).toBe(false);await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow()
 draft[h.key]=await a.fileMedia!.pick(h.fields[1]._id,draft);await a.saveOnly(draft,h.record._id);expect(h.writes).toHaveLength(1)
})
it('full original drift before dispatch rejects owned new files without any business command',async()=>{
 const h=fixture(),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 draft[h.key]=await a.fileMedia!.pick(h.fields[1]._id,draft)
 h.record.exts.preserved.sequence.push(99)
 await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow();expect(h.writes).toHaveLength(0)
})
it('missing save identity locks the exact record and does not replay its upload or command',async()=>{
 const h=fixture(),a=await h.open(),draft={...a.initialValues!(h.record._id)}
 draft[h.key]=await a.fileMedia!.pick(h.fields[1]._id,draft)
 const execute=h.commands.execute.getMockImplementation()!
 h.commands.execute.mockImplementationOnce(async request=>{await execute(request);return{success:true,status:1,data:{}}})
 await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow();await expect(a.saveOnly(draft,h.record._id)).rejects.toThrow()
 expect(h.writes).toHaveLength(1);expect(h.upload).toHaveBeenCalledTimes(1)
})

it('unclassified native terminal failure is uncertain rather than a proven no-storage rejection',async()=>{
 const h=fixture(),a=await h.open(),draft=a.initialValues!(h.record._id)!
 h.upload.mockResolvedValueOnce({state:'failed_terminal',error:createOperationError('server_terminal','Native transport or malformed ACK failed')})
 expect(await a.fileMedia!.pick(h.fields[1]._id,draft)).toBeNull()
 expect(await a.fileMedia!.cancel()).toBe(false);expect(await a.fileMedia!.retry(h.fields[1]._id,draft)).toBeNull()
 expect(a.validateDraft!(draft,h.record._id)).toBe(false);expect(h.upload).toHaveBeenCalledTimes(1);expect(h.writes).toHaveLength(0)
})
