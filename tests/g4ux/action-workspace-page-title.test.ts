import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActionWorkspacePageTitle } from '@app/action-page-title'

afterEach(() => vi.unstubAllGlobals())

describe('Action Workspace navigation title platform boundary', () => {
  it('updates the native/uni page shell without mutating a work order', () => {
    const setNavigationBarTitle = vi.fn()
    vi.stubGlobal('uni', { setNavigationBarTitle })
    setActionWorkspacePageTitle('报价工作台')
    setActionWorkspacePageTitle('现场勘查')
    setActionWorkspacePageTitle('预约上门')
    expect(setNavigationBarTitle).toHaveBeenCalledTimes(3)
    expect(setNavigationBarTitle.mock.calls.map(([x]) => x)).toEqual([
      { title: '报价工作台' },
      { title: '现场勘查' },
      { title: '预约上门' },
    ])
  })

  it('does not crash where native navigation UI is not available', () => {
    vi.stubGlobal('uni', {})
    expect(() => setActionWorkspacePageTitle('报价工作台')).not.toThrow()
  })
})
