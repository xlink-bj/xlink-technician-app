import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { asOpaqueId } from '@shared/types'

describe('WeChat upload-token command transport', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    resetBusinessMockCache()
    setBusinessMockMode('data')
  })

  afterEach(() => {
    resetBusinessMockCache()
    vi.unstubAllEnvs()
  })

  it('accepts the R1 token payload from the isolated Mock router without network access', async () => {
    const request = vi.fn()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'),
      request,
      blockRealRequests: true,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'back/super/file/upToken.do',
      body: { fileName: 'roof-panorama.jpg' },
    })).resolves.toMatchObject({ token: 'synthetic-upload-token' })
    expect(request).not.toHaveBeenCalled()
  })
})
