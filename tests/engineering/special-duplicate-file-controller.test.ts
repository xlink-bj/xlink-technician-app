import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { mockCommandState, resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import * as mockReads from '@adapters/api/mock/router'
import * as r1SpecialTransport from '@adapters/api/mock/r1-special-protocol'
import {
  createAStageSpecialMockController, type AStageMockActor,
} from '@app/a-stage-special-mock-ui'
import { mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId,
  mockSyntheticDynamicFormDefinitionId, mockR1NoteFormDefinitionId } from '@adapters/api/mock/fixtures'
import type { StoragePort, StorageKey } from '@shared/ports'

const memory = new Map<string, unknown>()
const receipts = new Map<string, unknown>()
const actor: AStageMockActor = {
  userId: 'synthetic-user', roleId: 'synthetic-role', identity: 'synthetic-user:synthetic-role:local',
}
const fields = (summary: string, result = 'follow_up', note?: string) => ({
  inspectionSummary: summary, inspectionResult: result,
  ...(note ? { inspectionNote: note } : {}),
})
function storage(): StoragePort {
  return {
    read: async (key: StorageKey) => ({ state: 'succeeded', data: receipts.get(key.key) ?? null }),
    write: async (key: StorageKey, value: unknown) => {
      receipts.set(key.key, value)
      return { state: 'succeeded' }
    },
    remove: async (key: StorageKey) => {
      receipts.delete(key.key)
      return { state: 'succeeded' }
    },
    listKeys: async (scope: { readonly prefix?: string }) => ({
      state: 'succeeded', data: [...receipts.keys()].filter(key =>
        !scope.prefix || key.startsWith(scope.prefix)),
    }),
  } as StoragePort
}
beforeEach(() => {
  memory.clear()
  receipts.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => memory.get(key),
    setStorageSync: (key: string, value: unknown) => { memory.set(key, value) },
    removeStorageSync: (key: string) => { memory.delete(key) },
  })
  resetBusinessMockCache()
  setBusinessMockMode('data')
  resetMockCommandState()
  resetMockJourney()
})
afterEach(() => {
  resetBusinessMockCache()
  resetMockCommandState()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
function controller(kind: 'forms' | 'repeat', getActor = () => actor,
  port: StoragePort = storage()) {
  return createAStageSpecialMockController({ kind,
    workOrderId: kind === 'forms' ? mockR1FormsWorkOrderId : mockR1RepeatWorkOrderId,
    storage: port, getActor })
}


import { duplicateFileDefinition } from '@adapters/api/mock/duplicate-file-fixture'
import { createMediaUploadQueue, createMediaQueueRepository, InMemoryDurableMediaStore } from '@runtimes/media'
import { asOpaqueId, createCapabilityResult, createOperationError, r1FileWireFromUpload } from '@shared/types'

async function setup(kind: 'forms' | 'repeat', reverse = false) {
  vi.stubEnv('VITE_XLINK_R1_SPECIAL_MEDIA', 'true')
  const read = mockReads.tryMockRead
  let definition = duplicateFileDefinition(reverse)
  vi.spyOn(mockReads, 'tryMockRead').mockImplementation(async (path, data, options) => {
    if (path === 'biz/extField/query' && data?.extId === mockSyntheticDynamicFormDefinitionId) return structuredClone(definition)
    return read(path, data, options)
  })
  let count = 0, failUpload = false
  let currentActor: AStageMockActor | null = actor
  const queue = createMediaUploadQueue(new InMemoryDurableMediaStore(), createMediaQueueRepository(storage()), {
    upload: async () => failUpload ? {state:'failed_retryable' as const, error:createOperationError('network_retryable','synthetic')} : ({ state: 'succeeded' as const, data: { url: 'https://mock-upload.invalid/duplicate-' + count + '.jpg',
      key: 'duplicate-' + count + '.jpg', extension: 'jpg', source: 'library' as const, uploadState: 'uploaded' as const } }),
  })
  const ui = createAStageSpecialMockController({ kind, workOrderId: kind === 'forms' ? mockR1FormsWorkOrderId : mockR1RepeatWorkOrderId,
    storage: storage(), getActor: () => currentActor, mediaQueue: queue, mediaPicker: { pick: async () => createCapabilityResult('media_file_picker', 'granted', [{
      ref: asOpaqueId<'LocalMediaRef'>('synthetic-duplicate-' + ++count), source: 'library' as const, name: 'synthetic.jpg',
      mimeType: 'image/jpeg', localPath: '/synthetic/duplicate.jpg',
    }]) } })
  async function upload(fieldId = 'mock-file-follow-up', recordId?: string) {
    expect((await ui.pickMedia(mockSyntheticDynamicFormDefinitionId, fieldId, recordId)).state).toBe('succeeded')
    const task = (await ui.listMediaTasks(mockSyntheticDynamicFormDefinitionId, recordId)).filter(t => t.scope.fieldId === fieldId).at(-1)!
    return r1FileWireFromUpload(task.uploadedRef!)!
  }
  return { ui, queue, upload, setFailure: (fail:boolean)=>{failUpload=fail}, setActor:(next:AStageMockActor|null)=>{currentActor=next}, setDefinition: (next: typeof definition) => { definition = next } }
}

describe('duplicate file queue source identity through real Special Mock controller', () => {
  for (const kind of ['forms', 'repeat'] as const) for (const reverse of [false, true]) {
    it(`${kind} saves and rereads the uniquely visible file row (reverse ${reverse})`, async () => {
      const { ui, upload } = await setup(kind, reverse)
      const file = await upload()
      const saved = await ui.execute({ kind: 'save', fields: { ...fields('duplicate file'), inspectionFiles: [file] } })
      expect(saved.state).toBe('succeeded')
      const row = (await ui.load()).entries.find(r => r.summary === 'duplicate file')!
      expect(row.values.inspectionFiles).toEqual([file])
    })
  }
})


describe('duplicate file negative ownership and lifecycle boundaries', () => {
  for (const kind of ['forms', 'repeat'] as const) {
    it(`${kind} rejects hidden sibling uploads, then accepts only the new active row`, async () => {
      const { ui, upload } = await setup(kind)
      const hidden = await upload('mock-file-safe')
      expect((await ui.execute({kind:'save', fields:{...fields('wrong sibling'),inspectionFiles:[hidden]}})).state).toBe('blocked')
      expect(mockCommandState().formData.size).toBe(0)
      const active = await upload()
      expect((await ui.execute({kind:'save', fields:{...fields('active sibling'),inspectionFiles:[active]}})).state).toBe('succeeded')
    })
    it(`${kind} same-row edit keeps prior media; a condition switch cannot transfer it`, async () => {
      const { ui, upload } = await setup(kind)
      const file = await upload()
      expect((await ui.execute({kind:'save',fields:{...fields('original'),inspectionFiles:[file]}})).state).toBe('succeeded')
      const id = (await ui.load()).entries.find(r=>r.summary==='original')!.id
      await ui.finalizeMedia(mockSyntheticDynamicFormDefinitionId)
      expect((await ui.execute({kind:'edit',id,fields:{...fields('same row'),inspectionFiles:[file]}})).state).toBe('succeeded')
      expect((await ui.execute({kind:'edit',id,fields:{...fields('wrong row','safe'),inspectionFiles:[file]}})).state).toBe('blocked')
      const next = await upload('mock-file-safe', id)
      expect((await ui.execute({kind:'edit',id,fields:{...fields('new row','safe'),inspectionFiles:[next]}})).state).toBe('succeeded')
      expect((await ui.load()).entries.find(r=>r.id===id)!.values.inspectionFiles).toEqual([next])
    })
    it(`${kind} rejects forged media and a create task reused for a different record`, async () => {
      const { ui, upload } = await setup(kind)
      const file=await upload()
      expect((await ui.execute({kind:'save',fields:{...fields('forged'),inspectionFiles:[{...file,url:'https://synthetic.invalid/forged.jpg'}]}})).state).toBe('blocked')
      expect((await ui.execute({kind:'save',fields:{...fields('original'),inspectionFiles:[file]}})).state).toBe('succeeded')
      const id=(await ui.load()).entries.find(r=>r.summary==='original')!.id
      const unattached=await upload()
      expect((await ui.execute({kind:'edit',id,fields:{...fields('wrong record'),inspectionFiles:[unattached]}})).state).toBe('blocked')
    })
    for (const change of ['overlap','readonly','unknown-condition','provider'] as const) {
      it(`${kind} rejects ${change} without a command`, async () => {
        const { ui, upload, setDefinition }=await setup(kind)
        const file=await upload()
        const d=duplicateFileDefinition()
        const data=d.data.map(row=>row._id==='mock-file-follow-up'?{
          ...row,...(change==='overlap'?{frontEndConfig:{showField:'inspectionResult',showValue:['safe','follow_up']}}:{}),
          ...(change==='readonly'?{readOnly:true}:{}),
          ...(change==='unknown-condition'?{frontEndConfig:{showType:'99',showField:'inspectionResult',showValue:'follow_up'}}:{}),
          ...(change==='provider'?{type:'select',valueOption:'unknown-provider'}:{}),
        }:row)
        // For overlap make the hidden sibling visible as well.
        if(change==='overlap') data.forEach((row,i)=>{if(row._id==='mock-file-safe') data[i]={...row,frontEndConfig:{showField:'inspectionResult',showValue:'follow_up'}}})
        setDefinition({...d,data} as typeof d)
        expect((await ui.execute({kind:'save',fields:{...fields('invalid'),inspectionFiles:[file]}})).state).toBe('blocked')
        expect(mockCommandState().formData.size).toBe(0)
      })
    }
    for (const state of ['queued','failed_retryable','uploading'] as const) {
      it(`${kind} rejects ${state} queue state before save`, async () => {
        const { ui, queue, upload }=await setup(kind)
        const file=await upload(), list=queue.listForAction.bind(queue)
        vi.spyOn(queue,'listForAction').mockImplementation(async scope=>{
          const result=await list(scope)
          return result.state==='succeeded'?{...result,data:result.data!.map(t=>({...t,state}))}:result
        })
        expect((await ui.execute({kind:'save',fields:{...fields('incomplete'),inspectionFiles:[file]}})).state).toBe('blocked')
        expect(mockCommandState().formData.size).toBe(0)
      })
    }
  }
  for (const key of ['userId','workOrderId','workflowNodeId','formDefinitionId','formDataId','fieldId','valueKey'] as const) {
    it(`rejects uploaded task with conflicting ${key}`, async () => {
      const {ui,queue,upload}=await setup('forms');const file=await upload(),list=queue.listForAction.bind(queue)
      vi.spyOn(queue,'listForAction').mockImplementation(async scope=>{
        const result=await list(scope)
        return result.state==='succeeded'?{...result,data:result.data!.map(t=>({...t,scope:{...t.scope,[key]:'foreign'}}))}:result
      })
      expect((await ui.execute({kind:'save',fields:{...fields('foreign'),inspectionFiles:[file]}})).state).toBe('blocked')
      expect(mockCommandState().formData.size).toBe(0)
    })
  }
})

for(const kind of ['forms','repeat'] as const) {
  it(`${kind} clears an optional duplicate file through its active row only`,async()=>{
    const {ui,upload}=await setup(kind);const file=await upload()
    expect((await ui.execute({kind:'save',fields:{...fields('original'),inspectionFiles:[file]}})).state).toBe('succeeded')
    const id=(await ui.load()).entries.find(r=>r.summary==='original')!.id
    await ui.finalizeMedia(mockSyntheticDynamicFormDefinitionId)
    expect((await ui.execute({kind:'edit',id,fields:fields('cleared')})).state).toBe('succeeded')
    expect((await ui.load()).entries.find(r=>r.id===id)!.values.inspectionFiles).toBeUndefined()
  })
}

for(const kind of ['forms','repeat'] as const) {
  it(`${kind} keeps a hidden failed task blocking until explicit retry`,async()=>{
    const {ui,upload,setFailure}=await setup(kind);setFailure(true)
    expect((await ui.pickMedia(mockSyntheticDynamicFormDefinitionId,'mock-file-safe')).state).toBe('failed')
    const hidden=(await ui.listMediaTasks(mockSyntheticDynamicFormDefinitionId))[0]!
    setFailure(false);const file=await upload()
    expect((await ui.execute({kind:'save',fields:{...fields('blocked pending'),inspectionFiles:[file]}})).state).toBe('blocked')
    expect(mockCommandState().formData.size).toBe(0)
    expect(await ui.retryMedia(mockSyntheticDynamicFormDefinitionId,hidden.taskId)).toBe(true)
    expect((await ui.execute({kind:'save',fields:{...fields('recovered'),inspectionFiles:[file]}})).state).toBe('succeeded')
  })
  it(`${kind} does not treat a hidden file as the visible text field`,async()=>{
    const {ui,setDefinition}=await setup(kind);const d=duplicateFileDefinition()
    setDefinition({...d,data:d.data.map(row=>row._id==='mock-file-follow-up'?{...row,type:'text'}:row)} as typeof d)
    expect((await ui.execute({kind:'save',fields:{...fields('visible text'),inspectionFiles:'text only'}})).state).toBe('succeeded')
    expect((await ui.load()).entries.find(r=>r.summary==='visible text')!.values.inspectionFiles).toBe('text only')
  })
  for(const change of ['readonly','unknown','overlap'] as const) it(`${kind} does not clear prior media when ${change}`,async()=>{
    const {ui,upload,setDefinition}=await setup(kind);const file=await upload()
    expect((await ui.execute({kind:'save',fields:{...fields('original'),inspectionFiles:[file]}})).state).toBe('succeeded')
    const id=(await ui.load()).entries.find(r=>r.summary==='original')!.id
    await ui.finalizeMedia(mockSyntheticDynamicFormDefinitionId)
    const d=duplicateFileDefinition()
    setDefinition({...d,data:d.data.map(row=>{
      if(change==='readonly'&&row._id==='mock-file-follow-up') return {...row,readOnly:true}
      if(change==='unknown'&&row._id==='mock-file-safe') return {...row,frontEndConfig:{showType:'99',showField:'inspectionResult',showValue:'safe'}}
      if(change==='overlap'&&row._id==='mock-file-safe') return {...row,frontEndConfig:{showField:'inspectionResult',showValue:'follow_up'}}
      return row
    })} as typeof d)
    expect((await ui.execute({kind:'edit',id,fields:fields('must retain')})).state).toBe('blocked')
    expect((await ui.load()).entries.find(r=>r.id===id)!.values.inspectionFiles).toEqual([file])
  })
  it(`${kind} cancels authorization after account change`,async()=>{
    const {ui,upload,setActor}=await setup(kind);const file=await upload();setActor(null)
    const outcome=await ui.execute({kind:'save',fields:{...fields('stale actor'),inspectionFiles:[file]}})
    expect(outcome.state).not.toBe('succeeded');expect(mockCommandState().formData.size).toBe(0)
  })
}

it('does not authorize media using mixed old and new exact-read snapshots',async()=>{
  const {ui,upload}=await setup('forms');const a=await upload()
  expect((await ui.execute({kind:'save',fields:{...fields('old'),inspectionFiles:[a]}})).state).toBe('succeeded')
  const selected=(await ui.load()).entries.find(r=>r.summary==='old')!,id=selected.id
  await ui.finalizeMedia(mockSyntheticDynamicFormDefinitionId)
  const before=structuredClone(mockCommandState().formData.get(id)!) as Record<string,any>
  let exact=0
  const read=mockReads.tryMockRead
  vi.spyOn(mockReads,'tryMockRead').mockImplementation(async(path,data,options)=>{
    if(path===`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`&&data?.['is:_id|string#and']===id&&++exact===2) {
      const current=mockCommandState().formData.get(id)! as Record<string,any>
      mockCommandState().formData.set(id,{...current,inspectionResult:'safe',inspectionFiles:[{...a,url:'https://synthetic.invalid/new.jpg',name:'new.jpg'}],
        exts:{...current.exts,inspectionResult:'safe',inspectionFiles:[{...a,url:'https://synthetic.invalid/new.jpg',name:'new.jpg'}]}})
    }
    return read(path,data,options)
  })
  const outcome=await ui.execute({kind:'edit',id,expectedRevision:selected.revision!,fields:{...fields('must reject','safe'),inspectionFiles:[a]}})
  expect(outcome.state).toBe('blocked')
  expect(exact).toBe(2)
  expect((mockCommandState().formData.get(id)! as Record<string,any>).exts.inspectionSummary).toBe(before.exts.inspectionSummary)
})
