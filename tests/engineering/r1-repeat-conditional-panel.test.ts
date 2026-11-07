import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import * as repeatForm from '@features/work-orders/r1-repeat-form'
import * as actionPort from '@features/work-orders/r1-repeat-actions-port'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { asOpaqueId } from '@shared/types'

// Mount the actual SFC script + template in Vue's custom renderer. Only the
// visual primitives are test controls; no DOM/browser, API, auth or writes.
interface Host { type: string; props: Record<string, any>; text: string; children: Host[]; parent: Host | null }
const node = (type: string, text = ''): Host => ({ type, text, props: {}, children: [], parent: null })
const renderer = Vue.createRenderer<Host, Host>({
  patchProp: (el, key, _prev, value) => { el.props[key] = value },
  insert(el, parent, anchor = null) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el) },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.children = []; el.text = text },
  parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
const Button = Vue.defineComponent({ inheritAttrs: false, props: ['disabled', 'loading'], emits: ['tap'], setup: (props, ctx) => () => Vue.h('button', { ...ctx.attrs, disabled: props.disabled, onTap: () => ctx.emit('tap') }, ctx.slots.default?.()) })
const Field = Vue.defineComponent({ inheritAttrs: false, setup: (_, ctx) => () => Vue.h('field', ctx.attrs, ctx.slots.default?.()) })
const Control = Vue.defineComponent({ props: ['field', 'modelValue', 'disabled'], emits: ['update:modelValue'], setup: (props, ctx) => () => Vue.h('input', { 'data-key': props.field.valueKey, value: props.modelValue, disabled: props.disabled, onInput: (value: unknown) => ctx.emit('update:modelValue', value) }) })
function panel() {
  const filename = path.resolve('src/features/work-orders/R1NodeFormsReadPanel.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, { id: 'repeat-conditional-unit', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const modules: Record<string, unknown> = { vue: Vue, './r1-repeat-form': repeatForm, './r1-repeat-actions-port': actionPort,
    '@shared/ui/AppButton.vue': { __esModule: true, default: Button }, '@shared/ui/AppField.vue': { __esModule: true, default: Field }, './R1FormFieldControl.vue': { __esModule: true, default: Control } }
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((key: string) => { if (!(key in modules)) throw Error(`Unstubbed component import: ${key}`); return modules[key] }, module, module.exports)
  return module.exports.default
}
function snapshot(): R1NodeFormsSnapshot {
  const rows = [
    { name: 'need', type: 'radio', required: '1', frontEndConfig: '{}' },
    { name: 'reasons1', type: 'select', required: '1', frontEndConfig: '{"showField":"need","showValue":"2"}' },
    { name: 'otherReason', type: 'text', required: '1', frontEndConfig: '{"showField":"reasons1","showValue":"other"}' },
    { name: 'datetime', type: 'datetime', required: '1', frontEndConfig: '{"showField":"need","showValue":"1"}' },
    { name: 'note', type: 'text', required: '0', frontEndConfig: '{}' },
    { name: 'modifyReason', type: 'text', required: '1', frontEndConfig: '{"showField":"_id","showValue":"$exist"}' },
  ].map(f => ({ ...f, _id: `${f.name}-field`, colName: 'appointment', preset: '1', showList: ['2', '4'], showType: '1' }))
  const definition = formDefinition({ data: rows }, asOpaqueId<'FormDefinitionId'>('synthetic-definition'))
  return { workOrderId: 'synthetic-order', node: { id: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'), category: 'repeat', lifecycle: 'active', formFieldIdsReadOnly: [] }, definition: { ...definition, fields: definition.fields!.map(f => ({ ...f, options: f.valueKey === 'need' ? [{ value: '1', label: '需要上门' }, { value: '2', label: '不上门' }] : f.valueKey === 'reasons1' ? [{ value: 'other', label: '其他' }, { value: 'normal', label: '普通原因' }] : f.options })) }, records: [] }
}
function find(root: Host, predicate: (n: Host) => boolean): Host | undefined { if (predicate(root)) return root; for (const child of root.children) { const match = find(child, predicate); if (match) return match } }
async function settle() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await Vue.nextTick() } }
async function mounted(allowActions = true) {
  let current = snapshot()
  const reader = { enabled: () => true, load: vi.fn(async () => current), clear: vi.fn(), isCurrent: (value: R1NodeFormsSnapshot) => value === current }
  const savedValues: Record<string, unknown>[] = []
  const saveOnly = vi.fn(async (values: Record<string, unknown>) => {
    const normalized = repeatForm.normalizeR1RepeatValues(current, values); savedValues.push(normalized)
    current = { ...current, records: [{ id: asOpaqueId<'FormDataId'>('saved'), definitionId: current.definition.id, values: normalized }] }; return current
  })
  const root = node('root'), app = renderer.createApp(panel(), { reader, workOrderId: current.workOrderId, runtimeNodeId: String(current.node.id), actorScope: 'synthetic-actor' })
  app.provide(actionPort.r1RepeatActionsKey, { forSnapshot: () => allowActions ? { locked: () => false, saveOnly, complete: vi.fn() } : null })
  app.mount(root)
  find(root, n => n.type === 'button')!.props.onTap(); await settle()
  const input = async (key: string, value: string) => { const control = find(root, n => n.props['data-key'] === key); expect(control, key).toBeDefined(); control!.props.onInput(value); await settle() }
  const save = () => find(root, n => n.props['data-testid'] === 'r1-normal-save')
  return { root, app, input, save, saveOnly, savedValues }
}

