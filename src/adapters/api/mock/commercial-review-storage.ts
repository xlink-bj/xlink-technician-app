/** DEV Mock-only persisted view progress. All platform APIs remain in adapters. */
const storageKey = 'xlink.dev.mock.journey.019.commercial-review.v1'

export function readCommercialReviewStorage(): unknown {
  try { return uni.getStorageSync(storageKey) } catch { return null }
}

export function writeCommercialReviewStorage(value: unknown): boolean {
  try {
    uni.setStorageSync(storageKey, value)
    return true
  } catch { return false }
}

export function clearCommercialReviewStorage(): boolean {
  try {
    uni.removeStorageSync(storageKey)
    return true
  } catch { return false }
}
