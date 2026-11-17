import { afterEach, describe, expect, it, vi } from 'vitest'
import { withScopedDraftLock } from '../../src/adapters/storage/scoped-draft-lock'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('H5 draft lock safety', () => {
  it('fails closed before work when a browser has no cross-tab lock capability', async () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    vi.stubGlobal('navigator', {})
    const work = vi.fn(async () => 1)
    expect(await withScopedDraftLock('no-browser-lock', work)).toBeNull()
    expect(work).not.toHaveBeenCalled()
  })
  it('uses an exclusive browser lock and does not expose lock failures as saved', async () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const request = vi.fn(async (_name, _mode, work) => work())
    vi.stubGlobal('navigator', { locks: { request } })
    expect(await withScopedDraftLock('browser-lock', async () => 2)).toBe(2)
    expect(request).toHaveBeenCalledWith('browser-lock', { mode: 'exclusive' }, expect.any(Function))
    request.mockRejectedValueOnce(new Error('unavailable'))
    expect(await withScopedDraftLock('browser-lock', async () => 3)).toBeNull()
  })
})
