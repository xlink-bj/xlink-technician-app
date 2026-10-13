import type {
  AuthSessionPort,
  LocationPort,
  MediaCapturePort,
  MediaFilePickerPort,
  NavigationPort,
  SessionSnapshot,
  StorageKey,
  StorageListQuery,
  StoragePort,
} from '@shared/ports'
import type { UploadedMediaRef } from '@shared/types'
import { asOpaqueId, createCapabilityResult, type LocalMedia, type OperationSnapshot } from '@shared/types'

type ReviewUni = {
  getStorageSync?: (key: string) => unknown
  setStorageSync?: (key: string, value: unknown) => void
  removeStorageSync?: (key: string) => void
  getSystemInfoSync?: () => Record<string, unknown>
  request?: (options: { fail?: (error: unknown) => void }) => void
  chooseImage?: (options: { success: (result: unknown) => void; fail: (error: unknown) => void }) => void
  getLocation?: (options: { success: (result: unknown) => void; fail: (error: unknown) => void }) => void
  showToast?: (options: unknown) => void
  showModal?: (options: unknown) => void
}

const reviewStorage = new Map<string, unknown>()

function storageKey(key: StorageKey): string {
  return `${key.namespace}:${key.key}`
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

export function installReviewPlatformShim(): void {
  const uni: ReviewUni = {
    getStorageSync: (key) => reviewStorage.get(key),
    setStorageSync: (key, value) => { reviewStorage.set(key, value) },
    removeStorageSync: (key) => { reviewStorage.delete(key) },
    getSystemInfoSync: () => ({ platform: 'h5', deviceType: 'browser', windowWidth: window.innerWidth }),
    request: (options) => options.fail?.({ errMsg: 'H5 review shim does not call real network' }),
    chooseImage: (options) => options.success({ tempFilePaths: ['/__review/synthetic-photo.jpg'] }),
    getLocation: (options) => options.success({ latitude: 39.9042, longitude: 116.4074, accuracy: 12 }),
    showToast: () => undefined,
    showModal: () => undefined,
  }
  ;(globalThis as unknown as { uni?: ReviewUni }).uni = uni

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null
    if (!target) return
    target.dispatchEvent(new Event('tap', { bubbles: true, cancelable: true }))
  }, true)

  document.addEventListener('input', (event) => {
    if ((event as Event & { __reviewNormalized?: boolean }).__reviewNormalized) return
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    event.stopImmediatePropagation()
    target.dispatchEvent(Object.assign(new Event('input', { bubbles: true }), {
      __reviewNormalized: true,
      detail: { value: target.value },
    }))
  }, true)
}

/**
 * The custom H5 review HTML bypasses uni's page compiler, so its browser
 * stylesheets do not receive the normal rpx-to-px conversion. Apply that
 * platform conversion only after the review stylesheet graph has loaded.
 */
export function installReviewRpxCompatibility(): void {
  if (typeof document === 'undefined') return
  const scale = window.innerWidth / 750
  const rpxPattern = /(-?(?:\d+\.?\d*|\.\d+))rpx\b/g
  const convert = (value: string): string => value.replace(rpxPattern, (_match, number: string) => `${Number(number) * scale}px`)

  const visitRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) rule.style.cssText = convert(rule.style.cssText)
      const nestedRules = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules
      if (nestedRules) visitRules(nestedRules)
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.cssRules) visitRules(sheet.cssRules)
    } catch {
      // Review styles are same-origin; ignore any browser-owned sheet.
    }
  }
}

export function createReviewAuthSession(): AuthSessionPort {
  const snapshot: SessionSnapshot = {
    sessionRef: asOpaqueId<'SessionRef'>('mock-review-session'),
    user: { id: asOpaqueId<'UserId'>('mock-review-user'), displayName: '演示技师' },
    currentRole: { id: asOpaqueId<'RoleId'>('mock-review-role'), name: '技术员' },
    capabilityNames: ['work-order.read', 'work-order.action'],
  }
  return {
    startSession: async () => succeeded(snapshot),
    restoreSession: async () => succeeded(snapshot),
    getCurrentSession: () => snapshot,
    endSession: async () => succeeded(undefined),
  }
}

export function createReviewMemoryStorage(): StoragePort {
  return {
    async read<T>(key: StorageKey) {
      return succeeded((reviewStorage.get(storageKey(key)) as T | undefined) ?? null)
    },
    async write<T>(key: StorageKey, value: T) {
      reviewStorage.set(storageKey(key), value)
      return succeeded(undefined)
    },
    async remove(key: StorageKey) {
      reviewStorage.delete(storageKey(key))
      return succeeded(undefined)
    },
    async listKeys(query: StorageListQuery) {
      const prefix = `${query.namespace}:${query.prefix ?? ''}`
      return succeeded([...reviewStorage.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(`${query.namespace}:`.length)))
    },
  }
}

export function createReviewNavigation(): NavigationPort {
  const update = async (url: string): Promise<void> => {
    if (typeof window !== 'undefined') window.history.replaceState({}, '', url)
  }
  return { navigate: update, replace: update, reset: update, back: async () => window.history.back() }
}

function syntheticMedia(source: 'camera' | 'library'): LocalMedia {
  return {
    ref: asOpaqueId<'LocalMediaRef'>(`review-picked-${source}`),
    localPath: '/__review/synthetic-photo.jpg',
    name: 'synthetic-photo.jpg',
    mimeType: 'image/jpeg',
    source,
    capturedAt: '2026-09-20T09:00:00.000Z',
  }
}

export function createReviewMediaCapture(): MediaCapturePort {
  return { capture: async () => createCapabilityResult('camera', 'granted', syntheticMedia('camera')) }
}

export function createReviewMediaPicker(): MediaFilePickerPort {
  return { pick: async () => createCapabilityResult('library', 'granted', [syntheticMedia('library')]) }
}

export function createReviewLocation(): LocationPort {
  return {
    captureCurrentLocation: async () => createCapabilityResult('location', 'granted', {
      latitude: 39.9042,
      longitude: 116.4074,
      coordinateSystem: 'gcj02',
      accuracy: 12,
      capturedAt: '2026-09-20T09:00:00.000Z',
    }),
  }
}

export function createReviewUploadedMedia(source: 'camera' | 'library' = 'library'): UploadedMediaRef {
  return {
    url: `https://mock-upload.invalid/review/${source}.jpg`,
    key: `review/${source}.jpg`,
    fileName: 'synthetic-photo.jpg',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    source,
    uploadState: 'uploaded',
  }
}

installReviewPlatformShim()
