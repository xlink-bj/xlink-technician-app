import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as inputValidity from '@shared/ui/form-input-validity'
import { bindH5InputDelivery } from '@shared/ui/h5-input-delivery'

class Field extends EventTarget {
  tagName = 'INPUT'
  value = ''
}
function send(field: Field, value: string, type = 'input', composing = false) {
  field.value = value
  const event = new Event(type)
  Object.defineProperty(event, 'isComposing', { value: composing })
  field.dispatchEvent(event)
}
afterEach(() => vi.useRealTimers())
describe('H5 native input delivery after uni normalization', () => {
  it('publishes every string synchronously, including a final empty value', () => {
    const field = new Field(), emit = vi.fn()
    bindH5InputDelivery(field, { initialValue: '', isDisabled: () => false, emit })
    for (const value of ['19.25', '27.75', '0001234567890123456789', '']) send(field, value)
    expect(emit.mock.calls.map(call => call[0])).toEqual(['19.25', '27.75', '0001234567890123456789', ''])
  })
  it('keeps native incomplete numbers out of business values and reports recovery and disposal', () => {
    const field = Object.assign(new Field(), { type: 'number', validity: { badInput: false } }), emit = vi.fn(), valid = vi.fn()
    const binding = bindH5InputDelivery(field, { initialValue: '12', isDisabled: () => false, emit, onValidityChange: valid })!
    field.validity.badInput = true; send(field, '')
    expect(emit).not.toHaveBeenCalled(); expect(valid.mock.calls).toEqual([[true], [false]])
    field.validity.badInput = false; send(field, '-1'); send(field, '')
    expect(emit.mock.calls).toEqual([['-1'], ['']]); expect(valid.mock.calls).toEqual([[true], [false], [true]])
    field.validity.badInput = true; send(field, ''); binding.dispose()
    expect(valid.mock.calls.at(-1)).toEqual([true]); expect(emit).toHaveBeenCalledTimes(2)
  })
  it('retains existing empty-string delivery for native consumers without the validity contract', () => {
    const field = Object.assign(new Field(), { type: 'number', validity: { badInput: true } }), emit = vi.fn()
    bindH5InputDelivery(field, { initialValue: '12', isDisabled: () => false, emit })
    send(field, '')
    expect(emit.mock.calls).toEqual([['']])
  })
  it('recognizes a textarea and preserves multiline strings and a final clear', () => {
    const field = new Field(), emit = vi.fn(); field.tagName = 'TEXTAREA'
    bindH5InputDelivery(field, { initialValue: '', isDisabled: () => false, emit })
    for (const value of ['首行\n\n末行\n', '']) send(field, value)
    expect(emit.mock.calls).toEqual([['首行\n\n末行\n'], ['']])
  })
  it('reads the normalized DOM value after the pre-existing uni target listener', () => {
    const field = new Field(), emit = vi.fn()
    field.addEventListener('input', event => { event.stopPropagation(); field.value = field.value.slice(0, 4) })
    bindH5InputDelivery({ $el: { querySelector: () => field } }, { initialValue: '', isDisabled: () => false, emit })
    send(field, '123456')
    expect(emit.mock.calls).toEqual([['1234']])
  })
  it.each(['compositionend', 'blur'])('keeps IME preedit private and commits once on %s', end => {
    const field = new Field(), emit = vi.fn()
    bindH5InputDelivery(field, { initialValue: '', isDisabled: () => false, emit })
    send(field, '', 'compositionstart'); send(field, 'zhong', 'input', true)
    expect(emit).not.toHaveBeenCalled()
    send(field, '中文', end); send(field, '中文'); send(field, '中文', 'blur')
    expect(emit.mock.calls).toEqual([['中文']])
  })
  it('does not republish old DOM text on blur after an external model reset', () => {
    const field = new Field(), emit = vi.fn()
    const binding = bindH5InputDelivery(field, { initialValue: '', isDisabled: () => false, emit })!
    send(field, 'old'); binding.syncModel('server-new')
    send(field, 'old', 'blur')
    expect(emit.mock.calls.map(call => call[0])).toEqual(['old'])
    binding.syncModel(''); send(field, 'old')
    expect(emit.mock.calls.map(call => call[0])).toEqual(['old', 'old'])
  })
  it('blocks locked or disposed instances and rejects a missing native input', () => {
    const field = new Field(), emit = vi.fn(); let locked = true
    const binding = bindH5InputDelivery(field, { initialValue: '', isDisabled: () => locked, emit })!
    send(field, 'blocked'); send(field, '', 'compositionstart'); send(field, 'blocked', 'compositionend')
    expect(emit).not.toHaveBeenCalled()
    locked = false; send(field, 'allowed'); binding.dispose(); send(field, 'late')
    expect(emit.mock.calls).toEqual([['allowed']])
    expect(bindH5InputDelivery({}, { initialValue: '', isDisabled: () => false, emit })).toBeNull()
  })
  it('synchronizes external values through the exposed uni state setter without emitting a user input', () => {
    const field = new Field(), emit = vi.fn(), setter = vi.fn()
    const binding = bindH5InputDelivery({ $el: field, $triggerInput: setter }, { initialValue: '', isDisabled: () => false, emit })!
    send(field, 'draft'); binding.syncModel('draft')
    expect(setter).not.toHaveBeenCalled()
    binding.syncModel('server')
    expect(field.value).toBe('server')
    expect(setter.mock.calls).toEqual([[{ value: 'server' }]])
    expect(emit.mock.calls).toEqual([['draft']])
    binding.dispose(); binding.syncModel('late')
    expect(field.value).toBe('server')
  })
})

