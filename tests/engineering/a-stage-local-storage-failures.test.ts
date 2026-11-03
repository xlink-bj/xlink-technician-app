import { describe, expect, it, vi } from 'vitest'
import { createUniStorageDriver, type UniStorageApi } from '@adapters/storage/uni-storage-driver'
import { createSemanticStorageAdapter } from '@adapters/storage/storage-adapter'

type ReadFailure = { readonly errMsg: string }
type Fail = (error: ReadFailure) => void
interface GetCallbacks { readonly fail?: Fail }
interface InfoCallbacks {
  readonly success?: (result: { readonly keys: string[] }) => void
  readonly fail?: Fail
}

/** A platform getStorage failure cannot prove that a draft key is missing. */
function failedReads(knownKeys: readonly string[] | null) {
  const read = vi.fn(({ fail }: GetCallbacks) =>
    fail?.({ errMsg: 'getStorage:fail storage unavailable' }))
  const list = vi.fn(({ success, fail }: InfoCallbacks) => {
    if (knownKeys === null) fail?.({ errMsg: 'getStorageInfo:fail storage unavailable' })
    else success?.({ keys: [...knownKeys] })
  })
  const api = {
    getStorage: read,
    getStorageInfo: list,
    setStorage: vi.fn(),
    removeStorage: vi.fn(),
  } as unknown as UniStorageApi
  return { storage: createSemanticStorageAdapter(createUniStorageDriver(api)), read, list }
}

describe('A-stage local draft storage failure semantics', () => {
  const draft = { namespace: 'draft' as const, key: 'unfinished-form' }

  it('does not erase a recoverable draft when getStorage fails for an existing key', async () => {
    const { storage, read, list } = failedReads(['draft:unfinished-form'])
    const result = await storage.read<{ note: string }>(draft)
    expect(result.state).toBe('failed_terminal')
    expect(result.data).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('treats an absent key as a normal empty draft only after verifying absence', async () => {
    const { storage } = failedReads([])
    expect(await storage.read(draft)).toEqual({ state: 'succeeded', data: null })
  })

  it('fails closed when both read and key verification are unavailable', async () => {
    const { storage } = failedReads(null)
    expect((await storage.read(draft)).state).toBe('failed_terminal')
  })

  it('does not acknowledge a local draft write rejected by storage quota', async () => {
    const api = {
      getStorage: vi.fn(),
      getStorageInfo: vi.fn(),
      setStorage: vi.fn(({ fail }: GetCallbacks) =>
        fail?.({ errMsg: 'setStorage:fail quota exceeded' })),
      removeStorage: vi.fn(),
    } as unknown as UniStorageApi
    const storage = createSemanticStorageAdapter(createUniStorageDriver(api))
    const result = await storage.write(draft, { note: 'must remain pending locally' })
    expect(result.state).toBe('failed_terminal')
    expect(api.setStorage).toHaveBeenCalledTimes(1)
  })
})
