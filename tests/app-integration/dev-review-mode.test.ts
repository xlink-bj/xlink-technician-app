import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

describe('B2-X developer presentation mode', () => {
  it('defaults to commercial presentation, requires explicit opt-in and can be reset', async () => {
    vi.stubEnv('DEV', true)
    const session = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => { session.set(key, value) },
        removeItem: (key: string) => { session.delete(key) },
      },
    })
    const mode = await import('@shared/ui/dev-review-mode')
    expect(mode.devReviewModeEnabled.value).toBe(false)
    mode.setDevReviewModeFromRoute(undefined)
    expect(mode.devReviewModeEnabled.value).toBe(false)
    mode.setDevReviewModeFromRoute('1')
    expect(mode.devReviewModeEnabled.value).toBe(true)
    vi.resetModules()
    const reloaded = await import('@shared/ui/dev-review-mode')
    expect(reloaded.devReviewModeEnabled.value).toBe(true)
    reloaded.setDevReviewModeFromRoute('0')
    expect(reloaded.devReviewModeEnabled.value).toBe(false)
    vi.resetModules()
    const reopened = await import('@shared/ui/dev-review-mode')
    expect(reopened.devReviewModeEnabled.value).toBe(false)
  })

  it('cannot be enabled outside DEV even if a query parameter requests it', async () => {
    vi.stubEnv('DEV', false)
    const mode = await import('@shared/ui/dev-review-mode')
    mode.setDevReviewModeFromRoute('1')
    expect(mode.devReviewModeEnabled.value).toBe(false)
  })

  it('honors H5 same-page hash opt-in/out without leaking across routes', async () => {
    vi.stubEnv('DEV', true)
    const session = new Map<string, string>()
    let onHashChange: () => void = () => { throw new Error('missing hashchange handler') }
    const location = { hash: '#/pages/index/index' }
    vi.stubGlobal('window', {
      location,
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'hashchange') onHashChange = handler
      },
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => { session.set(key, value) },
        removeItem: (key: string) => { session.delete(key) },
      },
    })
    const mode = await import('@shared/ui/dev-review-mode')
    expect(mode.devReviewModeEnabled.value).toBe(false)
    location.hash = '#/pages/index/index?devReview=1'
    onHashChange()
    expect(mode.devReviewModeEnabled.value).toBe(true)
    location.hash = '#/pages/work-orders/detail?devReview=0'
    onHashChange()
    expect(mode.devReviewModeEnabled.value).toBe(true)
    location.hash = '#/pages/index/index?devReview=0'
    onHashChange()
    expect(mode.devReviewModeEnabled.value).toBe(false)
  })
})
