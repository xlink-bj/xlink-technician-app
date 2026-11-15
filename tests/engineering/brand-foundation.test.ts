import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { compile } from 'sass'
import { rootPath } from '../../config/paths'
import { selectBrand } from '../../config/vite/brand-profile'

const read = (file: string) => readFileSync(rootPath(file), 'utf8')
const css = (file: string) => compile(rootPath(file), { style: 'expanded' }).css

describe('build-selected product foundation', () => {
  it('defaults to XLink and rejects unknown brands rather than silently falling back', () => {
    expect(selectBrand().id).toBe('xlink')
    expect(selectBrand('yuhong').styleDirectory).toBe(rootPath('src/brands/yuhong'))
    expect(() => selectBrand('')).toThrow('Unsupported application brand')
    expect(() => selectBrand('Yuhong')).toThrow('Unsupported application brand')
  })

  it('preserves the existing compiled XLink foundation exactly', () => {
    expect(css('src/brands/xlink/index.scss')).toBe(css('src/shared/ui/design-system.scss'))
    expect(css('src/brands/xlink/index.scss')).not.toContain('--yh-')
  })

  it('binds every existing shared foundation role without loading XLink styles', () => {
    const original = read('src/shared/ui/design-system.scss')
    const bridge = read('src/brands/yuhong/_semantic-bridge.scss')
    const roles = [...original.matchAll(/(--app-[\w-]+)\s*:/g)].map(match => match[1])
    for (const role of new Set(roles)) expect(bridge, role).toContain(`${role}:`)
    const built = css('src/brands/yuhong/index.scss')
    expect(built).toContain('--yh-action-primary: #C8202B')
    expect(built).toContain('--app-color-primary-action: var(--yh-action-primary)')
    expect(built).toContain('--app-link: var(--yh-link)')
    expect(built).toContain('--app-focus-ring: var(--yh-focus-ring)')
    expect(built).not.toContain('--xl-')
    expect(built).not.toContain('#2878f2')
    const defined = new Set([...built.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
    for (const [, reference] of built.matchAll(/var\((--[\w-]+)/g)) {
      expect(defined.has(reference), `unresolved ${reference}`).toBe(true)
    }
  })
})
