import type { NetworkStatus, NetworkStatusPort } from '@shared/ports'

interface NetworkTypeResult { readonly networkType?: string }
interface UniNetworkApi {
  getNetworkType?(options: { success: (result: NetworkTypeResult) => void; fail: () => void }): unknown
  onNetworkStatusChange?(listener: (result: { readonly isConnected?: boolean; readonly networkType?: string }) => void): unknown
  offNetworkStatusChange?(listener: (result: { readonly isConnected?: boolean; readonly networkType?: string }) => void): unknown
}

function defaultApi(): UniNetworkApi {
  return (typeof uni === 'undefined' ? {} : uni) as unknown as UniNetworkApi
}

function statusFor(networkType?: string, connected?: boolean): NetworkStatus {
  if (connected === false || networkType === 'none') return 'offline'
  if (connected === true || (networkType && networkType !== 'none')) return 'online'
  return 'unknown'
}

export function createUniNetworkStatusPort(api: UniNetworkApi = defaultApi()): NetworkStatusPort {
  return {
    current: () => new Promise<NetworkStatus>((resolve) => {
      if (!api.getNetworkType) { resolve('unknown'); return }
      try {
        api.getNetworkType({ success: (result) => resolve(statusFor(result.networkType)), fail: () => resolve('unknown') })
      } catch {
        resolve('unknown')
      }
    }),
    subscribe: (listener) => {
      if (!api.onNetworkStatusChange) return () => undefined
      const wrapped = (result: { readonly isConnected?: boolean; readonly networkType?: string }) => listener(statusFor(result.networkType, result.isConnected))
      api.onNetworkStatusChange(wrapped)
      return () => { api.offNetworkStatusChange?.(wrapped) }
    },
  }
}