type Host = Field & { type: string; props: Record<string, any>; children: Host[]; parent: Host | null; text: string }
function host(type: string, text = ''): Host {
  return Object.assign(new Field(), { tagName: type === 'textarea' ? 'TEXTAREA' : 'INPUT', type, props: {}, children: [], parent: null, text })
}
// The host models only uni's public delayed input boundary, not AppInput logic.
const renderer = Vue.createRenderer<Host, Host>({
  patchProp(el, key, _old, value) { el.props[key] = value; if (key === 'value') el.value = String(value ?? '') },
  insert(el, parent, anchor = null) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el) },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  createElement(type) {
    const el = host(type)
    el.addEventListener('input', () => {
      const value = el.value
      setTimeout(() => el.props.onInput?.({ detail: { value } }), 100)
    })
    return el
  },
  createText: text => host('#text', text), createComment: text => host('#comment', text),
  setText(el, text) { el.text = text }, setElementText(el, text) { el.text = text },
  parentNode: el => el.parent, nextSibling: () => null,
})
function component(platform: 'h5' | 'mp-weixin' | 'app', name: 'AppInput' | 'AppTextarea') {
  const filename = path.resolve(`src/shared/ui/${name}.vue`)
  let raw = fs.readFileSync(filename, 'utf8')
  if (platform !== 'h5') {
    const require = createRequire(import.meta.url)
    const uniRequire = createRequire(require.resolve('@dcloudio/vite-plugin-uni/package.json'))
    const { preprocess } = uniRequire('@dcloudio/uni-cli-shared/lib/preprocess')
    raw = preprocess(raw,
      { H5: false, MP_WEIXIN: platform === 'mp-weixin', APP: platform === 'app' }, { type: 'js' })
    expect(raw).not.toContain('bindH5InputDelivery')
  }
  const { descriptor } = parse(raw, { filename })
  const source = compileScript(descriptor, { id: 'app-input-delivery', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name === 'vue') return Vue
    if (name === './form-input-validity') return inputValidity
    if (name === './h5-input-delivery') return { bindH5InputDelivery }
    throw Error(`Unexpected import ${name}`)
  }, module, module.exports)
  return module.exports.default
}
describe.each(['AppInput', 'AppTextarea'] as const)('actual %s component integration', name => {
  it.each(['mp-weixin', 'app'] as const)('retains ordinary string delivery after real %s preprocessing', platform => {
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component(platform, name), { 'onUpdate:modelValue': emit })
    app.mount(root)
    const field = root.children[0]!
    for (const value of ['0001234567890123456789', '27.75', '']) field.props.onInput({ detail: { value } })
    expect(emit.mock.calls.map(call => call[0])).toEqual(['0001234567890123456789', '27.75', ''])
    app.unmount()
    field.props.onInput({ detail: { value: 'late' } })
    expect(emit).toHaveBeenCalledTimes(3)
  })
  it('updates the parent before immediate unmount and ignores all delayed uni events', async () => {
    vi.useFakeTimers()
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component('h5', name), { 'onUpdate:modelValue': emit })
    app.mount(root)
    await Vue.nextTick()
    const field = root.children[0]!
    send(field, '19.25'); await vi.advanceTimersByTimeAsync(22); send(field, '27.75')
    expect(emit.mock.calls.map(call => call[0])).toEqual(['19.25', '27.75'])
    app.unmount(); await vi.runAllTimersAsync()
    expect(emit.mock.calls.map(call => call[0])).toEqual(['19.25', '27.75'])
  })
  it.each(['disabled', 'readOnly'])('does not emit from native or synthetic input while %s', async prop => {
    vi.useFakeTimers()
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component('h5', name), { [prop]: true, 'onUpdate:modelValue': emit })
    app.mount(root)
    await Vue.nextTick()
    const field = root.children[0]!
    send(field, 'forged'); field.props.onInput({ detail: { value: 'forged' } })
    expect(emit).not.toHaveBeenCalled(); app.unmount()
  })
})

