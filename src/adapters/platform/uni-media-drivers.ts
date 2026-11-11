import type {
  MediaCaptureDriver,
  MediaFilePickerDriver,
  PlatformDriverResult,
} from './platform-adapters'

interface UniPickedImage {
  readonly path?: string
  readonly size?: number
  /** H5 returns File objects; name/type are not recoverable from a blob URL. */
  readonly name?: string
  readonly type?: string
}

interface UniChooseImageResult {
  readonly tempFilePaths?: readonly string[]
  readonly tempFiles?: readonly UniPickedImage[]
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

const imageMimeByExtension: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
}
const imageExtensionByMime: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tiff',
}

function pickedName(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 500
    && !/[\/\\\u0000-\u001f\u007f]/.test(raw) ? raw : undefined
}
function imageResult(result: UniChooseImageResult, source: 'camera' | 'library'): PlatformDriverResult {
  const files = result.tempFiles ?? []
  const paths = result.tempFilePaths ?? files.map((file) => file.path ?? '')
  const media = paths.flatMap((path, index) => {
    if (!path.trim()) return []
    // Prefer explicit path binding. Pathless H5 Files are ordered alongside
    // tempFilePaths by the same callback; never ignore a contradictory path.
    const file = files.find((item) => item.path === path)
      ?? (files.length === paths.length && !files[index]?.path ? files[index] : undefined)
    const originalName = pickedName(file?.name)
    const pathName = !/^(?:blob:|data:)/i.test(path)
      ? pickedName(path.split('/').pop()?.split(/[?#]/)[0]) : undefined
    const name = originalName ?? pathName
    const extension = name?.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase()
    const declaredMime = typeof file?.type === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type)
      ? file.type.toLowerCase() : undefined
    // Unknown metadata stays unknown, so downstream image policy can reject
    // it. Do not turn a blob UUID (or a video) into an invented JPEG.
    const mimeType = declaredMime ?? (extension ? imageMimeByExtension[extension] : undefined)
      ?? 'application/octet-stream'
    const fallbackExtension = imageExtensionByMime[mimeType]
    const uploadName = extension ? name : fallbackExtension ? `image-${index + 1}.${fallbackExtension}` : name
    return [{
      ref: `local-media-${Date.now()}-${index}-${path}`,
      localPath: path,
      mimeType,
      source,
      capturedAt: new Date().toISOString(),
      ...(typeof file?.size === 'number' && Number.isFinite(file.size) && file.size >= 0 ? { size: file.size } : {}),
      ...(uploadName ? { name: uploadName } : {}),
    }]
  })
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
