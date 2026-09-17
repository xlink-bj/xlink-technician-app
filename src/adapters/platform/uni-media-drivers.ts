import type {
  MediaCaptureDriver,
  MediaFilePickerDriver,
  PlatformDriverResult,
} from './platform-adapters'

interface UniChooseImageResult {
  readonly tempFilePaths?: readonly string[]
  readonly tempFiles?: readonly { readonly path?: string; readonly size?: number }[]
}

interface UniChooseImageOptions {
  readonly count: number
  readonly sourceType: readonly ('album' | 'camera')[]
  readonly success: (result: UniChooseImageResult) => void
  readonly fail: (error: unknown) => void
}

type UniChooseImage = (options: UniChooseImageOptions) => unknown

function defaultChooseImage(options: UniChooseImageOptions): unknown {
  const driver = (typeof uni === 'undefined' ? undefined : uni) as unknown as { chooseImage?: UniChooseImage }
  if (!driver.chooseImage) throw new Error('image picker is unavailable')
  return driver.chooseImage(options)
}

function imageResult(result: UniChooseImageResult, source: 'camera' | 'library'): PlatformDriverResult {
  const paths = result.tempFilePaths ?? result.tempFiles?.map((file) => file.path ?? '') ?? []
  const sizes = new Map((result.tempFiles ?? []).flatMap((file) => file.path ? [[file.path, file.size]] as const : []))
  const media = paths
    .filter((path) => path.trim().length > 0)
    .map((path, index) => ({
      ref: `local-media-${Date.now()}-${index}-${path}`,
      localPath: path,
      mimeType: 'image/jpeg',
      source,
      ...(sizes.get(path) !== undefined ? { size: sizes.get(path) } : {}),
      name: path.split('/').pop() ?? `image-${index + 1}.jpg`,
    }))
  if (media.length === 0) return { state: 'cancelled' }
  return { state: 'granted', value: source === 'camera' ? media[0] : media }
}

function choose(
  chooseImage: UniChooseImage,
  source: 'camera' | 'library',
): Promise<PlatformDriverResult> {
  return new Promise((resolve) => {
    try {
      chooseImage({
        count: source === 'camera' ? 1 : 9,
        sourceType: [source === 'camera' ? 'camera' : 'album'],
        success: (result) => resolve(imageResult(result, source)),
        fail: () => resolve({ state: 'cancelled' }),
      })
    } catch {
      resolve({ state: 'error_retryable', reason: 'image picker failed' })
    }
  })
}

export function createUniMediaCaptureDriver(
  chooseImage: UniChooseImage = defaultChooseImage,
): MediaCaptureDriver {
  return { capture: () => choose(chooseImage, 'camera') }
}

export function createUniMediaFilePickerDriver(
  chooseImage: UniChooseImage = defaultChooseImage,
): MediaFilePickerDriver {
  return { pick: () => choose(chooseImage, 'library') }
}
