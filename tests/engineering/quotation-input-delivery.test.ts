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
function send(field: Field, value: string, type = 'input', composing = false) {
  field.value = value
  const event = new Event(type)
  Object.defineProperty(event, 'isComposing', { value: composing })
  field.dispatchEvent(event)
}
afterEach(() => vi.useRealTimers())
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
function component(platform: 'h5' | 'mp-weixin' | 'app') {
  const filename = path.resolve(`src/features/work-orders/quotation/QuotationTextField.vue`)
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
    if (name === '@shared/ui/h5-input-delivery') return { bindH5InputDelivery }
    throw Error(`Unexpected import ${name}`)
  }, module, module.exports)
  return module.exports.default
}

describe.each([false, true])('quotation field native delivery, multiline=%s', multiline => {
  it('publishes both rapid values before unmount without delayed uni overwrite', async () => {
    vi.useFakeTimers()
    const root = host('root'), emit = vi.fn()
    const app = renderer.createApp(component('h5'), { multiline, value: '', onInput: emit })
    app.mount(root); await Vue.nextTick()
    const field = root.children[0]!
    send(field, '1'); await vi.advanceTimersByTimeAsync(22); send(field, '12')
    expect(emit.mock.calls.map(call => call[0])).toEqual([{ detail: { value: '1' } }, { detail: { value: '12' } }])
    app.unmount(); await vi.runAllTimersAsync()
    expect(emit).toHaveBeenCalledTimes(2)
  })
  it.each(['compositionend', 'blur'])('keeps IME preedit private and delivers final text once on %s', async end => {
    vi.useFakeTimers()
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component('h5'), { multiline, onInput: emit })
    app.mount(root); await Vue.nextTick()
    const field = root.children[0]!
    send(field, '', 'compositionstart'); send(field, 'shuru', 'input', true)
    expect(emit).not.toHaveBeenCalled()
    send(field, '最终输入', end); send(field, '最终输入')
    await vi.runAllTimersAsync()
    expect(emit.mock.calls).toEqual([[{ detail: { value: '最终输入' } }]])
    app.unmount()
  })
  it('preserves normalized scalar strings, decimal text, zero and final empty input', async () => {
    vi.useFakeTimers()
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component('h5'), { multiline, onInput: emit })
    app.mount(root); await Vue.nextTick()
    for (const value of ['12.5', '.5', '0', '', 'invalid-text']) send(root.children[0]!, value)
    expect(emit.mock.calls.map(call => call[0].detail.value)).toEqual(['12.5', '.5', '0', '', 'invalid-text'])
    app.unmount()
  })
  it('blocks locked fields and ignores public late callbacks after removal', async () => {
    vi.useFakeTimers()
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component('h5'), { multiline, disabled: true, onInput: emit })
    app.mount(root); await Vue.nextTick()
    const field = root.children[0]!
    send(field, 'forged'); field.props.onInput({ detail: { value: 'forged' } })
    app.unmount(); send(field, 'late'); field.props.onInput({ detail: { value: 'late' } })
    await vi.runAllTimersAsync(); expect(emit).not.toHaveBeenCalled()
  })
  it('reflects an external draft reset without old delayed input undoing it', async () => {
    vi.useFakeTimers()
    const model = Vue.reactive({ value: 'server-a', disabled: false })
    const root = host('root'), emit = vi.fn(), cmp = component('h5')
    const app = renderer.createApp({ render: () => Vue.h(cmp, { ...model, multiline, onInput: emit }) })
    app.mount(root); await Vue.nextTick()
    send(root.children[0]!, 'draft-b')
    model.value = 'server-c'; await Vue.nextTick(); await vi.runAllTimersAsync()
    expect(root.children[0]!.value).toBe('server-c')
    expect(emit.mock.calls).toEqual([[{ detail: { value: 'draft-b' } }]])
    app.unmount()
  })
  it('disposes old native listeners when the actual input target is replaced', async () => {
    vi.useFakeTimers()
    const model = Vue.reactive({ multiline })
    const root = host('root'), emit = vi.fn(), cmp = component('h5')
    const app = renderer.createApp({ render: () => Vue.h(cmp, { ...model, value: '', onInput: emit }) })
    app.mount(root); await Vue.nextTick()
    const old = root.children[0]!
    model.multiline = !multiline; await Vue.nextTick(); await Vue.nextTick()
    const next = root.children[0]!
    expect(next).not.toBe(old)
    send(old, 'stale'); send(next, 'current'); await vi.runAllTimersAsync()
    expect(emit.mock.calls).toEqual([[{ detail: { value: 'current' } }]])
    app.unmount()
  })
  it('keeps native attrs and numeric keyboard without adding shared input styles', async () => {
    const root = host('root'), app = renderer.createApp(component('h5'), {
      multiline, type: 'digit', maxlength: -1, class: 'original-quote-class', 'data-testid': 'native-quote', 'aria-invalid': true,
    })
    app.mount(root); await Vue.nextTick()
    const field = root.children[0]!
    expect(field.type).toBe(multiline ? 'textarea' : 'input')
    expect(field.props).toMatchObject({ maxlength: -1, class: 'original-quote-class', 'data-testid': 'native-quote', 'aria-invalid': true })
    if (!multiline) expect(field.props.type).toBe('digit')
    app.unmount()
  })
  it.each(['mp-weixin', 'app'] as const)('retains raw native input contract after %s preprocessing', platform => {
    const root = host('root'), emit = vi.fn(), app = renderer.createApp(component(platform), { multiline, onInput: emit })
    app.mount(root)
    const event = { detail: { value: '00012.50', cursor: 8 } }
    root.children[0]!.props.onInput(event)
    expect(emit).toHaveBeenCalledWith(event)
    app.unmount()
    root.children[0]?.props.onInput(event)
    expect(emit).toHaveBeenCalledTimes(1)
  })
})

