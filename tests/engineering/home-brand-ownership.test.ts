import { readFileSync } from 'node:fs'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'
import { rootPath } from '../../config/paths'
import { homeBrand as xlink } from '../../src/brands/xlink/home-brand'
import { homeBrand as yuhong } from '../../src/brands/yuhong/home-brand'

describe('independent Home/Login presentation', () => {
  it('keeps product identity build-selected without changing service or login semantics', () => {
    expect(xlink).toEqual({ name: '修链', tagline: '家装服务' })
    expect(yuhong).toEqual({ name: '雨虹', tagline: '家装服务' })
    const page = readFileSync(rootPath('src/pages/index/index.vue'), 'utf8')
    expect(page).toContain("from '@brand-ui/home-brand'")
    expect(page).toContain('@import "@brand-ui/home.scss"')
    expect(page).toContain('setHomePageTitle(homeBrand.name)')
    expect(page).not.toContain('VITE_XLINK_BRAND')
  })
  it('keeps the accepted XLink page appearance in its own profile', () => {
    const css = compile(rootPath('src/brands/xlink/home.scss')).css
    expect(css).toContain('#0876ff')
    expect(css).toContain('#1f77f0')
    expect(css).not.toContain('--yh-')
  })
  it('resolves authoritative Yuhong roles without loading the XLink palette', () => {
    const foundation = compile(rootPath('src/brands/yuhong/index.scss')).css
    const page = compile(rootPath('src/brands/yuhong/home.scss')).css
    const declared = new Set([...(foundation + page).matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
    for (const [, reference] of page.matchAll(/var\((--[\w-]+)/g)) {
      expect(declared.has(reference) || ['--window-top', '--window-bottom'].includes(reference), reference).toBe(true)
    }
    expect(page).not.toMatch(/#(?:0876ff|1f77f0|1478f2)|linear-gradient|--xl-/i)
    expect(page).toContain('var(--yh-color-action-disabled-bg)')
    expect(page).toContain('var(--yh-focus-ring)')
  })
})
