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
})
