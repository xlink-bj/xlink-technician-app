import type { DurableMediaStorePort } from '@shared/ports'
import { createOperationError, type DurableMediaAsset, type LocalMedia, type LocalMediaRef, type OperationSnapshot } from '@shared/types'

interface StoredAsset { readonly asset: DurableMediaAsset; readonly blob: Blob }
const failure = <T>(message: string): OperationSnapshot<T> => ({ state: 'failed_terminal',
  error: createOperationError('server_terminal', message) })

/** Browser files must survive document destruction. Blob URLs alone are NOT
 * durable. Keep bytes in IndexedDB and mint a fresh URL on each app boot.
 * No business commands, remote fetches or binary data in draft JSON. */
export class BrowserDurableMediaStore implements DurableMediaStorePort {
  private database?: Promise<IDBDatabase>
  private readonly urls = new Map<string, string>()

  private db(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('xlink-local-media-v1', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('assets')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.database
  }
  private async read(id: LocalMediaRef): Promise<StoredAsset | undefined> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const request = db.transaction('assets').objectStore('assets').get(String(id))
      request.onsuccess = () => resolve(request.result as StoredAsset | undefined)
      request.onerror = () => reject(request.error)
    })
  }
  private async mutate(id: LocalMediaRef, value?: StoredAsset): Promise<void> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('assets', 'readwrite')
      const store = transaction.objectStore('assets')
      if (value) store.put(value, String(id))
      else store.delete(String(id))
      // Await COMMIT, not merely the put request: quota/abort can occur later.
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  }
  async persist(media: LocalMedia): Promise<OperationSnapshot<DurableMediaAsset>> {
    try {
      const existing = await this.resolve(media.ref)
      if (existing.state !== 'succeeded') return existing as OperationSnapshot<DurableMediaAsset>
      if (existing.data) return { state: 'succeeded', data: existing.data }
      if (!media.localPath?.startsWith('blob:') && !media.localPath?.startsWith('data:')) {
        return failure('Browser media requires a local picker file')
      }
      const blob = await (await fetch(media.localPath)).blob()
      if (!blob.size) return failure('Selected local media is empty')
      const asset: DurableMediaAsset = { assetId: media.ref,
        media: { ...media, localPath: undefined }, persistedAt: new Date().toISOString() }
      await this.mutate(media.ref, { asset, blob })
      const resolved = await this.resolve(media.ref)
      return resolved.state === 'succeeded' && resolved.data
        ? { state: 'succeeded', data: resolved.data } : failure('Persisted browser media is unavailable')
    } catch { return failure('Local media could not be persisted; keep the selected file and try again') }
  }
  async resolve(assetId: LocalMediaRef): Promise<OperationSnapshot<DurableMediaAsset | null>> {
    try {
      const stored = await this.read(assetId)
      if (!stored) return { state: 'succeeded', data: null }
      if (!(stored.blob instanceof Blob) || !stored.blob.size || stored.asset.assetId !== assetId) {
        return failure('Local media metadata is invalid')
      }
      let url = this.urls.get(String(assetId))
      if (!url) { url = URL.createObjectURL(stored.blob); this.urls.set(String(assetId), url) }
      return { state: 'succeeded', data: { ...stored.asset, media: { ...stored.asset.media, localPath: url } } }
    } catch { return failure('Local media storage is unavailable') }
  }
  async exists(assetId: LocalMediaRef): Promise<OperationSnapshot<boolean>> {
    const result = await this.resolve(assetId)
    return result.state === 'succeeded' ? { state: 'succeeded', data: Boolean(result.data) } : result as unknown as OperationSnapshot<boolean>
  }
  async remove(assetId: LocalMediaRef): Promise<OperationSnapshot<void>> {
    try {
      await this.mutate(assetId)
      const url = this.urls.get(String(assetId))
      if (url) URL.revokeObjectURL(url)
      this.urls.delete(String(assetId))
      return { state: 'succeeded' }
    } catch { return failure('Local media cleanup failed') }
  }
}
