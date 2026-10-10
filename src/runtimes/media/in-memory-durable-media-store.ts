import type { DurableMediaStorePort } from '@shared/ports'
import { createOperationError, type DurableMediaAsset, type LocalMedia, type LocalMediaRef, type OperationSnapshot } from '@shared/types'

/** Deterministic store used by Mock/tests; production uses the platform adapter. */
export class InMemoryDurableMediaStore implements DurableMediaStorePort {
  private readonly assets = new Map<string, DurableMediaAsset>()

  async persist(media: LocalMedia): Promise<OperationSnapshot<DurableMediaAsset>> {
    if (!media.localPath) {
      return { state: 'failed_terminal', error: createOperationError('unsupported_capability', 'Local media has no file path') }
    }
    const existing = this.assets.get(String(media.ref))
    if (existing) return { state: 'succeeded', data: existing }
    const asset: DurableMediaAsset = {
      assetId: media.ref,
      media,
      persistedAt: new Date().toISOString(),
    }
    this.assets.set(String(media.ref), asset)
    return { state: 'succeeded', data: asset }
  }

  async resolve(assetId: LocalMediaRef): Promise<OperationSnapshot<DurableMediaAsset | null>> {
    return { state: 'succeeded', data: this.assets.get(String(assetId)) ?? null }
  }

  async exists(assetId: LocalMediaRef): Promise<OperationSnapshot<boolean>> {
    return { state: 'succeeded', data: this.assets.has(String(assetId)) }
  }

  async remove(assetId: LocalMediaRef): Promise<OperationSnapshot<void>> {
    this.assets.delete(String(assetId))
    return { state: 'succeeded', data: undefined }
  }
}