describe.each(['AppInput','AppTextarea'] as const)('controlled rejection in actual %s',name=>{
 it.each([' on ',''])('restores unchanged accepted model after rejected native value %j without remount/emitting rollback',async rejected=>{
  vi.useFakeTimers()
  const root=host('root'),emit=vi.fn(),app=renderer.createApp(component('h5',name),{reconcileOnCommit:true,modelValue:'on','onUpdate:modelValue':emit})
  app.mount(root);await Vue.nextTick();const field=root.children[0]!
  send(field,rejected);expect(emit.mock.calls).toEqual([[rejected]])
  await Vue.nextTick();expect(root.children[0]).toBe(field);expect(field.value).toBe('on')
  await vi.runAllTimersAsync();expect(field.value).toBe('on');expect(emit.mock.calls).toEqual([[rejected]])
  app.unmount()
 })
})

describe.each(['AppInput','AppTextarea'] as const)('IME and reconciliation in actual %s',name=>{
 it('preserves in-progress composition across a pending accepted-value reconciliation',async()=>{
  vi.useFakeTimers();const root=host('root'),value=Vue.ref(''),updates:string[]=[]
  const Actual=component('h5',name)
  const app=renderer.createApp(Vue.defineComponent({setup(){return()=>Vue.h(Actual,{reconcileOnCommit:true,modelValue:value.value,'onUpdate:modelValue':(v:string)=>{updates.push(v);value.value=v}})}}))
  app.mount(root);await Vue.nextTick();const field=root.children[0]!
  send(field,'x');await Vue.nextTick()
  // Isolate reconciliation from the host renderer's ordinary pending value patch.
  // A duplicate native input queues reconciliation without changing parent props.
  send(field,'x');send(field,'x','compositionstart');send(field,'zhong','input',true);await Vue.nextTick()
  expect(field.value).toBe('zhong');expect(value.value).toBe('x')
  send(field,'中文','compositionend');await Vue.nextTick();await vi.runAllTimersAsync()
  expect(value.value).toBe('中文');expect(field.value).toBe('中文');expect(updates).toEqual(['x','中文']);app.unmount()
 })
 it('reconciles a rejected identical IME commit after preedit without emitting a duplicate',async()=>{
  vi.useFakeTimers();const root=host('root'),emit=vi.fn(),app=renderer.createApp(component('h5',name),{reconcileOnCommit:true,modelValue:'on','onUpdate:modelValue':emit})
  app.mount(root);await Vue.nextTick();const field=root.children[0]!
  send(field,' on ');send(field,' on ','compositionstart');send(field,'zhong','input',true);await Vue.nextTick();expect(field.value).toBe('zhong')
  send(field,' on ','compositionend');await Vue.nextTick();await vi.runAllTimersAsync();expect(field.value).toBe('on');expect(emit.mock.calls).toEqual([[' on ']]);app.unmount()
 })
})