// Real epoch helper + actual field: reused group/row IDs must not preserve an
// old native listener across descriptor or server/local restoration boundaries.
describe('quotation editor identity and restoration epoch', () => {
  it('replaces same-ID fields on descriptor/edit/restore boundaries, not on normal edits', async () => {
    const { useQuotationInputEpoch } = await import('@features/work-orders/quotation/input-delivery-epoch')
    vi.useFakeTimers()
    const state = Vue.reactive({ descriptor: { userId: 'actor-a', workOrderId: 'order-a' }, localState: 'fresh' as import('@features/work-orders/quotation/composition-store').QuotationDraftLocalState, editState: 'none' })
    const root = host('root'), emit = vi.fn(), cmp = component('h5')
    const app = renderer.createApp({
      setup() {
        const epoch = useQuotationInputEpoch({ descriptor: () => state.descriptor, localState: () => state.localState, editState: () => state.editState })
        const owner = Vue.computed(() => { const current = epoch.value; return () => current === epoch.value })
        return () => Vue.h(cmp, { key: `${epoch.value}:quotation-group-1:quotation-selection-1`, isCurrent: owner.value, value: '', onInput: emit })
      },
    })
    app.mount(root); await Vue.nextTick()
    let field = root.children[0]!
    for (const localState of ['dirty', 'saving', 'saved_local', 'save_failed'] as const) {
      state.localState = localState; await Vue.nextTick()
      expect(root.children[0]).toBe(field)
    }
    for (const change of [
      () => { state.descriptor = { userId: 'actor-b', workOrderId: 'order-b' } },
      () => { state.localState = 'loading' },
      () => { state.localState = 'restored' },
      () => { state.editState = 'ready' },
      () => { state.editState = 'blocked' },
    ]) {
      change()
      // Revoked even in the gap before the old DOM is removed.
      send(field, 'revoked-before-render'); field.props.onInput({ detail: { value: 'old tail before render' } })
      expect(emit).not.toHaveBeenCalled()
      await Vue.nextTick(); await Vue.nextTick()
      const next = root.children[0]!
      expect(next).not.toBe(field)
      send(field, 'old DOM'); field.props.onInput({ detail: { value: 'old tail' } })
      expect(emit).not.toHaveBeenCalled()
      field = next
    }
    app.unmount(); await vi.runAllTimersAsync()
    expect(emit).not.toHaveBeenCalled()
  })
  it('wires only the five scoped quote controls and preserves the SKU lock', () => {
    const q01 = fs.readFileSync('src/features/work-orders/quotation/Q01EntryScreen.vue', 'utf8')
    const quote = fs.readFileSync('src/features/work-orders/quotation/QuotationActionContent.vue', 'utf8')
    expect(q01.match(/<QuotationTextField/g)).toHaveLength(2)
    expect(quote.match(/<QuotationTextField/g)).toHaveLength(3)
    expect(quote).toContain(':key="inputEpoch"')
    expect(quote).toContain(':key="`${inputEpoch}:${group.groupId}:${selection.selectionId}:quantity`"')
    expect(quote).toContain(':disabled="!canEdit || (selection.kind === \'material\' && Boolean(selection.skuChoices?.length))"')
    expect(q01).toContain(':maxlength="-1"')
    expect(quote).toContain('@input="onQuantityInput(group.groupId, selection.selectionId, $event)"')
  })
})

