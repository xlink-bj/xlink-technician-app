import type { KeyValueStorageDriver } from './storage-adapter'

export type UniStorageApi = Pick<Uni, 'getStorage' | 'setStorage' | 'removeStorage' | 'getStorageInfo'>

function errorMessage(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback)
}

export function createUniStorageDriver(api: UniStorageApi = uni): KeyValueStorageDriver {
  return {
    get: (key) =>
      new Promise((resolve) => {
        api.getStorage({
          key,
          success: (result) => resolve(typeof result.data === 'string' ? result.data : JSON.stringify(result.data)),
          // A missing key is the normal empty-storage result for this semantic driver.
          fail: () => resolve(null),
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
