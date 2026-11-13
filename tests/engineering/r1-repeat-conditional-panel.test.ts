import * as inputValidity from '@shared/ui/form-input-validity'
import * as retainedFileValues from '@shared/form/r1-retained-file-values'
import * as configuredFileRead from '@shared/form/r1-configured-file-read-evidence'
import * as normalDraftPort from '@features/work-orders/r1-normal-form-drafts'
import * as normalFileValues from '@features/work-orders/r1-normal-file-values'
import * as sharedTypes from '@shared/types'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import * as repeatForm from '@features/work-orders/r1-repeat-form'
import * as recordReadFields from '@features/work-orders/r1-record-read-fields'
import reference from '../fixtures/survey-59-read-reference.json'
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
  const modules: Record<string, unknown> = { vue: Vue, '@shared/ui/form-input-validity': inputValidity, './r1-normal-form-drafts': normalDraftPort, './r1-repeat-form': repeatForm, '@shared/form/r1-retained-file-values':retainedFileValues,'@shared/form/r1-configured-file-read-evidence':configuredFileRead,'./r1-normal-file-values': normalFileValues, '@shared/types': sharedTypes, './R1NormalFileField.vue': { __esModule: true, default: Vue.defineComponent({ render: () => Vue.h('file-field') }) }, './r1-record-read-fields': recordReadFields, './r1-repeat-actions-port': actionPort,
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
async function mounted(allowActions = true, initial = snapshot(), extraActions: {
  canEdit?: (id: string) => boolean; initialValues?: (id: string) => Readonly<Record<string, any>>; originalRead?: Readonly<Record<string, unknown>>;
} = {}) {
  let current = initial
  const reader = { currentFormOriginal:()=>extraActions.originalRead??null,retainReadIdentity:()=>({isSameActor:()=>true}),enabled: () => true, load: vi.fn(async () => current), clear: vi.fn(), isCurrent: (value: R1NodeFormsSnapshot) => value === current }
  const savedValues: Record<string, unknown>[] = []
  const saveOnly = vi.fn(async (values: Record<string, unknown>) => {
    const normalized = repeatForm.normalizeR1RepeatValues(current, values); savedValues.push(normalized)
    current = { ...current, records: [{ id: asOpaqueId<'FormDataId'>('saved'), definitionId: current.definition.id, values: normalized }] }; return current
  })
  const complete = vi.fn(async () => ({ acknowledged: true, transitionVerified: false } as const))
  const root = node('root'), app = renderer.createApp(panel(), { reader, workOrderId: current.workOrderId, runtimeNodeId: String(current.node.id), actorScope: 'synthetic-actor' })
  app.provide(actionPort.r1RepeatActionsKey, { forSnapshot: () => allowActions ? { locked: () => false, saveOnly, complete, ...extraActions } : null })
  app.mount(root)
  find(root, n => n.type === 'button')!.props.onTap(); await settle()
  const input = async (key: string, value: string) => { const control = find(root, n => n.props['data-key'] === key); expect(control, key).toBeDefined(); control!.props.onInput(value); await settle() }
  const save = () => find(root, n => n.props['data-testid'] === 'r1-normal-save')
  const read = () => find(root, n => n.type === 'button')!
  return { root, app, input, save, read, reader, saveOnly, complete, savedValues, setSnapshot: (value: R1NodeFormsSnapshot) => { current = value } }
}
function savedSnapshot(id = 'saved'): R1NodeFormsSnapshot {
  const value = snapshot()
  return { ...value, records: [{ id: asOpaqueId<'FormDataId'>(id), definitionId: value.definition.id, values: { need: '1', datetime: '2026-11-08 14:00' } }] }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('normal appointment repeat conditional page', () => {
  it('runs the same R1 calculation in the actual panel draft without opening the unsupported save contract', async () => {
    const definitionId = asOpaqueId<'FormDefinitionId'>('7971040108398070730'), s = snapshot()
    const original = { part: ['3', '310'], length: 2, width: 3, planeArea: 6 }
    const value: R1NodeFormsSnapshot = { ...s, definition: { ...s.definition, id: definitionId, purpose: 'survey',
      fields: [...['length', 'width', 'planeArea'].map(valueKey => ({ fieldId: valueKey, valueKey, label: valueKey,
        type: 'digit', required: false, readOnly: false })),
        { fieldId: 'part', valueKey: 'part', label: 'synthetic original path', type: 'cascade', required: true, readOnly: true }] },
      records: [{ id: asOpaqueId<'FormDataId'>('saved'), definitionId, values: original }] }
    // Explicit synthetic unit provider, not production authority or browser E2E.
    const h = await mounted(true, value, { canEdit: () => true, initialValues: () => original, originalRead:{_id:'saved',part:['3','310'],length:2,width:3,planeArea:6} })
    try {
      find(h.root, n => n.props['data-testid'] === 'r1-normal-edit-saved')!.props.onTap(); await settle()
      await h.input('length', '2.345')
      expect(find(h.root, n => n.props['data-key'] === 'planeArea')!.props.value).toBe(7.04)
      h.reader.load.mockRejectedValueOnce(new Error('synthetic read failure'))
      h.read().props.onTap(); await settle();h.read().props.onTap();await settle()
      expect(find(h.root, n => n.props['data-key'] === 'planeArea')!.props.value).toBe(7.04)
      await h.input('length', '')
      expect(find(h.root, n => n.props['data-key'] === 'planeArea')!.props.value).toBe('')
      expect(h.save()!.props.disabled).toBe(true) // Existing scalar-only cascade guard remains.
      expect(h.saveOnly).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled()
    } finally { h.app.unmount() }
  })

  it('mounts the actual readonly panel with 59 observed rows without hidden values or write controls', async () => {
    const definition = formDefinition({ data: reference.fields.map(f => f.row) }, asOpaqueId<'FormDefinitionId'>('survey-reference'))
    const h = await mounted(false, { ...snapshot(), definition, records: [{ id: asOpaqueId<'FormDataId'>('saved-survey'), definitionId: definition.id,
      values: { part: ['1', '130'], squareMeter: 18.75, planeArea: 20.25, height: 123456, name: 'HIDDEN', memo: '仅测试已保存值' } }] })
    try {
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-value-squareMeter')?.text).toBe('18.75')
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-value-planeArea')).toBeUndefined()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-value-name')).toBeUndefined()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-value-height')?.text).toContain('尚未完整核实')
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-value-surveyDrawing')?.text).toContain('附件内容暂不支持')
      expect(h.save()).toBeUndefined(); expect(h.saveOnly).not.toHaveBeenCalled()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')).toBeUndefined()
    } finally { h.app.unmount() }
  })
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
  it('requires a fresh completion confirmation after rereading changed records', async () => {
    const h = await mounted(true, savedSnapshot())
    try {
      find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')!.props.onTap(); await settle()
      const staleConfirm = find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-confirm')!.props.onTap
      h.setSnapshot(savedSnapshot('newly-read-record'))
      h.read().props.onTap(); await settle()
      expect(h.reader.load).toHaveBeenCalledTimes(2)
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-confirm')).toBeUndefined()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')).toBeDefined()
      staleConfirm(); await settle(); expect(h.complete).not.toHaveBeenCalled()
      find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')!.props.onTap(); await settle()
      find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-confirm')!.props.onTap(); await settle()
      expect(h.complete).toHaveBeenCalledOnce()
    } finally { h.app.unmount() }
  })
  it('does not revive completion confirmation after a failed reread and retry', async () => {
    const h = await mounted(true, savedSnapshot())
    try {
      find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')!.props.onTap(); await settle()
      h.reader.load.mockRejectedValueOnce(new Error('synthetic read failure'))
      h.read().props.onTap(); await settle()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-form-read-message')!.text).toContain('暂时无法完整核实')
      expect(h.read().props.disabled).toBe(false)
      h.read().props.onTap(); await settle()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-confirm')).toBeUndefined()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')).toBeDefined()
      expect(h.complete).not.toHaveBeenCalled()
    } finally { h.app.unmount() }
  })
  it('preserves same-scope visible and hidden draft values across a failed reread and retry', async () => {
    const h = await mounted()
    try {
      await h.input('need', '1'); await h.input('datetime', '2026-11-08 14:00'); await h.input('note', '保留草稿')
      await h.input('need', '2'); await h.input('reasons1', 'normal')
      h.reader.load.mockRejectedValueOnce(new Error('synthetic read failure'))
      h.read().props.onTap(); await settle()
      h.setSnapshot(snapshot()); h.read().props.onTap(); await settle()
      expect(find(h.root, n => n.props['data-key'] === 'need')!.props.value).toBe('2')
      expect(find(h.root, n => n.props['data-key'] === 'note')!.props.value).toBe('保留草稿')
      expect(h.save()!.props.disabled).toBe(false)
      await h.input('need', '1')
      expect(find(h.root, n => n.props['data-key'] === 'datetime')!.props.value).toBe('2026-11-08 14:00')
      expect(h.saveOnly).not.toHaveBeenCalled()
    } finally { h.app.unmount() }
  })
  it('cancels completion intent and ignores a retained confirm callback', async () => {
    const h = await mounted(true, savedSnapshot())
    try {
      find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')!.props.onTap(); await settle()
      const confirm = find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-confirm')!.props.onTap
      find(h.root, n => n.type === 'button' && n.children.some(child => child.text === '返回检查'))!.props.onTap(); await settle()
      confirm(); await settle()
      expect(h.complete).not.toHaveBeenCalled()
      expect(find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')).toBeDefined()
    } finally { h.app.unmount() }
  })
  it('visibly disables reread and blocks direct reread callbacks while save is pending', async () => {
    const h = await mounted(), pending = deferred<R1NodeFormsSnapshot>()
    try {
      await h.input('need', '1'); await h.input('datetime', '2026-11-08 14:00')
      h.saveOnly.mockImplementationOnce(() => pending.promise)
      h.save()!.props.onTap(); await settle()
      expect(h.read().props.disabled).toBe(true)
      h.read().props.onTap(); h.save()!.props.onTap(); await settle()
      expect(h.reader.load).toHaveBeenCalledOnce(); expect(h.saveOnly).toHaveBeenCalledOnce()
      const saved = savedSnapshot(); h.setSnapshot(saved); pending.resolve(saved); await settle()
      expect(h.read().props.disabled).toBe(false)
    } finally { pending.resolve(savedSnapshot()); h.app.unmount() }
  })
  it('visibly disables reread and blocks direct reread callbacks while completion is pending', async () => {
    const h = await mounted(true, savedSnapshot()), pending = deferred<{ acknowledged: true; transitionVerified: false }>()
    try {
      h.complete.mockImplementationOnce(() => pending.promise)
      find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-request')!.props.onTap(); await settle()
      const confirm = find(h.root, n => n.props['data-testid'] === 'r1-normal-complete-confirm')!.props.onTap
      confirm(); await settle()
      expect(h.read().props.disabled).toBe(true)
      h.read().props.onTap(); confirm(); await settle()
      expect(h.reader.load).toHaveBeenCalledOnce(); expect(h.complete).toHaveBeenCalledOnce()
      pending.resolve({ acknowledged: true, transitionVerified: false }); await settle()
      expect(h.read().props.disabled).toBe(false)
    } finally { pending.resolve({ acknowledged: true, transitionVerified: false }); h.app.unmount() }
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


describe('normal read view ownership',()=>{
 it('old view late unmount never clears the reader already claimed by a newer view',async()=>{
  const Component=panel(),s=snapshot();let current=s
  const reader={enabled:()=>true,load:vi.fn(async()=>current),clear:vi.fn(),isCurrent:(v:R1NodeFormsSnapshot)=>v===current}
  const mount=()=>{const root=node('root');const app=renderer.createApp(Component,{reader,workOrderId:s.workOrderId,runtimeNodeId:String(s.node.id),actorScope:'actor'});app.provide(actionPort.r1RepeatActionsKey,{forSnapshot:()=>({locked:()=>false,saveOnly:vi.fn(),complete:vi.fn(async()=>({acknowledged:true,transitionVerified:false} as const))})});app.mount(root);return{root,app}}
  const old=mount();find(old.root,n=>n.type==='button')!.props.onTap();await settle()
  const fresh=mount();find(fresh.root,n=>n.type==='button')!.props.onTap();await settle()
  const clears=reader.clear.mock.calls.length;old.app.unmount();await settle()
  expect(reader.clear).toHaveBeenCalledTimes(clears)
  expect(find(fresh.root,n=>n.props['data-key']==='need')).toBeDefined();expect(reader.isCurrent(s)).toBe(true)
  fresh.app.unmount()
 })
})