describe('actual quotation field to existing composition and encoder', () => {
  it('keeps raw invalid text separate from the last valid quantity and preserves R1 amount semantics', async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    const { createActionDraftRepository, actionDraftIdentityFor } = await import('@runtimes/action')
    const { createSemanticStorageAdapter } = await import('@adapters/storage/storage-adapter')
    const { asOpaqueId } = await import('@shared/types')
    const { useQuotationCompositionStore } = await import('@features/work-orders/quotation/composition-store')
    const { materialItem, procedureItem } = await import('@adapters/api/quotation-catalog-mappers')
    const fixture = await import('@adapters/api/mock/quotation-catalog')
    const { evaluateQuotationDraft } = await import('@features/work-orders/quotation/engine')
    vi.useFakeTimers(); setActivePinia(createPinia())
    const records = new Map<string, string>()
    const repository = createActionDraftRepository(createSemanticStorageAdapter({
      get: async key => records.get(key) ?? null,
      set: async (key, value) => { records.set(key, value) },
      remove: async key => { records.delete(key) },
      listKeys: async () => [...records.keys()],
    }))
    const identity = actionDraftIdentityFor({ userId: asOpaqueId<'UserId'>('quote-input-user'),
      workOrderId: asOpaqueId<'WorkOrderId'>('quote-input-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('quote-input-node'), actionIntent: 'place_order', contentKind: 'quotation' }, asOpaqueId<'RoleId'>('quote-input-role'))
    const store = useQuotationCompositionStore()
    await store.initialize({ identity, repository })
    const groupId = store.createGroup({ repairParts: ['repair-part-code-001'], partDescription: 'normal material', maintainAreaNum: '1' }).data!
    const item = materialItem(fixture.mockQuotationMaterialListResponse.data.find(row => row._id === 'mock-catalog-material-ordinary-1'))
    store.addCatalogReadItem(groupId, item)
    const procedure = procedureItem(fixture.mockQuotationProcedureListResponse.data[0])
    store.addCatalogReadItem(groupId, procedure)
    const selectionId = store.groups[0].materials[0].selectionId
    const root = host('root'), results: string[] = []
    const app = renderer.createApp(component('h5'), { type: 'digit', value: '1', onInput: (event: { detail: { value: string } }) => {
      results.push(store.setQuantityText(groupId, selectionId, event.detail.value).state)
    } })
    app.mount(root); await Vue.nextTick()
    const field = root.children[0]!
    send(field, '1'); send(field, '12')
    expect(store.groups[0].materials[0].quantity).toBe(12)
    for (const invalid of ['0', '', '-1', '1e3', 'bad', 'Infinity']) {
      send(field, invalid)
      expect(store.quantityTextBySelection[selectionId]).toBe(invalid)
      expect(store.quantityErrorBySelection[selectionId]).toBe('请输入大于 0 的数量')
      expect(store.groups[0].materials[0].quantity).toBe(12)
      expect(results.at(-1)).toBe('failed_terminal')
    }
    send(field, '12.5')
    expect(store.quantityErrorBySelection[selectionId]).toBe('')
    store.updateGroupContext(groupId, { maintainAreaNum: '99' })
    expect(store.groups[0].materials[0].quantity).toBe(12.5) // no new live engineering-quantity linkage
    await store.flushDraft()
    const saved = (await repository.read(identity)).data!
    expect(saved.values.quotationDraft).toMatchObject({ groups: [{ maintainAreaNum: '99', materials: [{ quantity: 12.5 }] }] })
    const result = await evaluateQuotationDraft({ draft: store.draft!,
      catalogContext: { serviceType: fixture.mockQuotationCatalogServiceType, sourceType: fixture.mockQuotationCatalogSourceType },
      catalogRead: { listProcedures: async () => ({ state: 'succeeded', data: { items: [procedure], page: 1, pageSize: 20, totalCount: 1 } }), listMaterials: async () => ({ state: 'succeeded', data: { items: [item], page: 1, pageSize: 20, totalCount: 1 } }) } as never,
    })
    expect(result.issues).toEqual([])
    expect(result.state).toBe('ready')
    expect(result.payload!.totalPrice).toBe(550.9)
    expect(JSON.parse(result.payload!.bjProducts).orderList[0].materials.data[0])
      .toMatchObject({ number: 12.5, amount: 38.6, totalAmount: 482.5 })
    app.unmount(); store.clear()
  })
})
