import { createMediaQueueRepository, createMediaUploadQueue, createMockMediaPostUploadProcessor } from '@runtimes/media'
import { mockJourneyNodes, mockJourneyRoleId, mockJourneyUserId, mockJourneyWorkOrderId } from '@shared/mock-journey-identity'
import type { DurableMediaStorePort, StorageKey, StoragePort, UploadPort } from '@shared/ports'
import { asOpaqueId, createOperationError, r1FileWireFromUpload } from '@shared/types'
import type {
  DurableMediaAsset, LocalMedia, LocalMediaRef, MediaTaskScope, MediaUploadTask,
  MediaUploadTaskId, OperationSnapshot, R1FileWireValue, UploadedMediaRef,
} from '@shared/types'
import { photoSamples } from './photo-samples'

export const attachmentMockScope = Object.freeze({
  userId: mockJourneyUserId,
  roleId: mockJourneyRoleId,
  actingOrgId: 'mock-g16-acting-org-01',
  workOrderId: mockJourneyWorkOrderId,
  workflowNodeId: mockJourneyNodes.survey,
  formDefinitionId: 'mock-g15-g16-attachment-form',
  formDataId: 'mock-g15-g16-saved-record-019',
  editScope: 'saved-record-edit',
})

export type AttachmentMockAccess = { readonly [K in keyof typeof attachmentMockScope]: string } & {
  readonly sessionIdentity: string
  readonly devOptedIn: boolean
}

export type PhotoScenario = 'success' | 'quality' | 'watermark' | 'unknown'
export type UploadScenario = 'acknowledge' | 'error' | 'unknown'

type FileKind = 'g15' | 'g16'
type MediaScope = Omit<MediaTaskScope, 'localAssetId'>

export interface MockFileRow {
  readonly id: MediaUploadTaskId
  readonly name: string
  readonly size: number
  readonly preview: string
  readonly state: MediaUploadTask['state']
  readonly errorCode?: string
}

export interface MockPhotoView {
  readonly status: 'idle' | 'quality' | 'pending' | 'watermark' | 'unknown' | 'success'
  readonly original?: { readonly ref: UploadedMediaRef; readonly preview: string }
  readonly result?: { readonly value: R1FileWireValue; readonly preview: string }
}

export interface AttachmentMockSnapshot {
  readonly photo: MockPhotoView
  readonly files: readonly MockFileRow[]
  readonly counters: { readonly original: number; readonly watermark: number; readonly file: number }
}

type Counts = AttachmentMockSnapshot['counters']

const countZero = { original: 0, watermark: 0, file: 0 } as const
const storagePrefix = 'xlink:dev-only:g15-g16:v1:' + encodeURIComponent(JSON.stringify(attachmentMockScope)) + ':'
const photoClock = '2026-11-20T08:00:00.000Z'
const fileFixtures = [
  { id: 'file-01', name: '现场说明-01.txt', contents: 'Mock work order 019\nRoom A, wall surface\nUnsent attachment 01\n' },
  { id: 'file-02', name: '材料清单-02.txt', contents: 'Mock work order 019\nMaterial checklist\nUnsent attachment 02\n' },
  { id: 'file-ack', name: '已确认记录.txt', contents: 'Mock work order 019\nPreviously acknowledged\n' },
] as const

const succeeded = <T>(data: T): OperationSnapshot<T> => ({ state: 'succeeded', data })
const storageFailure = <T>(): OperationSnapshot<T> => ({
  state: 'failed_terminal', error: createOperationError('server_terminal', '本地 Mock 队列无法读写', { code: 'mock_storage_error' }),
})