describe('normal appointment repeat conditional page', () => {
  it('switches 1→2→1→2 without erasing hidden draft values or permanently disabling save', async () => {
    const h = await mounted()
    try {
      await h.input('need', '1'); await h.input('datetime', '2026-11-08 14:00'); await h.input('note', '保留备注')
      expect(h.save()!.props.disabled).toBe(false)
      await h.input('need', '2'); expect(find(h.root, n => n.props['data-key'] === 'datetime')).toBeUndefined()
      expect(h.save()!.props.disabled).toBe(true)
      await h.input('reasons1', 'other'); await h.input('otherReason', '客户另约时间')
      expect(h.save()!.props.disabled).toBe(false)
      await h.input('need', '1'); expect(find(h.root, n => n.props['data-key'] === 'datetime')!.props.value).toBe('2026-11-08 14:00')
      expect(h.save()!.props.disabled).toBe(false)
      await h.input('need', '2'); h.save()!.props.onTap(); await settle()
      expect(h.saveOnly).toHaveBeenCalledOnce()
      expect(h.savedValues).toEqual([{ need: '2', datetime: '2026-11-08 14:00', note: '保留备注', reasons1: 'other', otherReason: '客户另约时间' }])
    } finally { h.app.unmount() }
  })
  it('readonly scope mounts records UI without adding a save control', async () => {
    const h = await mounted(false)
    try { expect(h.save()).toBeUndefined(); expect(h.saveOnly).not.toHaveBeenCalled() } finally { h.app.unmount() }
  })
  it('keeps non-appointment hidden values, injected edit reason and unsafe appointment values fail-closed', () => {
    const s = snapshot(), draft = { need: '2', reasons1: 'normal', datetime: '2026-11-08 14:00' }
    expect(repeatForm.normalizeR1RepeatValues(s, draft)).toEqual(draft)
    expect(() => repeatForm.normalizeR1RepeatValues({ ...s, definition: { ...s.definition, purpose: undefined } }, draft)).toThrow()
    for (const extra of [{ modifyReason: 'forged' }, { _id: 'forged' }, { unknown: 'unknown' }, { datetime: null }, { need: 2 }, { reasons1: 'unverified' }]) expect(() => repeatForm.normalizeR1RepeatValues(s, { ...draft, ...extra })).toThrow()
    const visibleEditReason = { ...s, definition: { ...s.definition, fields: s.definition.fields!.map(f => f.valueKey === 'modifyReason' ? { ...f, visibility: undefined } : f) } }
    expect(() => repeatForm.normalizeR1RepeatValues(visibleEditReason, { ...draft, modifyReason: 'forged-visible' })).toThrow()
    expect(() => repeatForm.normalizeR1RepeatValues({ ...s, node: { ...s.node, formFieldIdsReadOnly: ['datetime-field'] } }, draft)).toThrow()
  })
})
