import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import { workOrderCategories } from '@features/work-orders/list-categories'

// Actual SFC template/events and actual Pinia load lifecycle. Visual primitives
// and independent action eligibility are controls, never list authority.
interface Host { type: string; props: Record<string, any>; children: Host[]; parent: Host | null }
const node = (type: string): Host => ({ type, props: {}, children: [], parent: null })
const renderer = Vue.createRenderer<Host, Host>({
  patchProp(el, key, _previous, value) { el.props[key] = value },
  insert(el, parent, anchor = null) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el) },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  createElement: node, createText: () => node('#text'), createComment: () => node('#comment'),
  setText() {}, setElementText() {}, parentNode: el => el.parent,
  nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
function find(el: Host): Host | undefined { if (el.props.class === 'work-order-card') return el; for (const c of el.children) { const found = find(c); if (found) return found } }
const settle = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); await Vue.nextTick() } }
function deferred() { let resolve!: (value: any) => void; return { promise: new Promise<any>(r => { resolve = r }), resolve: (v: any) => resolve(v) } }
async function mounted() {
  const pinia = createPinia(); setActivePinia(pinia)
  const session = Vue.reactive<any>({ status: 'authenticated', session: { sessionRef: 'synthetic', user: { id: 'user' }, currentRole: { id: 'role' }, capabilityNames: [] } })
  const store = useWorkOrderListStore(), navigate = vi.fn(async () => {})
  const item = { id: 'synthetic-work', workflowNodes: [] }
  const success = (items = [item]) => ({ state: 'succeeded', data: { items, page: 1, pageSize: 20, totalCount: 40 } })
  const read = vi.fn(async () => success())
  store.configureApi({ listWorkOrders: read } as never, () => session.session)
  store.configureNavigation({ navigate } as never)
  const primitive = { __esModule: true, default: Vue.defineComponent({ inheritAttrs: false, setup: (_, ctx) => () => Vue.h('primitive', ctx.attrs, ctx.slots.default?.()) }) }
  const source = compileScript(parse(readFileSync('src/pages/work-orders/work-orders.vue', 'utf8')).descriptor, { id: 'refresh-navigation-test', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text', 'button', 'navigator', 'scroll-view'].includes(tag) } } }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const imports: Record<string, any> = {
    vue: Vue, '@features/home/access': { hasAuthenticatedSession: (s: string) => s === 'authenticated' },
    '@shared/config': { isProductionReadOnlyRuntime: () => false },
    '@features/work-orders/card': { workOrderCardToneFor: () => '', workOrderCardIconFor: () => '', workOrderCardIconColorFor: () => '' },
    '@features/work-orders/detail': { workOrderDetailRouteFor: (id: string) => 'detail/' + id },
    '@features/work-orders/list-actions': { workOrderListActionFor: () => ({ detailAccessible: true }) },
    '@features/work-orders/list': { useWorkOrderListStore: () => store }, '@shared/state': { useSessionStore: () => session },
    '@features/work-orders/read-identity-scope': { workOrderReadScopeKey }, '@features/work-orders/list-categories': { workOrderCategories },
    '@shared/ui/loading': { appLoadingSkeletonDelayMs: 120 },
  }
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((key: string) => { if (key.endsWith('.vue')) return primitive; if (!(key in imports)) throw Error(key); return imports[key] }, module, module.exports)
  const root = node('root'), app = renderer.createApp(module.exports.default); app.use(pinia); app.mount(root); await settle()
  return { store, session, navigate, read, success, card: () => find(root), close: () => app.unmount() }
}
describe('normal list cached-card navigation during a new intent', () => {
  it('disables semantics and repeated real tap handlers until fresh search succeeds', async () => {
    const h = await mounted(), pending = deferred()
    try {
      h.read.mockImplementationOnce(() => pending.promise)
      const request = h.store.search('synthetic'); await settle()
      const card = h.card()!
      expect(card).toBeDefined(); expect(card.props['aria-disabled']).toBe(true)
      expect(card.props.role).toBeUndefined(); expect(card.props['hover-class']).toBe('none')
      await card.props.onTap(); await card.props.onTap(); expect(h.navigate).not.toHaveBeenCalled()
      pending.resolve(h.success()); await request; await settle()
      expect(h.card()!.props['aria-disabled']).toBe(false); expect(h.card()!.props.role).toBe('link')
      await h.card()!.props.onTap(); expect(h.navigate).toHaveBeenCalledTimes(1); expect(h.navigate).toHaveBeenCalledWith('detail/synthetic-work')
    } finally { pending.resolve(h.success()); h.close() }
  })
  it('guards detached taps after failure and only recovers on fresh success', async () => {
    const h = await mounted(), pending = deferred(); const old = h.card()!
    try {
      h.read.mockImplementationOnce(() => pending.promise); const request = h.store.refresh(); await settle()
      await old.props.onTap(); expect(h.navigate).not.toHaveBeenCalled()
      pending.resolve({ state: 'failed_retryable', error: { category: 'network', message: 'Synthetic read failure' } }); await request; await settle()
      expect(h.card()).toBeUndefined(); await old.props.onTap(); expect(h.navigate).not.toHaveBeenCalled()
      await h.store.refresh(); await settle(); await h.card()!.props.onTap(); expect(h.navigate).toHaveBeenCalledTimes(1)
    } finally { pending.resolve(h.success()); h.close() }
  })
  it('keeps already listed cards usable during same-intent append', async () => {
    const h = await mounted(), pending = deferred()
    try {
      let settled = false
      h.read.mockImplementationOnce(() => pending.promise)
      const request = h.store.loadMore(); void request.then(() => { settled = true }); await settle()
      expect(h.read).toHaveBeenCalledTimes(2)
      expect(h.read).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
      expect(h.store.loadState).toBe('loading'); expect(h.store.isAppending).toBe(true)
      expect(settled).toBe(false)
      expect(h.card()!.props['aria-disabled']).toBe(false); await h.card()!.props.onTap(); expect(h.navigate).toHaveBeenCalledTimes(1)
      const next = h.success([{ id: 'synthetic-page2', workflowNodes: [] }])
      pending.resolve({ ...next, data: { ...next.data, page: 2 } }); await request; await settle()
      expect(settled).toBe(true); expect(h.store.loadState).toBe('succeeded'); expect(h.store.isAppending).toBe(false)
      expect(h.store.page).toBe(2)
      expect(h.store.items.map(item => item.id)).toEqual(['synthetic-work', 'synthetic-page2'])
      expect(h.card()!.props['aria-disabled']).toBe(false)
    } finally { pending.resolve(h.success()); h.close() }
  })
  it.each(['role', 'logout'])('does not navigate old cards after %s invalidates a pending read', async kind => {
    const h = await mounted(), pending = deferred(); const old = h.card()!
    try {
      h.read.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(h.success([])); const request = h.store.refresh(); await settle()
      if (kind === 'role') h.session.session = { ...h.session.session, currentRole: { id: 'other-role' } }
      else { h.session.status = 'anonymous'; h.session.session = null }
      await settle(); await old.props.onTap(); expect(h.navigate).not.toHaveBeenCalled()
      pending.resolve(h.success()); await request; await settle()
      if (kind === 'logout') expect(h.card()).toBeUndefined()
    } finally { pending.resolve(h.success()); h.close() }
  })
})