function queueScope(kind: FileKind): MediaScope {
  return {
    userId: asOpaqueId<'UserId'>(attachmentMockScope.userId),
    workOrderId: asOpaqueId<'WorkOrderId'>(attachmentMockScope.workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(attachmentMockScope.workflowNodeId),
    formDefinitionId: asOpaqueId<'FormDefinitionId'>(attachmentMockScope.formDefinitionId),
    formDataId: asOpaqueId<'FormDataId'>(attachmentMockScope.formDataId),
    fieldId: kind === 'g15' ? 'mock-inspection-camera' : 'mock-inspection-files',
    valueKey: kind === 'g15' ? 'inspectionPhoto' : 'inspectionFiles',
  }
}

function belongsTo(task: MediaUploadTask, scope: MediaScope): boolean {
  return Object.entries(scope).every(([key, value]) => task.scope[key as keyof MediaScope] === value)
}

function createFixtureStorage(readBrowserStorage: () => Storage): StoragePort {
  const prefix = (namespace: StorageKey['namespace']) => storagePrefix + namespace + ':'
  return {
    async read<T>(key: StorageKey) {
      try {
        const value = readBrowserStorage().getItem(prefix(key.namespace) + key.key)
        return succeeded<T | null>(value === null ? null : JSON.parse(value) as T)
      } catch { return storageFailure<T | null>() }
    },
    async write<T>(key: StorageKey, value: T) {
      try {
        readBrowserStorage().setItem(prefix(key.namespace) + key.key, JSON.stringify(value))
        return succeeded(undefined)
      } catch { return storageFailure<void>() }
    },
    async remove(key) {
      try {
        readBrowserStorage().removeItem(prefix(key.namespace) + key.key)
        return succeeded(undefined)
      } catch { return storageFailure<void>() }
    },
    async listKeys(query) {
      try {
        const storage = readBrowserStorage()
        const namespace = prefix(query.namespace)
        const expected = namespace + (query.prefix ?? '')
        const keys: string[] = []
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index)
          if (key?.startsWith(expected)) keys.push(key.slice(namespace.length))
        }
        return succeeded(keys)
      } catch { return storageFailure<readonly string[]>() }
    },
  }
}

function dataBytes(dataUri: string, mime: string): Uint8Array | undefined {
  const prefix = 'data:' + mime + ';base64,'
  if (!dataUri.startsWith(prefix) || dataUri.length > 1_200_000) return undefined
  try { return Uint8Array.from(atob(dataUri.slice(prefix.length)), character => character.charCodeAt(0)) }
  catch { return undefined }
}

function hasFixtureBytes(media: LocalMedia): boolean {
  const bytes = media.localPath && dataBytes(media.localPath, media.mimeType)
  return Boolean(bytes && bytes.length > 0 && bytes.length === media.size)
}

/** Stores only fixed synthetic fixture bytes alongside the existing semantic queue.
 * Browser storage is used directly. No fetch, picker, camera, location, or OS permission. */
function createFixtureMediaStore(storage: StoragePort): DurableMediaStorePort {
  const key = (id: LocalMediaRef): StorageKey => ({ namespace: 'cache', key: 'fixture-bytes:' + id })
  const resolve = async (id: LocalMediaRef): Promise<OperationSnapshot<DurableMediaAsset | null>> => {
    const stored = await storage.read<DurableMediaAsset>(key(id))
    if (stored.state !== 'succeeded' || !stored.data) return stored
    if (stored.data.assetId !== id || stored.data.media?.ref !== id || !hasFixtureBytes(stored.data.media)) return storageFailure()
    return stored
  }
  return {
    resolve,
    async persist(media) {
      if (!hasFixtureBytes(media)) return storageFailure()
      const previous = await resolve(media.ref)
      if (previous.state !== 'succeeded') return storageFailure()
      if (previous.data) return succeeded(previous.data)
      const asset = { assetId: media.ref, media, persistedAt: new Date().toISOString() }
      const written = await storage.write(key(media.ref), asset)
      return written.state === 'succeeded' ? succeeded(asset) : storageFailure()
    },
    async exists(id) {
      const asset = await resolve(id)
      return asset.state === 'succeeded' ? succeeded(Boolean(asset.data)) : storageFailure()
    },
    remove: id => storage.remove(key(id)),
  }
}

function textMedia(fixture: typeof fileFixtures[number]): LocalMedia {
  const data = new TextEncoder().encode(fixture.contents)
  const base64 = btoa(Array.from(data, byte => String.fromCharCode(byte)).join(''))
  return {
    ref: asOpaqueId<'LocalMediaRef'>('g16-' + fixture.id),
    mimeType: 'text/plain', source: 'file', localPath: 'data:text/plain;base64,' + base64,
    name: fixture.name, size: data.length,
  }
}

async function validPhoto(dataUri: string): Promise<boolean> {
  const bytes = dataBytes(dataUri, 'image/jpeg')
  if (!bytes || bytes.length < 1_024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return false
  try {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer], { type: 'image/jpeg' }))
    const valid = bitmap.width === 960 && bitmap.height === 640
    bitmap.close()
    return valid
  } catch { return false }
}

function uploadAck(media: LocalMedia): UploadedMediaRef {
  const extension = media.source === 'camera' ? 'jpg' : 'txt'
  const key = media.ref + '.' + extension
  return { url: 'https://mock-attachments.invalid/source/' + encodeURIComponent(key), key,
    fileName: media.name, extension, mimeType: media.mimeType, source: media.source, uploadState: 'uploaded' }
}

