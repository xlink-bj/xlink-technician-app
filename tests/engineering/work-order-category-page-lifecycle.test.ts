import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import { workOrderCategories } from '@features/work-orders/list-categories'

const source = readFileSync('src/pages/work-orders/work-orders.vue', 'utf8')
const compiled = compileScript(parse(source).descriptor, { id: 'work-order-category-page' }).content
const js = ts.transpileModule(compiled, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r }); return { promise, resolve } }
function harness() {
  const pending = deferred(), old = { id: 'old', workflowNodes: [] }
  const session = Vue.reactive<any>({status: 'authenticated', session: {sessionRef: 'session', user: {id: 'user'}, currentRole: {id: 'role'}, capabilityNames: []}})
  const store = Vue.reactive<any>({searchText: 'old-search', category: 'to_accept', items: [old], loadState: 'succeeded',
    acceptOrder: vi.fn(() => pending.promise), navigateTo: vi.fn(), refresh: vi.fn(),
    selectCategory: vi.fn(async (value: string) => { store.category = value; store.items = [] }),
    clear: vi.fn(() => { store.searchText = ''; store.category = 'all'; store.items = [] }),
  })
  const cleanup: Array<() => void> = []
  const module = {exports: {} as any}
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name === 'vue') return {...Vue, onBeforeUnmount: (fn: () => void) => cleanup.push(fn)}
    if (name.endsWith('.vue')) return {default: {}}
    const imports: Record<string, any> = {
      '@features/home/access': {hasAuthenticatedSession: () => true},
      '@shared/config': {isProductionReadOnlyRuntime: () => false},
      '@features/work-orders/card': {},
      '@features/work-orders/detail': {workOrderDetailRouteFor: (id: string) => `detail/${id}`},
      '@features/work-orders/list-actions': {workOrderListActionFor: () => ({acceptOrder: {workflowNodeId: 'node'}})},
      '@features/work-orders/list': {useWorkOrderListStore: () => store},
      '@shared/state': {useSessionStore: () => session},
      '@features/work-orders/read-identity-scope': {workOrderReadScopeKey},
      '@features/work-orders/list-categories': {workOrderCategories},
      '@shared/ui/loading': {appLoadingSkeletonDelayMs: 120},
    }
    if (!(name in imports)) throw new Error(`Unexpected page import: ${name}`)
    return imports[name]
  }, module, module.exports)
  const scope = Vue.effectScope()
  const page = scope.run(() => module.exports.default.setup({}, {expose() {}}))!
  return {pending, old, session, store, page, close() {cleanup.forEach(fn => fn()); scope.stop()}}
}

describe('actual Work Order page category / identity lifecycle', () => {
  it('does not resurrect an old confirmation after category changes', async () => {
    const h = harness()
    const request = h.page.requestAccept(h.old)
    await h.page.selectCategory('following')
    h.pending.resolve({state: 'confirmation_required'})
    await request
    expect(h.page.acceptCandidate.value).toBeNull()
    expect(h.store.navigateTo).not.toHaveBeenCalled()
    h.close()
  })
  it('does not navigate a late accepted result after leaving its category', async () => {
    const h = harness()
    const request = h.page.requestAccept(h.old)
    await h.page.selectCategory('following')
    h.pending.resolve({state: 'succeeded'})
    await request
    expect(h.store.navigateTo).not.toHaveBeenCalled()
    h.close()
  })
  it('retains the initial search on detail return, but clears the draft on a new identity', async () => {
    const h = harness()
    expect(h.page.searchDraft.value).toBe('old-search')
    h.session.session = {...h.session.session, currentRole: {id: 'new-role'}}
    expect(h.page.searchDraft.value).toBe('')
    h.close()
  })
  it('logout and unmount invalidate in-flight page confirmations', async () => {
    const h = harness()
    const request = h.page.requestAccept(h.old)
    h.session.status = 'anonymous'; h.session.session = null
    expect(h.page.searchDraft.value).toBe('')
    h.close()
    h.pending.resolve({state: 'confirmation_required'})
    await request
    expect(h.page.acceptCandidate.value).toBeNull()
  })
  it('unmount alone invalidates a pending result', async () => {
    const h = harness()
    const request = h.page.requestAccept(h.old)
    h.close(); h.pending.resolve({state: 'confirmation_required'}); await request
    expect(h.page.acceptCandidate.value).toBeNull()
  })
  it('a refreshed list cannot confirm a row no longer present', async () => {
    const h = harness()
    const request = h.page.requestAccept(h.old)
    h.store.items = []
    h.pending.resolve({state: 'confirmation_required'}); await request
    expect(h.page.acceptCandidate.value).toBeNull()
    h.close()
  })
  it('a confirmed command cannot navigate over a later classification', async () => {
    const h = harness()
    h.page.acceptCandidate.value = h.old
    const request = h.page.confirmAccept()
    await h.page.selectCategory('onsite')
    h.pending.resolve({state: 'succeeded'}); await request
    expect(h.store.navigateTo).not.toHaveBeenCalled()
    h.close()
  })
  it('still allows a current confirmation and the explicitly accepted current result', async () => {
    const h = harness()
    const request = h.page.requestAccept(h.old)
    h.pending.resolve({state: 'confirmation_required'}); await request
    expect(h.page.acceptCandidate.value?.id).toBe('old')
    h.store.acceptOrder = vi.fn(async () => ({state: 'succeeded'}))
    await h.page.confirmAccept()
    expect(h.store.navigateTo).toHaveBeenCalledWith('detail/old')
    h.close()
  })
})
