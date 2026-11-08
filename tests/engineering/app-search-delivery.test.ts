import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindH5InputDelivery } from '@shared/ui/h5-input-delivery'

class Field extends EventTarget {
  tagName = 'INPUT'
  value = ''
}
type Host = Field & { type: string; props: Record<string, any>; children: Host[]; parent: Host | null; text: string }
function host(type: string, text = ''): Host {
  return Object.assign(new Field(), { tagName: type.toUpperCase(), type, props: {}, children: [], parent: null, text })
}
// Model only uni's delayed public boundary. Execute the actual compiled SFC.
const renderer = Vue.createRenderer<Host, Host>({
  patchProp(el, key, _old, value) { el.props[key] = value; if (key === 'value') el.value = String(value ?? '') },
  insert(el, parent, anchor = null) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el) },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  createElement(type) {
    const el = host(type)
    if (type === 'input') el.addEventListener('input', () => {
      const value = el.value
      setTimeout(() => el.props.onInput?.({ detail: { value } }), 100)
    })
    return el
  },
  createText: text => host('#text', text), createComment: text => host('#comment', text),
  setText(el, text) { el.text = text }, setElementText(el, text) { el.text = text },
  parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
function component(platform: 'h5' | 'mp-weixin' | 'app') {
  const filename = path.resolve('src/shared/ui/AppSearchBar.vue')
  let raw = fs.readFileSync(filename, 'utf8')
  if (platform !== 'h5') {
    const require = createRequire(import.meta.url)
    const uniRequire = createRequire(require.resolve('@dcloudio/vite-plugin-uni/package.json'))
    const { preprocess } = uniRequire('@dcloudio/uni-cli-shared/lib/preprocess')
    raw = preprocess(raw, { H5: false, MP_WEIXIN: platform === 'mp-weixin', APP: platform === 'app' }, { type: 'js' })
    expect(raw).not.toContain('bindH5InputDelivery')
    expect(raw).not.toContain('bindImeConfirmGuard')
  }
  const { descriptor } = parse(raw, { filename })
  const source = compileScript(descriptor, { id: 'app-search-delivery', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name === 'vue') return Vue
    if (name === './h5-input-delivery') return { bindH5InputDelivery }
    if (name === './AppIcon.vue') return { default: Vue.defineComponent({ render: () => Vue.h('icon') }) }
    throw Error(`Unexpected import ${name}`)
  }, module, module.exports)
  return module.exports.default
}
function find(root: Host, type: string): Host | undefined {
  if (root.type === type) return root
  for (const child of root.children) { const found = find(child, type); if (found) return found }
}
async function mount(platform: 'h5' | 'mp-weixin' | 'app' = 'h5') {
  const root = host('root'), model = Vue.ref(''), disabled = Vue.ref(false)
  const updates: string[] = [], searches: string[] = [], order: string[] = []
  const SFC = component(platform)
  const app = renderer.createApp({ setup: () => () => Vue.h(SFC, {
    modelValue: model.value, disabled: disabled.value,
    'onUpdate:modelValue': (value: string) => { model.value = value; updates.push(value); order.push('update') },
    onSearch: () => { searches.push(model.value); order.push('search') },
  }) })
  app.mount(root); await Vue.nextTick()
  const field = find(root, 'input')!, button = find(root, 'button')!
  const input = (value: string, type = 'input', composing = false) => {
    field.value = value
    const event = new Event(type)
    Object.defineProperty(event, 'isComposing', { value: composing })
    field.dispatchEvent(event)
  }
  return { app, field, button, model, disabled, input, updates, searches, order }
}
afterEach(() => vi.useRealTimers())
describe('actual AppSearchBar delivery and search ordering', () => {
  it.each(['button', 'confirm'])('publishes the last rapid value before %s without a render tick', async action => {
    vi.useFakeTimers()
    const h = await mount()
    h.input('李先生'); await vi.advanceTimersByTimeAsync(22); h.input('张先生')
    expect(h.searches).toEqual([])
    if (action === 'button') h.button.props.onTap()
    else h.field.props.onConfirm({ detail: { value: '张先生' } })
    expect(h.searches).toEqual(['张先生'])
    expect(h.updates).toEqual(['李先生', '张先生'])
    h.app.unmount(); await vi.runAllTimersAsync()
    expect(h.updates).toEqual(['李先生', '张先生'])
  })
  it('keeps IME preedit private, then searches the committed string once', async () => {
    vi.useFakeTimers()
    const h = await mount()
    h.input('', 'compositionstart'); h.input('zhang', 'input', true)
    expect(h.updates).toEqual([])
    h.input('张先生', 'compositionend'); h.input('张先生')
    h.field.props.onConfirm({ detail: { value: '张先生' } })
    expect(h.updates).toEqual(['张先生']); expect(h.searches).toEqual(['张先生'])
    h.app.unmount()
  })
  it.each([
    { start: true, flag: true }, { start: true, flag: false }, { start: false, flag: true },
  ])('blocks only composing Enter and removes the target guard on disposal ($start/$flag)', async ({ start, flag }) => {
    vi.useFakeTimers()
    const h = await mount()
    h.input('李先生')
    if (start) h.input('李先生', 'compositionstart')
    h.input('preedit', 'input', true)
    // Node EventTarget has no browser phase traversal. The real H5 gate proves
    // capture beats uni's existing target listener; here assert guard semantics.
    const uniKeyup = vi.fn(() => h.field.props.onConfirm({ detail: { value: h.field.value } }))
    h.field.addEventListener('keyup', uniKeyup)
    const keyup = (isComposing: boolean) => {
      const event = new Event('keyup', { cancelable: true })
      Object.defineProperties(event, { key: { value: 'Enter' }, isComposing: { value: isComposing } })
      h.field.dispatchEvent(event)
      return event
    }
    expect(keyup(flag).defaultPrevented).toBe(false) // Do not suppress browser IME commitment.
    expect(uniKeyup).not.toHaveBeenCalled()
    expect(h.searches).toEqual([]); expect(h.updates).toEqual(['李先生'])
    h.input('张先生', 'compositionend'); h.input('张先生'); keyup(false)
    expect(uniKeyup).toHaveBeenCalledTimes(1)
    expect(h.searches).toEqual(['张先生']); expect(h.updates).toEqual(['李先生', '张先生'])
    h.app.unmount(); keyup(true)
    expect(uniKeyup).toHaveBeenCalledTimes(2) // Capture listener was removed.
    expect(h.searches).toEqual(['张先生'])
  })
  it('keeps external resets and final empty input across stale public events', async () => {
    vi.useFakeTimers()
    const h = await mount()
    h.input('old'); h.input('draft'); h.model.value = 'server'
    await Vue.nextTick(); await vi.runAllTimersAsync()
    expect(h.model.value).toBe('server'); expect(h.field.value).toBe('server')
    h.input(''); h.button.props.onTap()
    expect(h.searches).toEqual(['']); expect(h.updates).toEqual(['old', 'draft', ''])
    h.app.unmount()
  })
  it('ignores native/public input, confirm and tap while disabled or disposed', async () => {
    vi.useFakeTimers()
    const h = await mount()
    h.disabled.value = true; await Vue.nextTick()
    const attempt = () => {
      h.input('forged'); h.field.props.onInput({ detail: { value: 'forged' } })
      h.field.props.onConfirm({ detail: { value: 'forged' } }); h.button.props.onTap()
    }
    attempt(); expect(h.updates).toEqual([]); expect(h.searches).toEqual([])
    h.disabled.value = false; await Vue.nextTick(); h.app.unmount(); attempt()
    await vi.runAllTimersAsync()
    expect(h.updates).toEqual([]); expect(h.searches).toEqual([])
  })
  it.each(['mp-weixin', 'app'] as const)('retains ordinary input and confirm detail before search after real %s preprocessing', async platform => {
    const h = await mount(platform)
    h.field.props.onInput({ detail: { value: '0001234567890123456789' } })
    expect(h.searches).toEqual([])
    h.button.props.onTap()
    h.field.props.onConfirm({ detail: { value: '新词' } })
    h.field.props.onConfirm({ detail: { value: '' } })
    expect(h.searches).toEqual(['0001234567890123456789', '新词', ''])
    expect(h.order).toEqual(['update', 'search', 'update', 'search', 'update', 'search'])
    h.field.props.onConfirm({ detail: {} })
    expect(h.updates).toHaveLength(3) // Missing detail is not an accidental clear.
    h.disabled.value = true; await Vue.nextTick()
    h.field.props.onInput({ detail: { value: 'blocked' } }); h.field.props.onConfirm({ detail: { value: 'blocked' } }); h.button.props.onTap()
    expect(h.updates).toHaveLength(3); expect(h.searches).toHaveLength(4)
    h.app.unmount()
  })
})
