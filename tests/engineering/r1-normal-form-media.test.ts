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

describe('normal forms create file session with the real durable queue', () => {
  it('inspects old foreign-session tasks without importing or deleting them and blocks the UI hints', async () => {
    const h = setup(); await h.session.pick('files', {})
    const fresh = h.create(), discard = vi.spyOn(h.queue, 'discard')
    expect(await fresh.inspect()).toBe(false)
    expect(fresh.ready({})).toBe(false); expect(fresh.canPick('files', {})).toBe(false)
    expect(fresh.message()).toContain('其他编辑会话'); expect(discard).not.toHaveBeenCalled()
    expect(await h.tasks()).toHaveLength(1); expect(fresh.values('files')).toEqual([])
    expect(await fresh.cancel()).toBe(false); expect(discard).not.toHaveBeenCalled()
  })
  it('inspects an empty queue without side effects', async () => {
    const h = setup(), enqueue = vi.spyOn(h.queue, 'enqueue'), discard = vi.spyOn(h.queue, 'discard')
    expect(await h.session.inspect()).toBe(true); expect(h.session.ready({})).toBe(true)
    expect(enqueue).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled()
  })
  it.each(['application/pdf', 'image/svg+xml', 'image/gif', 'application/octet-stream'])('rejects non-image %s before enqueue', async mimeType => {
    const h = setup(), enqueue = vi.spyOn(h.queue, 'enqueue'), extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/svg+xml' ? 'svg' : mimeType === 'image/gif' ? 'gif' : 'bin'
    h.picker.pick.mockResolvedValueOnce(createCapabilityResult('media_file_picker', 'granted', [{ ...h.media(), mimeType, name: `not-image.${extension}` }]))
    expect(await h.session.pick('files', {})).toBeNull(); expect(enqueue).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled()
  })
  it('rejects a selected image whose available filename conflicts with its MIME', async () => {
    const h = setup(), enqueue = vi.spyOn(h.queue, 'enqueue')
    h.picker.pick.mockResolvedValueOnce(createCapabilityResult('media_file_picker', 'granted', [{ ...h.media(), mimeType: 'image/png', name: 'not-png.jpg' }]))
    expect(await h.session.pick('files', {})).toBeNull(); expect(enqueue).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled()
  })
  it.each(['https://user@upload.invalid/file.png', 'https:///upload.invalid/file.png', 'https://upload.invalid:bad/file.png', 'https://upload.invalid/file.png?sig=bad\u200b'])('rejects a real malformed upload receipt URL before queue output becomes a draft: %s', async url => {
    const h = setup()
    h.upload.mockImplementationOnce(async media => ({ state: 'succeeded', data: { url, key: media.name, extension: media.name!.split('.').pop()!,
      mimeType: media.mimeType, source: media.source, uploadState: 'uploaded' } }))
    expect(await h.session.pick('files', {})).toBeNull(); expect(h.upload).toHaveBeenCalledTimes(1)
    expect((await h.tasks())[0]!.state).toBe('uploaded')
    expect(h.session.values('files')).toEqual([]); expect(h.session.ready({})).toBe(false)
    await expect(h.session.assertValues(h.snapshot(), {})).rejects.toThrow()
  })
  it('cancels completed owned uploads locally and resets the same session for a new selection', async () => {
    const h = setup(), files = await h.session.pick('files', {}), discard = vi.spyOn(h.queue, 'discard')
    expect(files).toHaveLength(1); expect(await h.session.cancel()).toBe(true)
    expect(discard).toHaveBeenCalledTimes(1); expect(await h.tasks()).toEqual([]); expect(h.session.ready({})).toBe(true)
    expect((await h.store.exists('local-1' as never)).data).toBe(false)
    expect(h.session.values('files')).toEqual([]); expect(await h.session.pick('files', {})).toHaveLength(1)
    expect(h.upload).toHaveBeenCalledTimes(2)
  })
  it('invalidates a pending picker immediately and safely resets once its callback settles', async () => {
    const h = setup(), pending = deferred<Awaited<ReturnType<typeof h.picker.pick>>>()
    h.picker.pick.mockImplementationOnce(() => pending.promise)
    const picking = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.picker.pick).toHaveBeenCalledTimes(1))
    const cancelling = h.session.cancel()
    expect(h.session.ready({})).toBe(false); expect(h.session.canPick('files', {})).toBe(false)
    pending.resolve(createCapabilityResult('media_file_picker', 'granted', [h.media()]))
    expect(await picking).toBeNull(); expect(await cancelling).toBe(true); expect(h.upload).not.toHaveBeenCalled()
    expect(await h.session.pick('files', {})).toHaveLength(1)
  })
  it('captures a successful pending enqueue before cancellation and never dispatches it', async () => {
    const h = setup(), enqueue = h.queue.enqueue.bind(h.queue), entered = deferred<void>(), release = deferred<void>()
    vi.spyOn(h.queue, 'enqueue').mockImplementationOnce(async input => { const result = await enqueue(input); entered.resolve(); await release.promise; return result })
    const picking = h.session.pick('files', {}); await entered.promise
    const cancelling = h.session.cancel(); release.resolve()
    expect(await picking).toBeNull(); expect(await cancelling).toBe(true)
    expect(await h.tasks()).toEqual([]); expect(h.upload).not.toHaveBeenCalled(); expect(h.session.canPick('files', {})).toBe(true)
  })
  it('waits for a pending successful upload and uses the late result only for local cleanup', async () => {
    const h = setup(), pending = deferred<Awaited<ReturnType<UploadPort['upload']>>>()
    h.upload.mockImplementationOnce(() => pending.promise)
    const picking = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1))
    const cancelling = h.session.cancel()
    pending.resolve({ state: 'succeeded', data: { url: 'https://upload.invalid/cancel.png?signature=unchanged%2Bvalue', key: 'cancel.png', extension: 'png', mimeType: 'image/png', source: 'file', uploadState: 'uploaded' } })
    expect(await picking).toBeNull(); expect(await cancelling).toBe(true)
    expect(await h.tasks()).toEqual([]); expect(h.session.values('files')).toEqual([]); expect(h.upload).toHaveBeenCalledTimes(1)
    expect(h.session.ready({})).toBe(true)
  })
  it('cancels a pending known failure without replaying the upload', async () => {
    const h = setup(), pending = deferred<Awaited<ReturnType<UploadPort['upload']>>>()
    h.upload.mockImplementationOnce(() => pending.promise)
    const picking = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1))
    const cancelling = h.session.cancel()
    pending.resolve({ state: 'failed_retryable', error: createOperationError('network_retryable', 'known failed upload') })
    expect(await picking).toBeNull(); expect(await cancelling).toBe(true)
    expect(await h.tasks()).toEqual([]); expect(h.upload).toHaveBeenCalledTimes(1); expect(h.session.canPick('files', {})).toBe(true)
  })
  it('retains ambiguous upload outcomes on cancellation and never pretends to reset', async () => {
    const h = setup(); h.upload.mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'unknown ACK', { code: 'ambiguous_upload' }) })
    expect(await h.session.pick('files', {})).toBeNull()
    const discard = vi.spyOn(h.queue, 'discard')
    expect(await h.session.cancel()).toBe(false); expect(discard).not.toHaveBeenCalled()
    expect(await h.tasks()).toHaveLength(1); expect(h.session.ready({})).toBe(false); expect(h.session.canPick('files', {})).toBe(false)
    expect(h.session.message()).toMatch(/核对|恢复/)
  })
  it('keeps the draft blocked when local cancellation cleanup fails', async () => {
    const h = setup(); await h.session.pick('files', {})
    vi.spyOn(h.queue, 'discard').mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'local cleanup failed') })
    expect(await h.session.cancel()).toBe(false); expect(await h.tasks()).toHaveLength(1)
    expect(h.session.ready({})).toBe(false); expect(h.session.canPick('files', {})).toBe(false)
    expect(h.session.message()).toMatch(/清理|恢复/)
    expect(await h.session.cancel()).toBe(true); expect(h.session.ready({})).toBe(true)
  })
  it.each(['role loss', 'page dispose'])('does not clean old tasks after %s during a pending cancel', async stop => {
    const h = setup(), pending = deferred<Awaited<ReturnType<UploadPort['upload']>>>()
    h.upload.mockImplementationOnce(() => pending.promise)
    const picking = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1))
    const cancelling = h.session.cancel(), discard = vi.spyOn(h.queue, 'discard')
    if (stop === 'role loss') h.revoke(); else h.session.dispose()
    pending.resolve({ state: 'succeeded', data: { url: 'https://upload.invalid/old-role.png', key: 'old-role.png', extension: 'png', mimeType: 'image/png', source: 'file', uploadState: 'uploaded' } })
    expect(await picking).toBeNull(); expect(await cancelling).toBe(false); expect(discard).not.toHaveBeenCalled()
    h.restore(); expect(h.session.canPick('files', {})).toBe(false); expect(await h.tasks()).toHaveLength(1)
  })
  it('picks, uploads and proves exact R1 objects without exposing mutable receipts', async () => {
    const h = setup(), files = await h.session.pick('files', {})
    expect(files).toEqual([{ url: 'https://upload.invalid/local-1.png', name: 'local-1.png', extname: 'png' }])
    expect(Object.isFrozen(files)).toBe(true); expect(Object.isFrozen(files![0])).toBe(true)
    await expect(h.session.assertValues(h.snapshot(), { files })).resolves.toBeUndefined()
    expect(h.upload).toHaveBeenCalledTimes(1)
    expect((await h.tasks())[0]!.scope).toMatchObject({ ...lookup, fieldId: 'files', valueKey: 'files', localAssetId: 'local-1' })
    expect((await h.tasks())[0]!.scope.formDataId).toBeUndefined()
  })
  it('preserves a valid signed image URL byte-for-byte through upload, queue and draft proof', async () => {
    const h = setup(), url = 'https://upload.invalid/signed.png?token=ABC%2Bdef%3D&expires=123#keep'
    h.upload.mockImplementationOnce(async media => ({ state: 'succeeded', data: { url, key: 'signed.png', extension: 'png', mimeType: media.mimeType, source: media.source, uploadState: 'uploaded' } }))
    const files = await h.session.pick('files', {})
    expect(files![0]!.url).toBe(url); expect((await h.tasks())[0]!.uploadedRef!.url).toBe(url)
    await expect(h.session.assertValues(h.snapshot(), { files })).resolves.toBeUndefined()
  })
  it('treats picker cancellation as an empty successful selection without enqueuing', async () => {
    const h = setup(); h.picker.pick.mockResolvedValueOnce(createCapabilityResult('media_file_picker', 'cancelled'))
    expect(await h.session.pick('files', {})).toEqual([]); expect(h.upload).not.toHaveBeenCalled(); expect(await h.tasks()).toEqual([])
    expect(h.session.message()).toBe(''); expect(h.session.busy()).toBe(false)
  })
  it('reports cached readiness for optional empties, pending work, failed work and explicit retry', async () => {
    const h = setup(), pending = deferred<Awaited<ReturnType<UploadPort['upload']>>>()
    expect(h.session.ready({})).toBe(true)
    h.upload.mockImplementationOnce(() => pending.promise)
    const picking = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1))
    expect(h.session.ready({})).toBe(false)
    pending.resolve({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic known failure') })
    expect(await picking).toBeNull(); expect(h.session.ready({})).toBe(false)
    const files = await h.session.retry('files', {})
    expect(h.session.ready({ files })).toBe(true); expect(h.session.ready({})).toBe(false)
    expect(h.session.ready({ files: [{ ...files![0], name: 'forged' }] })).toBe(false)
    h.session.dispose(); expect(h.session.ready({ files })).toBe(false)
  })
  it('uses readiness only as a hint and still rejects failed fresh queue reads', async () => {
    const h = setup(), files = await h.session.pick('files', {})
    expect(h.session.ready({ files })).toBe(true)
    vi.spyOn(h.queue, 'listForAction').mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic unavailable queue') })
    await expect(h.session.assertValues(h.snapshot(), { files })).rejects.toThrow()
  })
  it('locks duplicate clicks while the picker is pending', async () => {
    const h = setup(), pending = deferred<Awaited<ReturnType<typeof h.picker.pick>>>()
    h.picker.pick.mockImplementationOnce(() => pending.promise)
    const first = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.picker.pick).toHaveBeenCalledTimes(1))
    expect(h.session.busy()).toBe(true)
    expect(await h.session.pick('files', {})).toBeNull()
    await expect(h.session.assertValues(h.snapshot(), {})).rejects.toThrow()
    pending.resolve(createCapabilityResult('media_file_picker', 'granted', [h.media()]))
    expect(await first).toHaveLength(1); expect(h.upload).toHaveBeenCalledTimes(1)
  })
  it('does not enqueue a late picker result after authorization loss or dispose', async () => {
    for (const stop of ['revoke', 'dispose'] as const) {
      const h = setup(), pending = deferred<Awaited<ReturnType<typeof h.picker.pick>>>()
      h.picker.pick.mockImplementationOnce(() => pending.promise)
      const first = h.session.pick('files', {})
      await vi.waitFor(() => expect(h.picker.pick).toHaveBeenCalledTimes(1))
      if (stop === 'revoke') h.revoke(); else h.session.dispose()
      pending.resolve(createCapabilityResult('media_file_picker', 'granted', [h.media()]))
      expect(await first).toBeNull(); expect(h.upload).not.toHaveBeenCalled(); expect(await h.tasks()).toEqual([])
      h.restore(); expect(h.session.canPick('files', {})).toBe(false)
    }
  })
  it('returns no uploaded values from a late upload callback after role/source loss', async () => {
    const h = setup(), pending = deferred<Awaited<ReturnType<UploadPort['upload']>>>()
    h.upload.mockImplementationOnce(() => pending.promise)
    const first = h.session.pick('files', {})
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1))
    h.revoke(); pending.resolve({ state: 'succeeded', data: { url: 'https://upload.invalid/late.png', key: 'late.png', extension: 'png', mimeType: 'image/png', source: 'file', uploadState: 'uploaded' } })
    expect(await first).toBeNull(); expect(h.session.values('files')).toEqual([])
    await expect(h.session.assertValues(h.snapshot(), {})).rejects.toThrow()
  })
  it.each(['repeat', 'records', 'definition', 'run', 'metadata'] as const)('closes on current %s scope drift', async change => {
    const h = setup(), next = structuredClone(h.snapshot()) as any
    if (change === 'repeat') next.node.sourceNodeType = 'repeat'
    if (change === 'records') next.records = [{ id: 'existing' }]
    if (change === 'definition') next.definition.id = 'foreign'
    if (change === 'run') next.node.runId = 'foreign'
    if (change === 'metadata') next.definition.fields[1].readOnly = true
    h.setSnapshot(next)
    expect(await h.session.pick('files', {})).toBeNull(); expect(h.upload).not.toHaveBeenCalled()
  })
  it.each([0, 1])('retains exact frontend max=%i instead of defaulting zero to ten', async max => {
    const h = setup(); h.fields[1].presentation = { max }
    // Build a fresh controller after source metadata is established.
    const session = h.create()
    expect(session.canPick('files', {})).toBe(max > 0)
    const files = await session.pick('files', {})
    if (max === 0) expect(files).toBeNull()
    else { expect(files).toHaveLength(1); expect(session.canPick('files', { files })).toBe(false) }
    expect(h.upload).toHaveBeenCalledTimes(max)
  })
  it('rejects an oversized picker batch before enqueueing any file', async () => {
    const h = setup(); h.fields[1].presentation = { max: 1 }; const session = h.create()
    h.picker.pick.mockResolvedValueOnce(createCapabilityResult('media_file_picker', 'granted', [h.media(), h.media()]))
    expect(await session.pick('files', {})).toBeNull(); expect(await h.tasks()).toEqual([]); expect(h.upload).not.toHaveBeenCalled()
  })
  it('blocks hidden fields and rechecks conditions after the picker returns', async () => {
    const h = setup(); h.fields[1].visibility = { kind: 'equals', path: 'mode', value: 'show' }; const session = h.create()
    expect(await session.pick('files', { mode: 'hide' })).toBeNull()
    const values = { mode: 'show' }, pending = deferred<Awaited<ReturnType<typeof h.picker.pick>>>()
    h.picker.pick.mockImplementationOnce(() => pending.promise)
    const picking = session.pick('files', values)
    await vi.waitFor(() => expect(h.picker.pick).toHaveBeenCalledTimes(1))
    values.mode = 'hide'; pending.resolve(createCapabilityResult('media_file_picker', 'granted', [h.media()]))
    expect(await picking).toBeNull(); expect(h.upload).not.toHaveBeenCalled()
  })
  it('never imports existing tasks after refresh or into a second role session', async () => {
    const h = setup(), files = await h.session.pick('files', {})
    const refreshed = h.create()
    expect(refreshed.values('files')).toEqual([])
    await expect(refreshed.assertValues(h.snapshot(), { files })).rejects.toThrow()
    expect(await refreshed.pick('files', {})).toBeNull(); expect(h.upload).toHaveBeenCalledTimes(1)
    expect(h.session.values('files')).toEqual(files)
  })
  it('refuses forged URLs, wire names, fields, omissions and value order', async () => {
    const h = setup(), files = (await h.session.pick('files', {}))!
    const invalid = [
      { files: [{ ...files[0], url: 'https://upload.invalid/forged.png' }] },
      { files: [{ ...files[0], name: 'forged.png' }] },
      { otherFiles: files }, {}, { files: [{ ...files[0], objectKey: 'extra' }] }, { unknown: files },
    ]
    for (const values of invalid) await expect(h.session.assertValues(h.snapshot(), values)).rejects.toThrow()
    const both = (await h.session.pick('files', { files }))!
    await expect(h.session.assertValues(h.snapshot(), { files: [...both].reverse() })).rejects.toThrow()
    await expect(h.session.assertValues(h.snapshot(), { files: both })).resolves.toBeUndefined()
  })
  it('pins a completed receipt instead of silently accepting changed storage URLs', async () => {
    const h = setup(), files = await h.session.pick('files', {})
    await h.tamper(task => ({ ...task, uploadedRef: { ...task.uploadedRef!, url: 'https://upload.invalid/substituted.png' } }))
    await expect(h.session.assertValues(h.snapshot(), { files })).rejects.toThrow()
    expect(h.upload).toHaveBeenCalledTimes(1)
  })
  it('does not promote a failed task into owned upload proof from a storage-only receipt', async () => {
    const h = setup(); h.upload.mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic known failure') })
    expect(await h.session.pick('files', {})).toBeNull()
    const uploaded: UploadedMediaRef = { url: 'https://upload.invalid/storage-only.png', key: 'storage-only.png', extension: 'png', mimeType: 'image/png', source: 'file', uploadState: 'uploaded' }
    await h.tamper(task => ({ ...task, state: 'uploaded', lastError: undefined, uploadedRef: uploaded }))
    const files = [{ url: uploaded.url, name: uploaded.key!, extname: 'png' }]
    await expect(h.session.assertValues(h.snapshot(), { files })).rejects.toThrow()
    expect(h.session.values('files')).toEqual([]); expect(h.upload).toHaveBeenCalledTimes(1)
  })
  it('rejects queue ownership changes even if URL and field label still match', async () => {
    const h = setup(), files = await h.session.pick('files', {}), list = h.queue.listForAction.bind(h.queue)
    vi.spyOn(h.queue, 'listForAction').mockImplementation(async selected => {
      const result = await list(selected)
      return { ...result, data: result.data?.map(task => ({ ...task, taskId: 'opaque-task' as MediaUploadTaskId, scope: { ...task.scope, fieldId: 'other', valueKey: 'otherFiles' } })) }
    })
    await expect(h.session.assertValues(h.snapshot(), { files })).rejects.toThrow()
  })
  it('uses explicit retry for known failure; failed tasks block save until retry or removal', async () => {
    const h = setup()
    h.upload.mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic known no-success') })
    expect(await h.session.pick('files', {})).toBeNull(); expect(h.upload).toHaveBeenCalledTimes(1)
    await expect(h.session.assertValues(h.snapshot(), {})).rejects.toThrow()
    const files = await h.session.retry('files', {})
    expect(files).toHaveLength(1); expect(h.upload).toHaveBeenCalledTimes(2)
    await expect(h.session.assertValues(h.snapshot(), { files })).resolves.toBeUndefined()
  })
  it.each(['ambiguous_upload', 'ambiguous_postprocess'])('does not retry an ambiguous %s result', async code => {
    const h = setup(); h.upload.mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic unknown ACK', { code }) })
    expect(await h.session.pick('files', {})).toBeNull()
    expect(await h.session.retry('files', {})).toBeNull(); expect(h.upload).toHaveBeenCalledTimes(1)
    // Unknown remote outcomes are retained, including during explicit cancel.
    expect(await h.session.discardFailed('files', {})).toBeNull(); expect(await h.tasks()).toHaveLength(1)
    expect(h.session.ready({})).toBe(false)
  })
  it('does not replay a thrown process outcome even if storage later says retryable', async () => {
    const h = setup(); vi.spyOn(h.queue, 'process').mockRejectedValueOnce(Error('synthetic interrupted result'))
    expect(await h.session.pick('files', {})).toBeNull()
    await h.tamper(task => ({ ...task, state: 'failed_retryable', lastError: createOperationError('network_retryable', 'synthetic later failure') }))
    expect(await h.session.retry('files', {})).toBeNull(); expect(h.upload).not.toHaveBeenCalled()
    expect(await h.session.discardFailed('files', {})).toBeNull(); expect(await h.tasks()).toHaveLength(1)
  })
  it('explicitly removes only the exact uploaded file and does not delete remotely', async () => {
    const h = setup(), first = await h.session.pick('files', {}), other = await h.session.pick('other', {})
    const files = await h.session.remove('files', 0, { files: first, otherFiles: other })
    expect(files).toEqual([]); expect(h.session.values('other')).toEqual(other)
    expect((await h.tasks()).map(task => task.scope.fieldId)).toEqual(['other'])
    expect(h.upload).toHaveBeenCalledTimes(2)
  })
  it('discards failed local tasks explicitly without accepting foreign queue tasks', async () => {
    const h = setup(); h.upload.mockResolvedValueOnce({ state: 'failed_terminal', error: createOperationError('server_terminal', 'synthetic bad file') })
    expect(await h.session.pick('files', {})).toBeNull()
    expect(await h.session.discardFailed('files', {})).toEqual([])
    await expect(h.session.assertValues(h.snapshot(), {})).resolves.toBeUndefined()
    expect(h.upload).toHaveBeenCalledTimes(1)
  })
  it('requires matching current snapshot object and an independent queue reread', async () => {
    const h = setup(), files = await h.session.pick('files', {})
    await expect(h.session.assertValues(structuredClone(h.snapshot()), { files })).rejects.toThrow()
    const list = vi.spyOn(h.queue, 'listForAction')
    await h.session.assertValues(h.snapshot(), { files }); expect(list).toHaveBeenCalledTimes(1)
  })
  it('rejects changed submission bytes while the independent queue read is pending', async () => {
    const h = setup(), files = (await h.session.pick('files', {}))!, pending = deferred<Awaited<ReturnType<MediaUploadQueuePort['listForAction']>>>()
    const tasks = await h.tasks(), values = { files: [{ ...files[0]!, url: 'https://upload.invalid/forged-before-await.png' }] }
    vi.spyOn(h.queue, 'listForAction').mockImplementationOnce(() => pending.promise)
    const assertion = h.session.assertValues(h.snapshot(), values)
    values.files = files.map(file => ({ ...file }))
    pending.resolve({ state: 'succeeded', data: tasks })
    await expect(assertion).rejects.toThrow()
  })
  it('does not process an enqueued task after authorization is revoked during enqueue', async () => {
    const h = setup(), enqueue = h.queue.enqueue.bind(h.queue)
    vi.spyOn(h.queue, 'enqueue').mockImplementationOnce(async input => { const result = await enqueue(input); h.revoke(); return result })
    expect(await h.session.pick('files', {})).toBeNull(); expect(h.upload).not.toHaveBeenCalled()
    expect((await h.tasks())[0]!.state).toBe('queued'); expect(h.session.values('files')).toEqual([])
  })
  it.each(['userId', 'workOrderId', 'workflowNodeId', 'formDefinitionId', 'fieldId', 'valueKey', 'formDataId'] as const)('rejects an enqueue result belonging to a different %s', async key => {
    const h = setup(), enqueue = h.queue.enqueue.bind(h.queue)
    vi.spyOn(h.queue, 'enqueue').mockImplementationOnce(async input => {
      const result = await enqueue(input)
      return { ...result, data: { ...result.data!, taskId: 'opaque-foreign-task' as MediaUploadTaskId, scope: { ...result.data!.scope, [key]: 'foreign' } } }
    })
    expect(await h.session.pick('files', {})).toBeNull(); expect(h.upload).not.toHaveBeenCalled()
    expect(h.session.canPick('files', {})).toBe(false)
  })
  it('finalizes uploaded owned tasks only after successful assertion and leaves foreign tasks alone', async () => {
    const h = setup(), finalize = vi.spyOn(h.queue, 'finalizeAfterSave'), files = await h.session.pick('files', {})
    await expect(h.session.finalize()).rejects.toThrow(); expect(finalize).not.toHaveBeenCalled()
    await h.session.assertValues(h.snapshot(), { files })
    h.setSnapshot({ ...h.snapshot(), records: [{ id: 'saved', values: { files } }] } as unknown as R1NodeFormsSnapshot)
    expect(h.session.ready({ files })).toBe(false); expect(h.session.canPick('files', { files })).toBe(false)
    await expect(h.session.finalize()).resolves.toBeUndefined(); expect(finalize).toHaveBeenCalledTimes(1)
    expect(await h.tasks()).toEqual([]); expect(h.session.canPick('files', {})).toBe(false)
    expect(h.session.message()).toBe('')
  })
  it('reports a local cleanup failure without dispatching another upload', async () => {
    const h = setup(), files = await h.session.pick('files', {})
    await h.session.assertValues(h.snapshot(), { files })
    vi.spyOn(h.queue, 'finalizeAfterSave').mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic local cleanup failure') })
    await expect(h.session.finalize()).rejects.toThrow()
    expect(h.session.message()).toContain('本地清理未完成'); expect(h.upload).toHaveBeenCalledTimes(1)
    expect(await h.tasks()).toHaveLength(1)
  })
  it('checks authorization after the queue list resolves before any finalize mutation', async () => {
    const h = setup(), files = await h.session.pick('files', {}); await h.session.assertValues(h.snapshot(), { files })
    const pending = deferred<Awaited<ReturnType<MediaUploadQueuePort['listForAction']>>>()
    vi.spyOn(h.queue, 'listForAction').mockImplementationOnce(() => pending.promise)
    const finalize = vi.spyOn(h.queue, 'finalizeAfterSave'), finishing = h.session.finalize()
    h.revoke(); pending.resolve({ state: 'succeeded', data: await h.tasks() })
    await expect(finishing).rejects.toThrow(); expect(finalize).not.toHaveBeenCalled()
  })
  it.each([
    { url: 'http://upload.invalid/insecure.png' }, { uploadState: 'pending' }, { extension: '' }, { extension: 'jpg' },
    { source: 'camera' }, { mimeType: 'image/jpeg' }, { mimeType: undefined },
  ])('does not expose an invalid or mismatched uploaded reference %j', async patch => {
    const h = setup()
    h.upload.mockImplementationOnce(async file => ({ state: 'succeeded', data: { url: 'https://upload.invalid/file.png', key: 'file.png', extension: 'png', source: file.source,
      mimeType: file.mimeType, uploadState: 'uploaded', ...patch } as UploadedMediaRef }))
    expect(await h.session.pick('files', {})).toBeNull(); expect(h.session.values('files')).toEqual([])
    await expect(h.session.assertValues(h.snapshot(), {})).rejects.toThrow(); expect(h.upload).toHaveBeenCalledTimes(1)
  })
})
