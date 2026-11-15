import { rootPath } from '../paths'

/** Build-time presentation only. Unknown product names stop the build. */
export function selectBrand(value?: string) {
  const id = value ?? 'xlink'
  if (id !== 'xlink' && id !== 'yuhong') throw new Error(`Unsupported application brand: ${id}`)
  return { id, styleDirectory: rootPath('src/brands', id) }
}
