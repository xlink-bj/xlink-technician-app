import type { KeyValueStorageDriver } from './storage-adapter'

export type UniStorageApi = Pick<Uni, 'getStorage' | 'setStorage' | 'removeStorage' | 'getStorageInfo'>

function errorMessage(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback)
}

export function createUniStorageDriver(api: UniStorageApi = uni): KeyValueStorageDriver {
  return {
    get: (key) =>
      new Promise((resolve, reject) => {
        api.getStorage({
          key,
          success: (result) => resolve(typeof result.data === 'string' ? result.data : JSON.stringify(result.data)),
          // A failed get is NOT always a missing key (quota, corruption, denied access).
          // Confirm absence through the platform's key listing; otherwise fail closed
          // so a recoverable draft is never silently treated as empty.
          fail: (error) => {
            try {
              api.getStorageInfo({
                success: (info) => {
                  if (!Array.isArray(info.keys)) {
                    reject(errorMessage(error, 'uni storage key verification failed'))
                  } else if (info.keys.includes(key)) {
                    reject(errorMessage(error, 'uni storage read failed'))
                  } else {
                    resolve(null)
                  }
                },
                fail: () => reject(errorMessage(error, 'uni storage read failed; key verification unavailable')),
              })
            } catch {
              reject(errorMessage(error, 'uni storage key verification unavailable'))
            }
          },
        })
      }),
    set: (key, value) =>
      new Promise((resolve, reject) => {
        api.setStorage({
          key,
          data: value,
          success: () => resolve(),
          fail: (error) => reject(errorMessage(error, 'uni storage write failed')),
        })
      }),
    remove: (key) =>
      new Promise((resolve, reject) => {
        api.removeStorage({
          key,
          success: () => resolve(),
          fail: (error) => reject(errorMessage(error, 'uni storage remove failed')),
        })
      }),
    listKeys: () =>
      new Promise((resolve, reject) => {
        api.getStorageInfo({
          success: (result) => resolve(Array.isArray(result.keys) ? result.keys.filter((key): key is string => typeof key === 'string') : []),
          fail: (error) => reject(errorMessage(error, 'uni storage key enumeration failed')),
        })
      }),
  }
}
