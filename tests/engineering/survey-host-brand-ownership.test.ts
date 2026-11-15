import { readFileSync } from 'node:fs'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'
import { rootPath } from '../../config/paths'

describe('build-selected normal form host appearance', () => {
  it('resolves every Yuhong host token and keeps XLink paint isolated', () => {
    const foundation = compile(rootPath('src/brands/yuhong/index.scss')).css
    const host = compile(rootPath('src/brands/yuhong/node-forms-read.scss')).css
    const declared = new Set([...foundation.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
    for (const [, token] of host.matchAll(/var\((--[\w-]+)/g)) expect(declared.has(token), token).toBe(true)
    expect(host).not.toMatch(/var\(--(?:app|xl)-|#[0-9a-f]{3,8}\b/i)
    expect(compile(rootPath('src/brands/xlink/node-forms-read.scss')).css).not.toContain('--yh-')
  })
  it('selects the host stylesheet at build time and leaves shared controls with their owners', () => {
    const source = readFileSync(rootPath('src/features/work-orders/R1NodeFormsReadPanel.vue'), 'utf8')
    expect(source).toContain('@import "@brand-ui/node-forms-read.scss"')
    expect(source).not.toContain('VITE_XLINK_BRAND')
    const host = readFileSync(rootPath('src/brands/yuhong/node-forms-read.scss'), 'utf8')
    expect(host).not.toMatch(/\.app-button|\.app-input|\.r1-file-/)
  })
})
