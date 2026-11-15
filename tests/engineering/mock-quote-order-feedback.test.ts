import fs from 'node:fs'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'

type Host = { type: string; props: Record<string, any>; children: Host[]; parent: Host | null; text: string }
const node = (type: string, text = ''): Host => ({ type, text, props: {}, children: [], parent: null })
const renderer = Vue.createRenderer<Host, Host>({
  patchProp: (n, k, _old, value) => { n.props[k] = value },
  insert(n, p, anchor = null) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = p; const i = anchor ? p.children.indexOf(anchor) : -1; p.children.splice(i < 0 ? p.children.length : i, 0, n) },
  remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null },
  createElement: t => node(t), createText: t => node('#text', t), createComment: t => node('#comment', t),
  setText: (n, t) => { n.text = t }, setElementText: (n, t) => { n.text = t; n.children = [] },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
})
const Primitive = Vue.defineComponent({ inheritAttrs: false, props: ['disabled', 'message'], emits: ['tap'],
  setup: (p, c) => () => Vue.h('primitive', { ...c.attrs, disabled: p.disabled, onTap: () => c.emit('tap') }, [p.message, ...(c.slots.default?.() ?? [])]) })
function find(n: Host, id: string): Host | undefined { return n.props['data-testid'] === id ? n : n.children.map(c => find(c, id)).find(Boolean) }
const content = (n: Host): string => n.text + n.children.map(content).join('')
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await Vue.nextTick() } }

async function mount(result: { state: string; message: string }, nextStatus: string, options: { dispatch?: boolean; initialStatus?: string } = {}) {
  const engine = { state: 'ready', draftVersion: 1, payload: { totalPrice: 107 }, pricing: { calcTotalPrice: { totalPrice: 107 } } }
  const workspace = Vue.reactive({ quotationEngine: { result: engine }, detail: { quotationCatalogContext: { serviceType: '40' } } })
  const composition = Vue.reactive({ draft: { draftVersion: 1 }, quantityErrorBySelection: {} as Record<string, string>, selectionCount: 2, groups: [{}], flushDraft: vi.fn(async () => ({ state: 'succeeded' })) })
  const session = { session: { user: { id: 'synthetic-user' }, currentRole: { id: 'synthetic-role' }, sessionRef: 'synthetic-session' } }
  const oldMessage = '订单保存结果尚未确认；请只读核对，不能重复提交。'
  const controller = { readStatus: vi.fn().mockResolvedValueOnce(options.initialStatus ?? 'quote_created').mockResolvedValue(nextStatus),
    convertQuoteToOrder: vi.fn(async () => ({ state: 'uncertain', message: oldMessage })),
    createQuote: vi.fn(), verifyPending: vi.fn(async () => result) }
  const source = compileScript(parse(fs.readFileSync('src/features/work-orders/quotation/AStageMockQuoteOrderPanel.vue', 'utf8')).descriptor,
    { id: 'mock-order-feedback', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const modules: Record<string, any> = { vue: Vue, '../action-workspace': { useActionWorkspaceStore: () => workspace },
    './composition-store': { useQuotationCompositionStore: () => composition }, '@shared/state': { useSessionStore: () => session } }
  const module = { exports: {} as any }
  new Function('require', 'exports', 'module', js)((name: string) => name.endsWith('.vue') ? { __esModule: true, default: Primitive } : modules[name], module.exports, module)
  const root = node('root'), app = renderer.createApp({ render: () => Vue.h(module.exports.default, { createController: () => controller }) })
  app.mount(root); await settle()
  const tap = async (id: string) => { const button = find(root, id)!; expect(button).toBeDefined(); expect(button.props.disabled).toBeFalsy(); button.props.onTap(); await settle() }
  if (options.dispatch !== false) {
    await tap('a-stage-order-convert'); await tap('a-stage-order-convert-confirm')
    expect(content(root)).toContain(oldMessage)
  }
  return { app, root, tap, controller, oldMessage, workspace, composition }
}

describe('actual Mock quote Order result feedback', () => {
  it.each([['ready', 'a-stage-order-create', 'a-stage-order-confirm'], ['quote_created', 'a-stage-order-convert', 'a-stage-order-convert-confirm']])('refuses invalid visible quantities at %s even when the last valid engine result remains ready', async (initialStatus, entry, confirm) => {
    const f = await mount({ state: 'confirmed', message: '已核对' }, 'succeeded', { dispatch: false, initialStatus })
    try {
      await f.tap(entry)
      f.composition.quantityErrorBySelection.line = '请输入大于 0 的数量'
      await settle()
      const button = find(f.root, confirm)!
      expect(button.props.disabled).toBe(true)
      button.props.onTap(); await settle()
      expect(f.controller.createQuote).not.toHaveBeenCalled()
      expect(f.controller.convertQuoteToOrder).not.toHaveBeenCalled()
      delete f.composition.quantityErrorBySelection.line; await settle()
      expect(find(f.root, confirm)!.props.disabled).toBe(false)
    } finally { f.app.unmount() }
  })
  it.each([
    ['confirmed', 'succeeded', '已按返回的订单编号核对订单及金额；签约仍需单独核验。'],
    ['not_found', 'uncertain', '暂未确认匹配订单；请求是否执行仍未知，不能再次提交。'],
    ['unknown', 'uncertain', '订单已回读，但防重状态无法更新。'],
    ['blocked', 'uncertain', '当前浏览器无法安全锁定结果核对。'],
  ])('replaces obsolete feedback with %s while retaining the result guard', async (state, status, message) => {
    const f = await mount({ state, message }, status)
    try {
      await f.tap('a-stage-order-verify')
      expect(content(f.root)).toContain(message)
      expect(content(f.root)).not.toContain(f.oldMessage)
      expect(find(f.root, 'a-stage-order-convert')).toBeUndefined()
      expect(find(f.root, 'a-stage-order-create')).toBeUndefined()
      expect(f.controller.convertQuoteToOrder).toHaveBeenCalledTimes(1)
      expect(f.controller.createQuote).not.toHaveBeenCalled()
      expect(Boolean(find(f.root, 'a-stage-order-readback'))).toBe(state === 'confirmed')
      expect(Boolean(find(f.root, 'a-stage-order-verify'))).toBe(state !== 'confirmed')
    } finally { f.app.unmount() }
  })
})
