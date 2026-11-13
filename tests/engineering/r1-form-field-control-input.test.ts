import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as registry from '@features/work-orders/field-control-registry'
import { actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { evaluateFieldState } from '@runtimes/dynamic-form'
import { formDefinition } from '@adapters/api/read-models/form'
import { projectR1RepeatFields } from '@features/work-orders/r1-repeat-form'
import { asOpaqueId } from '@shared/types'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'

interface Host { tag: string; props: Record<string, any>; children: Host[]; parent: Host | null }
const node = (tag: string): Host => ({ tag, props: {}, children: [], parent: null })
const renderer = Vue.createRenderer<Host, Host>({
  patchProp: (el, key, _old, value) => { el.props[key] = value },
  insert(el, parent, anchor = null) {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
    el.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(el); else parent.children.splice(index, 0, el)
  },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1) },
  createElement: node, createText: () => node('#text'), createComment: () => node('#comment'),
  setText() {}, setElementText() {}, parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
// Mount the real parent SFC. The primitive boundary retains AppInput's default
// text keyboard contract; neither this test nor the control grants a command.
const Input = Vue.defineComponent({
  props: { modelValue: String, inputType: { type: String, default: 'text' }, disabled: Boolean },
  emits: ['update:modelValue'],
  setup: (props, ctx) => () => Vue.h('input', {
    value: props.modelValue, type: props.inputType, disabled: props.disabled,
    onInput: (value: string) => ctx.emit('update:modelValue', value),
  }),
})
function component(): Vue.Component {
  const filename = resolve('src/features/work-orders/R1FormFieldControl.vue')
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, { id: 'r1-field-input', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((key: string) => {
    if (key === 'vue') return Vue
    if (key === './field-control-registry') return registry
    if (key === '@shared/ui/AppInput.vue') return { __esModule: true, default: Input }
    if (key.endsWith('.vue')) return { __esModule: true, default: Vue.defineComponent({ render: () => Vue.h('other') }) }
    throw Error('Unexpected component dependency: ' + key)
  }, module, module.exports)
  return module.exports.default
}
function field(type: string) {
  const definition = formDefinition({ data: [{ _id: 'f', name: 'configuredValue', nameDisp: '配置值', type,
    required: '0', readOnly: 0, showList: ['4'], operationType: '1', frontEndConfig: '{}' }] }, asOpaqueId<'FormDefinitionId'>('e'))
  const snapshot = { workOrderId: 's', definition, records: [],
    node: { id: 'n', sourceNodeType: 'repeat', lifecycle: 'active', formFieldIdsReadOnly: [] } } as unknown as R1NodeFormsSnapshot
  return projectR1RepeatFields(snapshot, {})[0]!
}
function mount(type: string, value: string, disabled = false) {
  const root = node('root'), changed = vi.fn(), props = Vue.reactive({ field: field(type), modelValue: value, disabled })
  const Control = component()
  const app = renderer.createApp({ setup: () => () => Vue.h(Control, { ...props, 'onUpdate:modelValue': changed }) })
  app.mount(root)
  const input = () => root.children.flatMap(n => n.tag === 'input' ? [n] : n.children.filter(x => x.tag === 'input'))[0]!
  return { app, props, changed, input }
}

describe('normal R1 shared field keyboard delivery', () => {
  it.each(['number', 'digit'] as const)('delivers configured %s keyboard from adapter through repeat projection to AppInput', type => {
    const h = mount(type, '001.20')
    try {
      expect(h.props.field.supported).toBe(true)
      expect(h.input().props.type).toBe(type)
      expect(h.input().props.value).toBe('001.20')
      h.input().props.onInput('002.30')
      expect(h.changed).toHaveBeenCalledWith('002.30')
    } finally { h.app.unmount() }
  })
  it.each(['text', 'phone', 'IDNumber'])('retains string %s input without numeric coercion', type => {
    const h = mount(type, '001234')
    try {
      expect(h.input().props.type).toBe('text')
      expect(h.input().props.value).toBe('001234')
      h.input().props.onInput('000123')
      expect(h.changed).toHaveBeenCalledWith('000123')
    } finally { h.app.unmount() }
  })
  it('retains host-owned disabled state for numeric fields', () => {
    const h = mount('digit', '12.5', true)
    try {
      expect(h.input().props.type).toBe('digit')
      expect(h.input().props.disabled).toBe(true)
      expect(h.changed).not.toHaveBeenCalled()
    } finally { h.app.unmount() }
  })
})

// R1's current-role-only visibility needs its own trusted context contract.
// Neither supplying roleIds nor an unrelated field value enables it here.
describe('role visibility without trusted context remains unavailable', () => {
  it.each(['4', '5'].flatMap(showType => [
    { showType, roleIds: ['r'] },
    { showType, roleIds: ['r'], showField: 'role', showValue: 'r' },
  ]))('does not infer role visibility from %j', metadata => {
    const definition = formDefinition({ data: [{ _id: 'role-field', name: 'privateValue', type: 'text',
      nameDisp: '角色条件', required: '0', showList: ['4'], frontEndConfig: '{}', ...metadata }] }, asOpaqueId<'FormDefinitionId'>('e'))
    const mapped = definition.fields![0]!
    // Mapping may recognize the rule; without reader-issued role context it
    // must still remain unavailable and never consult the values object.
    expect(evaluateFieldState(actionFormSchemaFor(mapped), {
      surface: 'mobile_detail', values: { role: 'r', privateValue: 'retained' },
    }).capability).toBe('UNSUPPORTED')
  })
})
