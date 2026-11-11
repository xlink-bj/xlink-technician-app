import { isR1FileWireArray, type LocalMedia, type R1FileWireValue } from '@shared/types'

const extensions: Readonly<Record<string, readonly string[]>> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'],
}
const imageExtensions = new Set(Object.values(extensions).flat())
const record = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Validate the supplied bytes without trimming, URL serialization or deriving
 * an object key from its path. Signed query strings must remain byte-for-byte. */
export function isR1NormalImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://') || /[\s\\\p{Cc}\p{Cf}]/u.test(value)
    || /%(?![0-9a-f]{2})/i.test(value)) return false
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1]
  if (!authority || authority.includes('@') || authority.endsWith(':')) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password
  } catch { return false }
}

/** The normal default-image slice is narrower than the global R1 file codec.
 * It does not change historical typed forms or make any upload/write grant. */
export function isR1NormalImageWireArray(value: unknown): value is readonly R1FileWireValue[] {
  return isR1FileWireArray(value) && Object.keys(value).length === value.length
    && value.every(item => imageExtensions.has(item.extname.toLowerCase()) && isR1NormalImageUrl(item.url))
}

/** MIME is explicit local evidence; an available filename suffix must agree.
 * Missing suffix is not inferred from localPath or a remote URL/object key. */
export function isR1NormalImageMedia(value: LocalMedia): boolean {
  if (!record(value) || typeof value.mimeType !== 'string') return false
  const mime = value.mimeType.toLowerCase()
  const allowed = Object.hasOwn(extensions, mime) ? extensions[mime] : undefined
  if (!allowed) return false
  if (value.name === undefined) return true
  if (typeof value.name !== 'string' || !value.name.trim() || /[\p{Cc}\p{Cf}]/u.test(value.name)) return false
  const dot = value.name.lastIndexOf('.')
  return dot < 0 || allowed.includes(value.name.slice(dot + 1).toLowerCase())
}

/** SOURCE common.js default is image. Only absent fileType is proved here;
 * explicit strings/arrays/objects (including "image") need a separate slice.
 * Other config keys are still validated by the caller's raw metadata rules. */
export function isR1DefaultImageFieldConfig(rawField: unknown): boolean {
  if (!record(rawField) || rawField.type !== 'file') return false
  if (!Object.hasOwn(rawField, 'frontEndConfig')) return true
  let config: unknown = rawField.frontEndConfig
  if (typeof config === 'string') {
    try { config = JSON.parse(config) } catch { return false }
  }
  if (!record(config) || (Object.getPrototypeOf(config) !== Object.prototype && Object.getPrototypeOf(config) !== null)) return false
  return !Object.hasOwn(config, 'fileType')
}
