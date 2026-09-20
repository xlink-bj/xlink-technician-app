import type { DurableMediaStorePort, StoragePort } from '@shared/ports'
import { asOpaqueId, createOperationError, type DurableMediaAsset, type LocalMedia, type LocalMediaRef, type OperationSnapshot } from '@shared/types'

interface UniFileResult {
  readonly savedFilePath?: string
}

export interface UniDurableMediaApi {
  saveFile?(options: { tempFilePath: string; success: (result: UniFileResult) => void; fail: (error: unknown) => void }): unknown
  getSavedFileInfo?(options: { filePath: string; success: () => void; fail: (error: unknown) => void }): unknown
  removeSavedFile?(options: { filePath: string; success: () => void; fail: (error: unknown) => void }): unknown
}

function defaultApi(): UniDurableMediaApi {
  return (typeof uni === 'undefined' ? {} : uni) as unknown as UniDurableMediaApi
}

function failure<T>(category: 'unsupported_capability' | 'server_terminal' | 'network_retryable', message: string): OperationSnapshot<T> {
  return { state: category === 'network_retryable' ? 'failed_retryable' : 'failed_terminal', error: createOperationError(category, message) }
}

function assetKey(assetId: LocalMediaRef): string {
  return `media-asset:v1:${encodeURIComponent(String(assetId))}`
}

function mediaFrom(value: unknown): DurableMediaAsset | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const media = record.media
  if (media === null || typeof media !== 'object' || Array.isArray(media)) return null
  const mediaRecord = media as Record<string, unknown>
  if (typeof record.assetId !== 'string' || typeof record.persistedAt !== 'string' || typeof mediaRecord.localPath !== 'string') return null
  return {
    assetId: asOpaqueId<'LocalMediaRef'>(record.assetId),
    media: mediaRecord as unknown as LocalMedia,
    persistedAt: record.persistedAt,
  }
}

export interface UniDurableMediaStoreOptions {
  readonly now?: () => string
}

export class UniDurableMediaStore implements DurableMediaStorePort {
  constructor(
    private readonly storage: StoragePort,
    private readonly api: UniDurableMediaApi = defaultApi(),
    private readonly options: UniDurableMediaStoreOptions = {},
  ) {}

  async persist(media: LocalMedia): Promise<OperationSnapshot<DurableMediaAsset>> {
    if (!media.localPath) return failure('unsupported_capability', 'A temporary media path is required before durable persistence')
    if (!this.api.saveFile) return failure('unsupported_capability', 'Durable local file storage is unavailable on this platform')
    const existing = await this.resolve(media.ref)
    if (existing.state !== 'succeeded') return existing as unknown as OperationSnapshot<DurableMediaAsset>
    if (existing.data) return { state: 'succeeded', data: existing.data }
    const savedPath = await new Promise<string | null>((resolve) => {
      try {
        this.api.saveFile!({
          tempFilePath: media.localPath!,
          success: (result) => resolve(typeof result.savedFilePath === 'string' ? result.savedFilePath : null),
          fail: () => resolve(null),
        })
      } catch {
        resolve(null)
      }
    })
    if (!savedPath) return failure('server_terminal', 'Platform did not return a durable media path')
    const asset: DurableMediaAsset = {
      assetId: media.ref,
      media: { ...media, localPath: savedPath },
      persistedAt: this.options.now?.() ?? new Date().toISOString(),
    }
    const written = await this.storage.write({ namespace: 'cache', key: assetKey(media.ref) }, asset)
    if (written.state !== 'succeeded') return written as unknown as OperationSnapshot<DurableMediaAsset>
    return { state: 'succeeded', data: asset }
  }

  async resolve(assetId: LocalMediaRef): Promise<OperationSnapshot<DurableMediaAsset | null>> {
    const stored = await this.storage.read<unknown>({ namespace: 'cache', key: assetKey(assetId) })
    if (stored.state !== 'succeeded') return stored as OperationSnapshot<DurableMediaAsset | null>
    if (stored.data === null) return { state: 'succeeded', data: null }
    const asset = mediaFrom(stored.data)
    if (!asset || String(asset.assetId) !== String(assetId)) {
      return failure('server_terminal', 'Durable media metadata is malformed')
    }
    if (!this.api.getSavedFileInfo) return failure('unsupported_capability', 'Durable local file verification is unavailable')
    const exists = await new Promise<boolean>((resolve) => {
      try {
        this.api.getSavedFileInfo!({ filePath: asset.media.localPath!, success: () => resolve(true), fail: () => resolve(false) })
      } catch {
        resolve(false)
      }
    })
    return exists ? { state: 'succeeded', data: asset } : { state: 'succeeded', data: null }
  }

  async exists(assetId: LocalMediaRef): Promise<OperationSnapshot<boolean>> {
    const resolved = await this.resolve(assetId)
    if (resolved.state !== 'succeeded') return resolved as unknown as OperationSnapshot<boolean>
    return { state: 'succeeded', data: resolved.data !== null }
  }

  async remove(assetId: LocalMediaRef): Promise<OperationSnapshot<void>> {
    const stored = await this.storage.read<unknown>({ namespace: 'cache', key: assetKey(assetId) })
    if (stored.state !== 'succeeded') return stored as OperationSnapshot<void>
    const asset = stored.data === null ? null : mediaFrom(stored.data)
    if (asset?.media.localPath && this.api.removeSavedFile) {
      await new Promise<void>((resolve) => {
        try {
          this.api.removeSavedFile!({ filePath: asset.media.localPath!, success: () => resolve(), fail: () => resolve() })
        } catch {
          resolve()
        }
      })
    }
    return this.storage.remove({ namespace: 'cache', key: assetKey(assetId) })
  }
}

export function createUniDurableMediaStore(
  storage: StoragePort,
  api: UniDurableMediaApi = defaultApi(),
  options: UniDurableMediaStoreOptions = {},
): DurableMediaStorePort {
  return new UniDurableMediaStore(storage, api, options)
}
