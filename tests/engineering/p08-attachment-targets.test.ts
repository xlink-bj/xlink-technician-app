import { createAttachmentLabels, attachmentTaskStatus, safeAttachmentName } from '@features/work-orders/attachment-presentation'
import { describe, expect, it, vi } from 'vitest'
import { createR1NormalFormFileSession } from '@app/r1-normal-form-media'
import type { MediaUploadQueuePort, StoragePort, UploadPort } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { createMediaQueueRepository, createMediaUploadQueue, InMemoryDurableMediaStore } from '@runtimes/media'
import { asOpaqueId, createCapabilityResult, createOperationError, type LocalMedia, type MediaUploadTask, type MediaUploadTaskId, type UploadedMediaRef } from '@shared/types'

const scope = { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }
const lookup = { userId: 'u' as never, workOrderId: 's' as never, workflowNodeId: 'n' as never, formDefinitionId: 'e' as never }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function setup() {
  const memory = new Map<string, unknown>()
  const storage: StoragePort = {
    read: async <T>(key: { key: string }) => ({ state: 'succeeded', data: structuredClone(memory.get(key.key) ?? null) as T | null }),
    write: async (key, value) => { memory.set(key.key, structuredClone(value)); return { state: 'succeeded' } },
    remove: async key => { memory.delete(key.key); return { state: 'succeeded' } },
    listKeys: async query => ({ state: 'succeeded', data: [...memory.keys()].filter(key => !query.prefix || key.startsWith(query.prefix)) }),
  }
  const fields: any[] = [
    { fieldId: 'mode', valueKey: 'mode', label: 'Mode', type: 'text', required: false, readOnly: false, preset: false },
    { fieldId: 'files', valueKey: 'files', label: 'Files', type: 'file', required: false, readOnly: false, preset: false },
    { fieldId: 'other', valueKey: 'otherFiles', label: 'Other', type: 'file', required: false, readOnly: false, preset: false },
  ]
  let snapshot = { workOrderId: 's', node: { id: 'n', runId: 'w', formDefinitionId: 'e', sourceNodeType: 'forms', formFieldIdsReadOnly: [] },
    definition: { id: 'e', fields }, fillableFieldIds: ['mode', 'files', 'other'], records: [] } as unknown as R1NodeFormsSnapshot
  let authorized = true, sequence = 0
  const media = (): LocalMedia => ({ ref: asOpaqueId<'LocalMediaRef'>(`local-${++sequence}`), source: 'file', mimeType: 'image/png', localPath: `/synthetic/${sequence}.png`, name: `${sequence}.png`, size: 100 })
  const upload = vi.fn<UploadPort['upload']>(async file => ({ state: 'succeeded', data: { url: `https://upload.invalid/${file.ref}.png`, key: `${file.ref}.png`, extension: 'png', mimeType: file.mimeType, source: file.source, uploadState: 'uploaded' } }))
  const store = new InMemoryDurableMediaStore(), repository = createMediaQueueRepository(storage)
  const queue = createMediaUploadQueue(store, repository, { upload })
  const picker = { pick: vi.fn(async () => createCapabilityResult('media_file_picker', 'granted', [media()])) }
  const create = () => createR1NormalFormFileSession({ scope, queue, picker, getSnapshot: () => snapshot, isAuthorized: () => authorized })
  const session = create()
  const tasks = async () => (await queue.listForAction(lookup)).data!
  const tamper = async (change: (task: MediaUploadTask) => MediaUploadTask) => {
    const task = (await tasks())[0]!
    expect((await repository.write(change(task))).state).toBe('succeeded')
  }
  return { session, create, queue, picker, upload, media, store, repository, tasks, fields, tamper,
    snapshot: () => snapshot, setSnapshot: (value: R1NodeFormsSnapshot) => { snapshot = value }, revoke: () => { authorized = false }, restore: () => { authorized = true } }
}