it.each(['AppInput','AppTextarea'] as const)('leaves opt-out %s behavior unchanged',async name=>{
 vi.useFakeTimers();const root=host('root'),emit=vi.fn(),app=renderer.createApp(component('h5',name),{modelValue:'on','onUpdate:modelValue':emit})
 app.mount(root);await Vue.nextTick();const field=root.children[0]!;send(field,'draft');await Vue.nextTick();expect(field.value).toBe('draft');expect(emit.mock.calls).toEqual([['draft']]);app.unmount();await vi.runAllTimersAsync()
})

it('aggregates native validity across actual inputs and releases a removed field without changing its business model', async () => {
  const root = host('root'), emit = vi.fn(), show = Vue.ref(true)
  let valid!: Vue.ComputedRef<boolean>
  const Actual = component('h5', 'AppInput')
  const app = renderer.createApp(Vue.defineComponent({setup() {
    valid = inputValidity.useFormInputValidityScope()
    return () => show.value ? Vue.h(Actual, { modelValue: '12', 'onUpdate:modelValue': emit }) : null
  }}))
  app.mount(root); await Vue.nextTick()
  const field = Object.assign(root.children[0]!, { type: 'number', validity: { badInput: true } })
  send(field, ''); expect(valid.value).toBe(false); expect(emit).not.toHaveBeenCalled()
  show.value = false; await Vue.nextTick(); expect(valid.value).toBe(true); expect(emit).not.toHaveBeenCalled()
  app.unmount()
})

it('keeps independent nested business scopes isolated when an unrelated field is invalid or removed', async () => {
  const root = host('root'), showChild = Vue.ref(true), Actual = component('h5', 'AppInput')
  let outer!: Vue.ComputedRef<boolean>, inner!: Vue.ComputedRef<boolean>
  const Child = Vue.defineComponent({ setup() {
    inner = inputValidity.useFormInputValidityScope()
    return () => Vue.h(Actual, { modelValue: '12' })
  } })
  const app = renderer.createApp(Vue.defineComponent({ setup() {
    outer = inputValidity.useFormInputValidityScope()
    return () => Vue.h('view', {}, [Vue.h(Actual, { modelValue: '12' }), showChild.value ? Vue.h(Child) : null])
  } }))
  app.mount(root); await Vue.nextTick()
  const fields = root.children[0]!.children.filter(n => n.tagName === 'INPUT' && n.type === 'input')
  expect(fields).toHaveLength(2)
  const a = Object.assign(fields[0]!, { type: 'number', validity: { badInput: true } })
  const b = Object.assign(fields[1]!, { type: 'number', validity: { badInput: true } })
  send(a, ''); expect(outer.value).toBe(false); expect(inner.value).toBe(true)
  send(b, ''); expect(inner.value).toBe(false)
  a.validity.badInput = false; send(a, '13'); expect(outer.value).toBe(true); expect(inner.value).toBe(false)
  showChild.value = false; await Vue.nextTick(); expect(outer.value).toBe(true); expect(b.parent).toBeNull()
  app.unmount()
})
