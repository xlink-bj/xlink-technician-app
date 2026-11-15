import { readFileSync } from 'node:fs'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'
import { rootPath } from '../../config/paths'

describe('build-selected signing read presentation', () => {
  it('keeps the XLink appearance separate from the Yuhong product', () => {
    const xlink = compile(rootPath('src/brands/xlink/signing-read.scss')).css
    expect(xlink).toContain('var(--xl-ink)')
    expect(xlink).not.toContain('--yh-')
    const foundation = compile(rootPath('src/brands/yuhong/index.scss')).css
    const yuhong = compile(rootPath('src/brands/yuhong/signing-read.scss')).css
    expect(yuhong).not.toMatch(/var\(--xl-|#(?:1769dc|7b8aa0|74859a)/i)
    const declared = new Set([...(foundation + yuhong).matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
    for (const [, token] of yuhong.matchAll(/var\((--[\w-]+)/g)) expect(declared.has(token), token).toBe(true)
  })
  it('selects page appearance without adding runtime brand conditions', () => {
    const page = readFileSync(rootPath('src/pages/work-orders/signing-order-read.vue'), 'utf8')
    expect(page).toContain('@import "@brand-ui/signing-read.scss"')
    const script = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
    expect(script).not.toContain('VITE_XLINK_BRAND')
  })
})
