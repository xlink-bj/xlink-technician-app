import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
const home = parse(source('pages/index/index.vue')).descriptor
const list = parse(source('pages/work-orders/work-orders.vue')).descriptor
const detail = parse(source('pages/work-orders/detail.vue')).descriptor
const css = (descriptor: typeof home) => descriptor.styles.map(style => style.content
  .replace(/@import ["']@brand-ui\/([a-z-]+\.scss)["'];/g,
    (_, file: string) => source(`brands/xlink/${file}`))).join('\n')

describe('baseline page-local presentation safeguards (source contracts)', () => {
  it('owns system typography at the three page roots, without a body/global font reset', () => {
    for (const [descriptor, root] of [[home, 'home-page'], [list, 'work-orders-page'], [detail, 'detail-page']] as const) {
      expect(css(descriptor)).toMatch(new RegExp(`\\.${root}\\s*\\{[^}]*font-family:[^;]*-apple-system[^;]*"PingFang SC"[^;]*sans-serif;`))
      expect(css(descriptor)).not.toMatch(/(?:^|\n)\s*(?:body|html|:root|\*)\s*\{[^}]*font-family:/)
    }
  })
  it('keeps native buttons and root replacement for the work entry', () => {
    const workbench = source('app/components/WorkbenchHome.vue')
    expect(workbench).toContain('class="c1-shortcut"')
    expect(workbench).toContain("openMainRoute('workOrders')")
    expect(workbench).toContain('await list.navigateTo(workOrderDetailRouteFor(current.id))')
    expect(workbench).not.toMatch(/render-link|navigator-wrap|v-html|querySelector|inject.*CSS/)
  })
  it('includes footer padding in its existing full width rather than hiding or clipping overflow', () => {
    expect(css(home)).toMatch(/\.home-footer\s*\{\s*box-sizing: border-box;\s*padding: 44rpx 24rpx 0;/)
    expect(css(home)).not.toMatch(/\.home-(?:page|footer)\s*\{[^}]*overflow(?:-x)?:\s*(?:hidden|clip)/)
  })
})
