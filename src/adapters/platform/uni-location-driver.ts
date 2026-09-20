import type { LocationDriver, PlatformDriverResult } from './platform-adapters'

interface UniLocationResult {
  readonly latitude?: number
  readonly longitude?: number
  readonly accuracy?: number
}

interface UniLocationApi {
  getLocation?(options: {
    type: 'gcj02'
    success: (result: UniLocationResult) => void
    fail: (error: unknown) => void
  }): unknown
}

function defaultApi(): UniLocationApi {
  return (typeof uni === 'undefined' ? {} : uni) as unknown as UniLocationApi
}

export function createUniLocationDriver(api: UniLocationApi = defaultApi()): LocationDriver {
  return {
    capture: () => new Promise<PlatformDriverResult>((resolve) => {
      if (!api.getLocation) {
        resolve({ state: 'unsupported_platform', reason: 'Location API is unavailable' })
        return
      }
      try {
        api.getLocation({
          type: 'gcj02',
          success: (result) => {
            if (typeof result.latitude !== 'number' || typeof result.longitude !== 'number') {
              resolve({ state: 'error_retryable', reason: 'Location coordinates are missing' })
              return
            }
            resolve({
              state: 'granted',
              value: {
                latitude: result.latitude,
                longitude: result.longitude,
                coordinateSystem: 'gcj02',
                ...(typeof result.accuracy === 'number' ? { accuracy: result.accuracy } : {}),
                capturedAt: new Date().toISOString(),
              },
            })
          },
          fail: (error) => {
            const message = typeof error === 'object' && error !== null && 'errMsg' in error
              ? String((error as { errMsg?: unknown }).errMsg ?? '')
              : ''
            resolve({
              state: /auth|permission|denied|定位服务/u.test(message) ? 'denied' : 'error_retryable',
              reason: message || 'Location capture failed',
            })
          },
        })
      } catch {
        resolve({ state: 'error_retryable', reason: 'Location capture failed' })
      }
    }),
  }
}
