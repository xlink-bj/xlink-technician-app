import { withScopedDraftLock } from '../../src/adapters/storage/scoped-draft-lock'
import { describe, expect, it, vi } from 'vitest'
import { createMockOrderMediaSession } from '../../src/app/mock-order-media-session'
import type { MediaUploadQueuePort, MediaFilePickerPort } from '@shared/ports'
import type { MediaUploadTask } from '@shared/types'
import type { OrderFieldDraft } from '../../src/features/work-orders/quotation/order-field-session'
function setup() {
  let authorized = true, editable = true
  const tasks: MediaUploadTask[] = []
  const queue = { listForAction: vi.fn(async () => ({ state: 'succeeded', data: tasks })), retry: vi.fn(async () => ({ state: 'succeeded' })),
    discard: vi.fn(async () => ({ state: 'succeeded' })), finalizeAfterSave: vi.fn(async () => ({ state: 'succeeded' })), enqueue: vi.fn(), process: vi.fn() }
  const picker = { pick: vi.fn(async () => ({ state: 'cancelled' })) }
  const draft: OrderFieldDraft = { revision: 1, labels: {}, input: { rows: [{ rowId: 'file', valueKey: 'files', type: 'file' }], values: {}, context: { stage: 'placeOrder' }, optionsByRowId: {} } }
  const savedExts = vi.fn(async (): Promise<Record<string, unknown>> => ({}))
  const media = createMockOrderMediaSession({ lockKey: 'order-test-lock', queue: queue as unknown as MediaUploadQueuePort, picker: picker as unknown as MediaFilePickerPort,
    userId: 'user', workOrderId: 'work', nodeId: 'order-node', authorized: () => authorized, canSave: async () => editable, draft: () => draft, savedExts })
  function task(state: string, form?: string) {
    const value = { taskId: 'task', state, scope: { userId: 'user', workOrderId: 'work', workflowNodeId: 'order-node', fieldId: 'file', valueKey: 'files', ...(form ? { formDefinitionId: form } : {}) }, uploadedRef: state === 'uploaded' ? { url: 'https://upload.invalid/a.jpg' } : undefined }
    tasks.push(value as unknown as MediaUploadTask)
    return value
  }
  return { media, queue, picker, task, savedExts, revoke: () => { authorized = false }, freeze: () => { editable = false } }
}
describe('Order media scope and acknowledgement boundary', () => {
  it('excludes FormData tasks and never invents a FormDef scope', async () => {
    const s = setup(); s.task('uploaded', 'foreign-form')
    expect(await s.media.list()).toEqual([])
    expect(s.queue.listForAction).toHaveBeenCalledWith({ userId: 'user', workOrderId: 'work', workflowNodeId: 'order-node' })
    expect(await s.media.verify({ files: [{ url: 'https://upload.invalid/a.jpg' }] })).toBe(false)
  })
  it('rejects pending/failed tasks, arbitrary URLs and unacknowledged local media', async () => {
    const s = setup(); s.task('failed_retryable')
    expect(await s.media.verify({})).toBe(false)
    const fresh = setup()
    expect(await fresh.media.verify({ files: [{ url: 'https://upload.invalid/injected.jpg' }] })).toBe(false)
    expect(await fresh.media.verify({ files: [{ url: 'blob:local' }] })).toBe(false)
  })
  it('accepts only uploaded task refs or exact saved Order URLs, then safely finalizes', async () => {
    const s = setup(); s.task('uploaded')
    expect(await s.media.verify({ files: [] })).toBe(false)
    expect(await s.media.verify({ files: [{ url: 'https://upload.invalid/a.jpg' }] })).toBe(true)
    expect(await s.media.finalize()).toBe(true)
    expect(s.queue.finalizeAfterSave).toHaveBeenCalledTimes(1)
    const restored = setup(); restored.savedExts.mockResolvedValue({ files: 'https://upload.invalid/a.jpg' })
    expect(await restored.media.verify({ files: [{ url: 'https://upload.invalid/a.jpg' }] })).toBe(true)
  })
  it('serializes media selection against the same Order command lock', async () => {
    const s = setup()
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    s.picker.pick.mockImplementation(async () => { await held; return { state: 'cancelled' } })
    const selecting = s.media.pick('file', 'files')
    await vi.waitFor(() => expect(s.picker.pick).toHaveBeenCalledTimes(1))
    let dispatched = false
    const command = withScopedDraftLock('order-test-lock', async () => { dispatched = true; return true })
    await Promise.resolve()
    expect(dispatched).toBe(false)
    release(); await selecting; await command
    expect(dispatched).toBe(true)
  })
  it('blocks retry of ambiguous outcomes and blocks all mutation after freeze or identity change', async () => {
    const s = setup(); Object.assign(s.task('failed_retryable'), { lastError: { code: 'ambiguous_postprocess' } })
    await expect(s.media.retry('task' as never)).rejects.toThrow('不能重发')
    expect(s.queue.retry).not.toHaveBeenCalled()
    s.freeze(); await expect(s.media.pick('file', 'files')).rejects.toThrow('冻结')
    expect(s.picker.pick).not.toHaveBeenCalled()
    s.revoke(); expect(await s.media.verify({})).toBe(false)
    await expect(s.media.list()).rejects.toThrow('身份')
  })
})
