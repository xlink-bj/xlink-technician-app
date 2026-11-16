import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmUniLogout } from '@adapters/platform/uni-logout-confirmation'

afterEach(() => vi.unstubAllGlobals())
describe('logout confirmation platform boundary', () => {
  it.each([true, false])('returns only explicit confirmation: %s', async confirmed => {
    const showModal = vi.fn().mockResolvedValue({ confirm: confirmed, cancel: !confirmed })
    vi.stubGlobal('uni', { showModal })
    expect(await confirmUniLogout()).toBe(confirmed)
    expect(showModal).toHaveBeenCalledOnce()
    expect(showModal).toHaveBeenCalledWith(expect.objectContaining({ title: '退出登录', cancelText: '取消' }))
  })
  it('fails closed when the platform is unavailable or rejects the dialog', async () => {
    vi.stubGlobal('uni', undefined)
    expect(await confirmUniLogout()).toBe(false)
    vi.stubGlobal('uni', { showModal: vi.fn().mockRejectedValue(new Error('unavailable')) })
    expect(await confirmUniLogout()).toBe(false)
  })
})
