import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import { workOrderListActionFor } from '@features/work-orders/list-actions'
import { workOrderDetailRouteFor } from '@features/work-orders/detail'
import { workOrderCategories } from '@features/work-orders/list-categories'

// Execute the actual SFC setup and lifecycle hooks; only transport/navigation are controlled.
const source = compileScript(parse(readFileSync('src/app/components/WorkbenchHome.vue', 'utf8')).descriptor, { id: 'workbench-navigation' }).content
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
function deferred() {
  let reject!: (error: Error) => void
  const promise = new Promise<void>((_, fail) => { reject = fail })
  return { promise, reject: () => reject(new Error('Synthetic navigation failure')) }
}
function harness() {
  const session = Vue.reactive<any>({ session: { sessionRef: 's', user: { id: 'u' }, currentRole: { id: 'r', name: '工程师' }, capabilityNames: ['work-order.read'] } })
  const orders = [{ id: 'next-order' }, { id: 'schedule-order' }]
  const board = Vue.reactive<any>({ state: 'ready', next: { order: orders[0] }, tasks: [{ order: orders[1] }],
    clear: vi.fn(() => { board.state = 'idle' }), refresh: vi.fn(async () => { board.state = 'ready' }),
  })
  const list = { items: orders, selectWorkKind: vi.fn(async () => ({ state: 'succeeded' })), navigateTo: vi.fn(async (_url: string) => {}) }
  const hooks: Record<string, () => void> = {}
  const imports: Record<string, any> = {
    vue: { ...Vue, onBeforeUnmount: (fn: () => void) => { hooks.unmount = fn } },
    '@dcloudio/uni-app': { onHide: (fn: () => void) => { hooks.hide = fn }, onShow: (fn: () => void) => { hooks.show = fn } },
    '@brand-ui/home-brand': { homeBrand: {} }, '@app/main-navigation': { openMainRoute: vi.fn() },
    '@shared/state': { useSessionStore: () => session }, '@features/home/workbench': { useWorkbenchStore: () => board },
    '@features/work-orders/list': { useWorkOrderListStore: () => list },
    '@features/work-orders/list-categories': { workOrderCategories },
    '@features/work-orders/detail': { workOrderDetailRouteFor }, '@features/work-orders/list-actions': { workOrderListActionFor },
    '@features/work-orders/read-identity-scope': { workOrderReadScopeKey },
  }
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name.endsWith('.vue')) return { default: {} }
    if (!(name in imports)) throw new Error(name)
    return imports[name]
  }, module, module.exports)
  const scope = Vue.effectScope(), page = scope.run(() => module.exports.default.setup({}, { expose() {} }))!
  return { session, board, list, hooks, page, close() { hooks.unmount(); scope.stop() } }
}
const settle = async () => { await Promise.resolve(); await Vue.nextTick() }

describe('C1 task navigation failure recovery', () => {
  it.each(['next', 'schedule'] as const)('%s task failure is handled, explicitly retryable, and opens the same order after recovery', async kind => {
    const h = harness()
    try {
      const task = kind === 'next' ? h.board.next : h.board.tasks[0]
      h.list.navigateTo.mockRejectedValueOnce(new Error('Synthetic driver rejection'))
      await expect(h.page.openTask(task)).resolves.toBeUndefined()
      expect(h.board.state).toBe('error'); expect(h.page.feedback.value).toContain('重新加载后再试'); expect(h.page.navigating.value).toBe(false)
      await h.page.reloadWorkbench(); expect(h.board.state).toBe('ready'); expect(h.page.feedback.value).toBe('')
      await h.page.openTask(task)
      expect(h.list.navigateTo).toHaveBeenCalledTimes(2)
      expect(h.list.navigateTo).toHaveBeenLastCalledWith(workOrderDetailRouteFor(task.order.id))
      expect(h.page.feedback.value).toBe(''); expect(h.page.navigating.value).toBe(false)
    } finally { h.close() }
  })
  it.each(['leave-and-return', 'role-change-and-return'] as const)('late failure after %s cannot overwrite or unlock a newer task', async mode => {
    const h = harness(), old = deferred(), fresh = deferred()
    try {
      h.list.navigateTo.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise)
      const pending = h.page.openTask(h.board.next); await settle()
      if (mode === 'leave-and-return') { h.hooks.hide(); h.hooks.show() }
      else { h.session.session.currentRole.id = 'other'; h.session.session.currentRole.id = 'r' }
      await settle(); expect(h.board.state).toBe('ready')
      const newer = h.page.openTask(h.board.tasks[0]); await settle()
      old.reject(); await expect(pending).resolves.toBeUndefined()
      expect(h.board.state).toBe('idle'); expect(h.page.feedback.value).toBe(''); expect(h.page.navigating.value).toBe(true)
      fresh.reject(); await newer
      expect(h.board.state).toBe('error'); expect(h.page.navigating.value).toBe(false)
    } finally { h.close() }
  })
  it.each(['hide', 'unmount'] as const)('late rejection after %s leaves cleared state untouched', async hook => {
    const h = harness(), old = deferred()
    try {
      h.list.navigateTo.mockImplementationOnce(() => old.promise)
      const pending = h.page.openTask(h.board.next); await settle(); h.hooks[hook]()
      old.reject(); await expect(pending).resolves.toBeUndefined()
      expect(h.board.state).toBe('idle'); expect(h.page.feedback.value).toBe(''); expect(h.page.navigating.value).toBe(false)
    } finally { h.close() }
  })
})