describe('P08 exact attachment targets and presentation', () => {
  it('shows owned names without local paths, scopes failures, retries exactly one task', async () => {
    const h=setup()
    const good=await h.session.pick('other',{})
    expect(good).toHaveLength(1)
    h.upload.mockResolvedValueOnce({state:'failed_retryable',error:createOperationError('network_retryable','known failure')})
    await h.session.pick('files',{otherFiles:good})
    const bad=h.session.items!('files')[0]!
    expect(bad.media.name).toBe('2.png');expect(bad.media).not.toHaveProperty('localPath')
    expect(h.session.message('other')).toBe('');expect(h.session.message('files')).toContain('尚未上传完成')
    const retry=vi.spyOn(h.queue,'retry')
    expect(await h.session.retry('files',{otherFiles:good},'foreign' as never)).toBeNull()
    expect(retry).not.toHaveBeenCalled()
    const files=await h.session.retry('files',{otherFiles:good},bad.task.taskId)
    expect(files).toHaveLength(1);expect(retry).toHaveBeenCalledTimes(1);expect(retry).toHaveBeenCalledWith(bad.task.taskId)
    expect(h.upload).toHaveBeenCalledTimes(3)
    expect(h.session.values('other')).toEqual(good)
    expect(await h.session.retry('files',{otherFiles:good,files},bad.task.taskId)).toBeNull()
    expect(h.upload).toHaveBeenCalledTimes(3)
  })
  it('discard targets only the requested failure and leaves the successful sibling',async()=>{
    const h=setup(),good=await h.session.pick('files',{})
    h.upload.mockResolvedValueOnce({state:'failed_retryable',error:createOperationError('network_retryable','failure')})
    await h.session.pick('files',{files:good})
    const bad=h.session.items!('files').find(x=>x.task.state==='failed_retryable')!
    const discard=vi.spyOn(h.queue,'discard')
    expect(await h.session.discardFailed('other',{},bad.task.taskId)).toBeNull()
    expect(discard).not.toHaveBeenCalled()
    expect(await h.session.discardFailed('files',{files:good},bad.task.taskId)).toEqual(good)
    expect(discard).toHaveBeenCalledTimes(1);expect(discard).toHaveBeenCalledWith(bad.task.taskId)
    expect(await h.tasks()).toHaveLength(1)
  })
  it('unknown result retains the exact target and cannot retry or discard',async()=>{
    const h=setup();h.upload.mockResolvedValueOnce({state:'failed_retryable',error:createOperationError('network_retryable','lost ack',{code:'ambiguous_upload'})})
    await h.session.pick('files',{})
    const bad=h.session.items!('files')[0]!,retry=vi.spyOn(h.queue,'retry'),discard=vi.spyOn(h.queue,'discard')
    expect(attachmentTaskStatus(bad.task,bad.ambiguous)).toContain('待核对')
    await h.session.retry('files',{},bad.task.taskId);await h.session.discardFailed('files',{},bad.task.taskId)
    expect(retry).not.toHaveBeenCalled();expect(discard).not.toHaveBeenCalled();expect(await h.tasks()).toHaveLength(1)
    h.revoke();expect(h.session.items!('files')).toEqual([])
  })
  it('keeps ordinals when siblings disappear, and never prints paths or IDs',async()=>{
    const h=setup();await h.session.pick('files',{});await h.session.pick('other',{})
    const a=(await h.tasks())[0]!,b={...a,taskId:'second-internal-id' as never},labels=createAttachmentLabels()
    labels.register([a,b]);expect(labels.label(b)).toBe('本次附件 2')
    const retained=createAttachmentLabels()
    expect(retained.retainedLabel('https://private.invalid/a','/private/a.png')).toBe('原有附件 1')
    expect(retained.retainedLabel('https://private.invalid/b','/private/b.png')).toBe('原有附件 2')
    retained.register([a]);expect(retained.label(a)).toBe('本次附件 1')
    // Removing the first retained reference never renumbers the second or the pending task.
    expect(retained.retainedLabel('https://private.invalid/b','/private/b.png')).toBe('原有附件 2')
    expect(retained.label(a)).toBe('本次附件 1')
    expect(retained.retainedLabel('https://private.invalid/c')).toBe('原有附件 3')
    labels.register([b]);expect(labels.label(b)).toBe('本次附件 2')
    expect(labels.label(b,{name:'/Users/private/photo.png',mimeType:'image/png'})).toBe('本次附件 2 · 图片')
    expect(labels.label(b,{name:'屋面落水口.png',mimeType:'image/png'})).toBe('本次附件 2 · 屋面落水口.png')
    for(const name of ['C:\\private\\photo.png','https://host/private.png','a\u202eb.png'])expect(safeAttachmentName(name)).toBeUndefined()
    expect(attachmentTaskStatus({...b,state:'queued'})).toBe('等待上传')
  })
})