export function createAttachmentMock(options: {
  readonly readAccess: () => AttachmentMockAccess | null
  readonly getStorage: () => Storage
}) {
  let disposed = false
  let busy = false
  const entrySession = options.readAccess()?.sessionIdentity
  const canAccess = () => {
    const current = options.readAccess()
    return !disposed && Boolean(entrySession) && !!current && current.devOptedIn
      && current.sessionIdentity === entrySession
      && Object.entries(attachmentMockScope).every(([key, value]) =>
        current[key as keyof typeof attachmentMockScope] === value)
  }
  function requireScope() {
    if (!canAccess()) throw new Error('当前 DEV Mock 角色、经办组织或工单编辑范围不匹配')
  }

  const storage = createFixtureStorage(options.getStorage)
  const bytes = createFixtureMediaStore(storage)
  const repository = createMediaQueueRepository(storage)
  const counterKey = { namespace: 'cache', key: 'dispatch-counts' } as const
  const latestKey = { namespace: 'cache', key: 'latest-photo' } as const
  let fileScenario: UploadScenario = 'acknowledge'
  let photoScenario: PhotoScenario = 'success'

  async function counts(): Promise<Counts> {
    const result = await storage.read<Counts>(counterKey)
    if (result.state !== 'succeeded') throw new Error('无法读取本地 Mock 派发记录')
    return result.data ?? countZero
  }
  async function recordDispatch(kind: keyof Counts) {
    requireScope()
    const previous = await counts()
    requireScope()
    const result = await storage.write(counterKey, { ...previous, [kind]: previous[kind] + 1 })
    if (result.state !== 'succeeded') throw new Error('无法保存本地 Mock 派发记录')
  }

  const mockUpload: UploadPort = {
    async upload(media) {
      requireScope()
      if (media.source === 'file' && fileScenario === 'error') {
        return { state: 'failed_retryable',
          error: createOperationError('network_retryable', '合成请求在派发前失败', { code: 'mock_before_dispatch' }) }
      }
      await recordDispatch(media.source === 'camera' ? 'original' : 'file')
      if (media.source === 'file' && fileScenario === 'unknown') {
        return { state: 'failed_retryable',
          error: createOperationError('network_retryable', '合成上传回执未确认', { code: 'ambiguous_upload' }) }
      }
      return succeeded(uploadAck(media))
    },
  }

  const mockWatermark = createMockMediaPostUploadProcessor()
  const queue = createMediaUploadQueue(bytes, repository, mockUpload, {
    postUploadProcessor: {
      preflight: input => mockWatermark.preflight(input),
      async process(input) {
        await recordDispatch('watermark')
        if (photoScenario === 'unknown') return {
          state: 'failed_retryable',
          error: createOperationError('network_retryable', '合成水印回执未确认', { code: 'ambiguous_postprocess' }),
        }
        if (photoScenario === 'watermark' || !await validPhoto(photoSamples.result)) return {
          state: 'failed_terminal',
          error: createOperationError('validation', '合成水印结果未通过校验', { code: 'mock_watermark_rejected' }),
        }
        requireScope()
        return mockWatermark.process(input)
      },
    },
  })

  async function list(kind: FileKind): Promise<readonly MediaUploadTask[]> {
    requireScope()
    const scope = queueScope(kind)
    const result = await queue.listForAction(scope)
    requireScope()
    if (result.state !== 'succeeded' || !result.data) throw new Error('无法读取本地 Mock 附件队列')
    return result.data.filter(task => belongsTo(task, scope))
  }

  async function snapshot(): Promise<AttachmentMockSnapshot> {
    requireScope()
    const stored = await storage.read<string>(latestKey)
    if (stored.state !== 'succeeded') throw new Error('无法读取本地 Mock 照片')
    let photo: MockPhotoView = { status: stored.data === 'quality' ? 'quality' : 'idle' }
    if (stored.data && stored.data !== 'quality') {
      const task = (await list('g15')).find(row => String(row.taskId) === stored.data)
      if (task) {
        const original = task.sourceUploadedRef
          ? { ref: task.sourceUploadedRef, preview: photoSamples.original } : undefined
        const final = task.state === 'uploaded' && task.uploadedRef && task.sourceUploadedRef
          && task.uploadedRef.url !== task.sourceUploadedRef.url
          ? r1FileWireFromUpload(task.uploadedRef) : null
        const unknown = task.lastError?.code === 'ambiguous_postprocess' || task.state === 'postprocessing'
          || task.state === 'uploading'
        const pending = task.state === 'queued' || task.state === 'ready_to_upload' || task.state === 'source_uploaded'
        photo = {
          status: final ? 'success' : unknown ? 'unknown' : pending ? 'pending' : 'watermark',
          ...(original ? { original } : {}),
          ...(final ? { result: { value: final, preview: photoSamples.result } } : {}),
        }
      }
    }
    const files: MockFileRow[] = []
    for (const task of await list('g16')) {
      const asset = await bytes.resolve(task.scope.localAssetId)
      requireScope()
      if (asset.state !== 'succeeded' || !asset.data) throw new Error('本地附件字节缺失，不能继续上传')
      const { name, size, localPath } = asset.data.media
      files.push({ id: task.taskId, name: name ?? '', size: size ?? 0, preview: localPath ?? '',
        state: task.state, ...(task.lastError?.code ? { errorCode: task.lastError.code } : {}) })
    }
    const confirmedCounts = await counts()
    requireScope()
    return { photo, files, counters: confirmedCounts }
  }

  async function onlyOne(work: () => Promise<void>): Promise<AttachmentMockSnapshot> {
    requireScope()
    if (busy) throw new Error('附件操作正在处理')
    busy = true
    try {
      await work()
      return await snapshot()
    } finally { busy = false }
  }

  function runPhoto(scenario: PhotoScenario) {
    return onlyOne(async () => {
      const current = (await snapshot()).photo.status
      if (current === 'unknown' || current === 'pending') throw new Error('水印结果待核对，不能重复派发')
      const original = scenario === 'quality' ? photoSamples.lowQuality : photoSamples.original
      const accepted = await validPhoto(original)
      requireScope()
      if (!accepted) {
        const saved = await storage.write(latestKey, 'quality')
        if (saved.state !== 'succeeded') throw new Error('无法保存合成照片质量结果')
        return
      }
      const media: LocalMedia = {
        ref: asOpaqueId<'LocalMediaRef'>('g15-photo-' + crypto.randomUUID()),
        mimeType: 'image/jpeg', source: 'camera', localPath: original,
        name: '合成巡检照片.jpg', size: dataBytes(original, 'image/jpeg')?.length,
      }
      const enqueued = await queue.enqueue({ scope: queueScope('g15'), media, evidence: {
        capturedAt: photoClock, postUploadPolicy: 'remote_location_watermark',
        location: { coordinateSystem: 'wgs84', latitude: 0, longitude: 0,
          capturedAt: photoClock, address: '合成示例地点' },
      } })
      requireScope()
      if (enqueued.state !== 'succeeded' || !enqueued.data) throw new Error('无法保存合成照片')
      const saved = await storage.write(latestKey, enqueued.data.taskId)
      if (saved.state !== 'succeeded') throw new Error('无法保存合成照片选择')
      photoScenario = scenario
      requireScope()
      const processed = await queue.process(enqueued.data.taskId)
      if (!processed.data) throw new Error(processed.error?.message ?? '无法读回合成水印状态')
    })
  }

  function seedFiles() {
    return onlyOne(async () => {
      fileScenario = 'acknowledge'
      for (const fixture of fileFixtures) {
        requireScope()
        const task = await queue.enqueue({ scope: queueScope('g16'), media: textMedia(fixture) })
        if (task.state !== 'succeeded' || !task.data) throw new Error('无法保存合成附件')
        if (fixture.id === 'file-ack' && task.data.state === 'queued') {
          requireScope()
          const processed = await queue.process(task.data.taskId)
          if (processed.state !== 'succeeded') throw new Error(processed.error?.message ?? '无法确认示例附件')
        }
      }
    })
  }

  function runFile(id: MediaUploadTaskId, scenario: UploadScenario) {
    return onlyOne(async () => {
      const task = (await list('g16')).find(row => row.taskId === id)
      if (!task) throw new Error('附件不属于当前工单编辑范围')
      if (task.state === 'uploaded') return
      if (task.lastError?.code === 'ambiguous_upload' || task.state === 'uploading')
        throw new Error('上传结果待核对，不能重复派发')
      if (task.state !== 'queued' && task.lastError?.code !== 'mock_before_dispatch')
        throw new Error('此附件无法重新派发')
      fileScenario = scenario
      requireScope()
      const processed = task.state === 'queued' ? await queue.process(id) : await queue.retry(id)
      if (!processed.data) throw new Error(processed.error?.message ?? '无法读回合成附件状态')
    })
  }

  return { canAccess, snapshot, runPhoto, seedFiles, runFile, dispose: () => { disposed = true } }
}
