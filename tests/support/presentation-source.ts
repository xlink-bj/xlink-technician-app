import { readFileSync } from 'node:fs'

/** Follow the same selected skin boundary as Sass for source-contract checks. */
export function presentationSource(path: string, brand: 'xlink' | 'yuhong' = 'xlink'): string {
  const read = (file: string) => readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8')
  return read(path).replace(/@import ["']@brand-ui\/([a-z-]+\.scss)["'];/g,
    (_, file: string) => read(`brands/${brand}/${file}`))
}
