import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compile } from 'sass'
import { rootPath } from '../../config/paths'

const css = (brand: string, part: string) => compile(rootPath(`src/brands/${brand}/${part}.scss`)).css
describe('independent quotation appearance', () => {
  it('keeps the accepted XLink paint in its selected profile', () => {
    const value = css('xlink', 'quotation')
    expect(value).toContain('--q03-action: #176dde')
    expect(value).toContain('--quotation-catalog-icon: #257bf1')
    expect(value).not.toContain('--yh-')
  })
  it('resolves Yuhong quotation roles without loading the XLink palette', () => {
    const foundation = css('yuhong', 'index')
    const quotation = ['quotation', 'quotation-entry', 'quotation-hub', 'quotation-workspace'].map(part => css('yuhong', part)).join('\n')
    const declared = new Set([...(foundation + quotation).matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
    for (const [, reference] of quotation.matchAll(/var\((--[\w-]+)/g)) expect(declared.has(reference), reference).toBe(true)
    expect(quotation).not.toMatch(/#(?:176dde|257bf1|2878f2)|--q01-blue|--xl-/i)
  })
  it('selects styles without adding a brand condition to quotation behavior', () => {
    for (const file of ['QuotationActionContent.vue', 'Q01EntryScreen.vue', 'QuotationOrderHub.vue']) {
      const source = readFileSync(rootPath(`src/features/work-orders/quotation/${file}`), 'utf8')
      const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
      expect(script).not.toContain('VITE_XLINK_BRAND')
      expect(source).toContain('@brand-ui/quotation')
    }
  })
})
