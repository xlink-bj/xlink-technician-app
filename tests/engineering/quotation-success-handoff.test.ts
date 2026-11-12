import { useNormalFormActionPage } from '@features/work-orders/normal-form-action-page'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { createActionDraftRepository } from '@runtimes/action'
import type { SessionSnapshot, TechnicianApiReadPort, TechnicianApiCommandPort, QuotationCatalogReadPort } from '@shared/ports'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import { createEmptyQuotationDraft, createQuotationGroup, appendQuotationGroup } from '@features/work-orders/quotation/model'
import { describe, expect, it, vi } from 'vitest'
import { useQuotationSuccessHandoff, quotationSuccessRouteMatches, type QuotationSuccessContext } from '@features/work-orders/quotation/success-handoff'
import { submitQuotationOrder, type QuotationOrderSubmissionInput } from '@features/work-orders/quotation/order-submission'
import type { QuotationOrderRead, StoragePort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
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
const Status = Vue.defineComponent({ props: ['message'], setup: p => () => Vue.h('text', p.message) })
function component() {
  const filename = path.resolve('src/features/work-orders/quotation/QuotationOrderSuccess.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, { id: 'quotation-success-test', inlineTemplate: true }).content
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const modules: Record<string, unknown> = { vue: Vue,
    '@shared/ui/AppButton.vue': { __esModule: true, default: Button },
    '@shared/ui/AppStatus.vue': { __esModule: true, default: Status } }
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((key: string) => {
    if (!(key in modules)) throw Error(`Unstubbed component import: ${key}`)
    return modules[key]
  }, module, module.exports)
  return module.exports.default
}
const order: QuotationOrderRead = { id: 'synthetic-saved-order', type: 1, serviceAppointmentId: 'synthetic-work', totalPrice: 2160, bjProducts: {}, replaceSnapshot: {} }
function find(root: Host, id: string): Host | undefined {
  if (root.props['data-testid'] === id) return root
  for (const child of root.children) { const match = find(child, id); if (match) return match }
}
function text(root: Host): string { return root.text + root.children.map(text).join(' ') }
function harness() {
  const current = Vue.shallowRef<QuotationSuccessContext>({ scope: 'actor:role:v1:work:node', action: {}, workOrderId: order.serviceAppointmentId, result: { state: 'idle' } })
  const scope = Vue.effectScope()
  const handoff = scope.run(() => useQuotationSuccessHandoff(() => current.value))!
  const update = (patch: Partial<QuotationSuccessContext>) => { current.value = { ...current.value, ...patch } }
  const navigate = vi.fn()
  const hub = Vue.ref(false)
  const Success = component()
  const root = node('root')
  const app = renderer.createApp(Vue.defineComponent({ setup: () => () => hub.value
    ? Vue.h('view', { 'data-testid': 'existing-order-hub' })
    : handoff.order.value ? Vue.h(Success, { order: handoff.order.value, onOpenOrderRecords: () => handoff.open(() => { navigate(); hub.value = true }) })
      : Vue.h('view', { 'data-testid': 'not-success' }) }))
  app.mount(root)
  return { current, update, handoff, root, navigate, close() { app.unmount(); scope.stop() } }
}
function mockSubmission(finalizeDraft: QuotationOrderSubmissionInput['finalizeDraft']) {
  const values = new Map<string, unknown>()
  const storage: StoragePort = {
    read: async <T>(key: { key: string }) => ({ state: 'succeeded', data: (values.get(key.key) ?? null) as T | null }),
    write: async (key, value) => { values.set(key.key, value); return { state: 'succeeded' } },
    remove: async key => { values.delete(key.key); return { state: 'succeeded' } },
    listKeys: async () => ({ state: 'succeeded', data: [] }),
  }
  const start = vi.fn(async () => ({ state: 'succeeded' as const, data: 'synthetic-workflow' }))
  const upsert = vi.fn(async () => ({ state: 'succeeded' as const, data: order.id }))
  const input: QuotationOrderSubmissionInput = {
    userId: asOpaqueId<'UserId'>('synthetic-success-user'), authorizationIdentityKey: 'synthetic-scope', authorizationCurrent: () => true,
    workOrderId: asOpaqueId<'WorkOrderId'>(order.serviceAppointmentId), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'),
    workflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>('synthetic-definition'), expectedDraftVersion: 1, evaluatedDraftVersion: 1, engineReady: true,
    payload: { type: 1, serviceAppointmentId: order.serviceAppointmentId, productIds: '[]', bjProducts: '{"orderList":[]}', totalPrice: 2160, originPrice: 2160,
      discount: 1, otherAmount: 0, preferentialAmount: 0, exts: { serviceType: 'synthetic', coupons: '', couponsVal: 0, couponsName: '', isCreateBjdPDF: '1' } },
    command: { startOrderWorkflow: start, upsertOfficialOrder: upsert },
    readApi: { getQuotationOrderById: async () => ({ state: 'succeeded', data: order }), listTypeOneOrdersForWorkOrder: async () => ({ state: 'succeeded', data: { items: [], page: 1, pageSize: 3, totalCount: 0 } }) },
    storage, finalizeDraft,
  }
  return { input, start, upsert }
}

describe('verified quotation success handoff (actual Vue SFC + mock command protocol)', () => {
  it('only accepts a quotation route matching the resolved place_order action', () => {
    expect(quotationSuccessRouteMatches('place_order', 'place_order')).toBe(true)
    expect(quotationSuccessRouteMatches(undefined, 'place_order')).toBe(true)
    for (const route of ['interact_with_form', 'set_appointment', '', 'unknown']) {
      expect(quotationSuccessRouteMatches(route, 'place_order')).toBe(false)
    }
    expect(quotationSuccessRouteMatches('place_order', 'interact_with_form')).toBe(false)
    expect(quotationSuccessRouteMatches(undefined, 'interact_with_form')).toBe(false)
  })
  it('submits once, clears the draft, displays server order, and navigates read-only once even on repeated taps', async () => {
    const h = harness()
    const composition = useQuotationCompositionStore(createPinia())
    composition.draft = appendQuotationGroup(createEmptyQuotationDraft(order.serviceAppointmentId, 'synthetic-node'), createQuotationGroup('synthetic-group'))
    composition.localState = 'saved_local'
    const finalize = vi.fn(async () => { composition.clear(); return { state: 'succeeded' as const } })
    const command = mockSubmission(finalize)
    try {
      h.update({ result: { state: 'submitting' } })
      h.update({ result: await submitQuotationOrder(command.input) })
      await Vue.nextTick()
      expect(composition.draft).toBeNull(); expect(composition.groups).toHaveLength(0)
      expect(composition.localState).toBe('idle'); expect(finalize).toHaveBeenCalledOnce()
      expect(find(h.root, 'quotation-order-success')).toBeDefined()
      expect(text(h.root)).toContain('订单ID：'); expect(text(h.root)).toContain(order.id); expect(text(h.root)).toContain('2160.00')
      expect(text(h.root)).not.toContain('报价草稿'); expect(text(h.root)).not.toContain('0 项')
      const tap = find(h.root, 'quotation-success-open-orders')!.props.onTap
      tap(); tap(); await Vue.nextTick()
      expect(h.navigate).toHaveBeenCalledOnce(); expect(find(h.root, 'existing-order-hub')).toBeDefined()
      expect(command.start).toHaveBeenCalledOnce(); expect(command.upsert).toHaveBeenCalledOnce()
    } finally { h.close() }
  })
  it.each(['write_succeeded_readback_pending', 'failed_ambiguous_after_dispatch', 'failed_terminal'] as const)('never exposes or navigates a %s result', async state => {
    const h = harness()
    try {
      h.update({ result: { state: 'submitting' } }); h.update({ result: { state, order } }); await Vue.nextTick()
      expect(find(h.root, 'quotation-order-success')).toBeUndefined()
      expect(h.handoff.open(h.navigate)).toBe(false); expect(h.navigate).not.toHaveBeenCalled()
    } finally { h.close() }
  })
  it.each(['role', 'logout', 'action', 'work'] as const)('revokes success and stale button callbacks after %s changes, including switching back', async change => {
    const h = harness()
    try {
      h.update({ result: { state: 'submitting' } }); h.update({ result: { state: 'succeeded', order } }); await Vue.nextTick()
      const tap = find(h.root, 'quotation-success-open-orders')!.props.onTap
      const original = h.current.value
      h.update(change === 'role' ? { scope: 'other-role' } : change === 'logout' ? { scope: null } : change === 'action' ? { action: {} } : { scope: 'other-work', workOrderId: 'other-work' })
      tap(); h.update(original); tap(); await Vue.nextTick()
      expect(h.navigate).not.toHaveBeenCalled(); expect(h.handoff.order.value).toBeNull()
    } finally { h.close() }
  })
  it('rejects unobserved success, missing order, mismatched work and non-official order', () => {
    const h = harness()
    try {
      h.update({ result: { state: 'succeeded', order } }); expect(h.handoff.order.value).toBeNull()
      h.update({ result: { state: 'submitting' } })
      for (const bad of [undefined, { ...order, serviceAppointmentId: 'other' }, { ...order, type: 0 }]) {
        h.update({ result: { state: 'succeeded', order: bad } }); expect(h.handoff.open(h.navigate)).toBe(false)
      }
      expect(h.navigate).not.toHaveBeenCalled()
    } finally { h.close() }
  })
  it('keeps a readback retry in the original scope eligible, but rejects a late success after an in-flight scope change', () => {
    const h = harness()
    try {
      h.update({ result: { state: 'submitting' } })
      h.update({ result: { state: 'write_succeeded_readback_pending' } })
      expect(h.handoff.order.value).toBeNull()
      h.update({ result: { state: 'succeeded', order } })
      expect(h.handoff.order.value?.id).toBe(order.id)
      h.update({ result: { state: 'submitting' } })
      h.update({ scope: 'replacement-role' })
      h.update({ result: { state: 'succeeded', order } })
      expect(h.handoff.order.value).toBeNull(); expect(h.handoff.open(h.navigate)).toBe(false)
    } finally { h.close() }
  })
  it('reset for a new/editor entry cannot reuse the prior saved order', () => {
    const h = harness()
    try {
      h.update({ result: { state: 'submitting' } }); h.update({ result: { state: 'succeeded', order } })
      h.handoff.reset(); expect(h.handoff.order.value).toBeNull(); expect(h.handoff.open(h.navigate)).toBe(false)
    } finally { h.close() }
  })
})

// Mount the real parent page as well: route hooks and stores are controlled
// dependencies, while its actual template, scope checks and handlers execute.
async function mountedParent(realStore = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const composition = useQuotationCompositionStore(pinia)
  composition.draft = createEmptyQuotationDraft(order.serviceAppointmentId, 'synthetic-node')
  composition.localState = 'saved_local'
  const actor = Vue.reactive<{ status: string; session: SessionSnapshot }>({ status: 'authenticated', session: { sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'), user: { id: asOpaqueId<'UserId'>('synthetic-user') }, currentRole: { id: asOpaqueId<'RoleId'>('role-a') }, roleVersion: 'v1', capabilityNames: [] } })
  const workspaceDouble = Vue.reactive({
    descriptor: { contentKind: 'quotation', actionIntent: 'place_order', workOrderId: order.serviceAppointmentId, workflowNodeId: 'synthetic-node' },
    loadState: 'succeeded', quotationContentState: 'ready', quotationEditState: { state: 'idle' },
    quotationOrderState: { state: 'idle' } as QuotationSuccessContext['result'], detail: {},
    ensureLoaded: vi.fn(async () => ({ state: 'succeeded' })), clear: vi.fn(), flushDraft: vi.fn(),
  })
  const commands = mockSubmission(async () => { throw Error('Real store must supply its own finalizer') })
  const workspace = realStore ? useActionWorkspaceStore(pinia) : workspaceDouble
  if (realStore) {
    const actual = workspace as ReturnType<typeof useActionWorkspaceStore>
    const apiRead = {
      getWorkOrderDetail: async () => ({ state: 'succeeded', data: {
        id: asOpaqueId<'WorkOrderId'>(order.serviceAppointmentId), displayNumber: 'SYNTHETIC-1', customerName: 'Synthetic',
        quotationCatalogContext: { serviceType: 'synthetic-service', sourceType: 'synthetic-source' },
        workflowNodes: [{ id: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'), category: 'placeOrder', lifecycle: 'active', displayName: 'Synthetic quotation',
          childWorkflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>('synthetic-definition'),
          visibility: { evidenceState: 'verified', viewableRoleIds: [asOpaqueId<'RoleId'>('role-a')] } }],
      } }),
      getCascadeCodeOptions: async () => ({ state: 'succeeded', data: { items: [{ value: 'synthetic-roof', label: 'Synthetic roof' }] } }),
    } as unknown as TechnicianApiReadPort
    const catalog = {
      listProcedures: async () => ({ state: 'succeeded', data: { items: [{ id: 'synthetic-procedure', kind: 'procedure', name: 'Synthetic procedure', unit: '处', guideUnitPrice: 10, minimumGuideTotalPrice: 0 }], page: 1, pageSize: 20, totalCount: 1 } }),
      listMaterials: async () => ({ state: 'succeeded', data: { items: [{ id: 'synthetic-material', kind: 'material', name: 'Synthetic material', unit: '桶', price: 2150 }], page: 1, pageSize: 20, totalCount: 1 } }),
    } as unknown as QuotationCatalogReadPort
    actual.configure({ apiRead, commandApi: {} as TechnicianApiCommandPort, quotationCatalogRead: catalog,
      quotationOrderCommand: commands.input.command, quotationOrderRead: commands.input.readApi,
      storage: commands.input.storage, draftRepository: createActionDraftRepository(commands.input.storage),
      getSession: () => actor.session,
      navigation: { navigate: vi.fn(), replace: vi.fn(), reset: vi.fn(), back: vi.fn() }, debounceMs: 0 })
  }
  let load!: (options: Record<string, string>) => void
  const title = vi.fn()
  const hubRead = vi.fn()
  const dummy = Vue.defineComponent({ setup: () => () => Vue.h('view') })
  const Hub = Vue.defineComponent({ props: ['workOrderId'], setup(props) { hubRead(props.workOrderId); return () => Vue.h('view', { 'data-testid': 'real-page-order-hub' }) } })
  const modules: Record<string, unknown> = {
    vue: Vue,
    '@dcloudio/uni-app': { onLoad: (fn: typeof load) => { load = fn }, onShow: () => {}, onHide: () => {}, onBackPress: () => {}, onUnload: () => {} },
    '@features/work-orders/normal-form-action-page': { useNormalFormActionPage },
    '@shared/state': { useSessionStore: () => actor },
    '@shared/config': { isProductionReadOnlyRuntime: () => false },
    '@features/home/access': { hasAuthenticatedSession: (status: string) => status === 'authenticated' },
    '@features/work-orders/action-workspace': { useActionWorkspaceStore: () => workspace, parseActionWorkspaceId: (id: string) => id, parseActionWorkspaceNodeId: (id: string) => id },
    '@features/work-orders/quotation/composition-store': { useQuotationCompositionStore: () => composition },
    '@features/work-orders/quotation/success-handoff': { useQuotationSuccessHandoff, quotationSuccessRouteMatches },
    '@features/work-orders/quotation/QuotationOrderSuccess.vue': { __esModule: true, default: component() },
    '@features/work-orders/quotation/QuotationOrderHub.vue': { __esModule: true, default: Hub },
    '@shared/session-authorization': { sessionAuthorizationFingerprint },
    '@app/business-mock': { isBusinessMockQuotationPreview: () => false, isDevSyntheticContractReadPreviewEnabled: () => false },
    '@app/a-stage-quotation-mock-ui': { isAStageMockOrderEnabled: () => false },
    '@app/mock-journey': { mockJourneyContext: () => null },
    '@app/action-page-title': { setActionWorkspacePageTitle: title },
  }
  const filename = path.resolve('src/pages/work-orders/action-workspace.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, { id: 'actual-quotation-parent', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => tag === 'navigator' } } }).content.replaceAll('import.meta.env', '({DEV:false})')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} as { default: Vue.Component } }
  new Function('require', 'module', 'exports', js)((key: string) => modules[key] ?? (key.endsWith('.vue') ? { __esModule: true, default: dummy } : {}), module, module.exports)
  const root = node('root')
  const app = renderer.createApp(module.exports.default)
  app.component('navigator', dummy)
  app.mount(root)
  const route = { id: order.serviceAppointmentId, node: 'synthetic-node', action: 'place_order' }
  load(route)
  await Vue.nextTick(); await Vue.nextTick()
  if (realStore) await vi.waitFor(() => expect({ state: workspace.loadState, error: (workspace as ReturnType<typeof useActionWorkspaceStore>).error }).toEqual({ state: 'succeeded', error: null }))
  return { workspace, composition, actor, title, hubRead, root, route, load, commands, close: () => app.unmount() }
}

describe('actual action-workspace page success wiring', () => {
  it('replaces the editor after mock submission and cleared draft; uses its own handler to mount the existing hub once', async () => {
    const h = await mountedParent()
    const command = mockSubmission(async () => { h.composition.clear(); return { state: 'succeeded' } })
    try {
      h.workspace.quotationOrderState = { state: 'submitting' }
      h.workspace.quotationOrderState = await submitQuotationOrder(command.input)
      await Vue.nextTick()
      expect(find(h.root, 'quotation-order-success')).toBeDefined()
      expect(h.title).toHaveBeenLastCalledWith('订单已提交')
      expect(h.composition.draft).toBeNull()
      const tap = find(h.root, 'quotation-success-open-orders')!.props.onTap
      tap(); tap(); await Vue.nextTick()
      expect(find(h.root, 'real-page-order-hub')).toBeDefined()
      expect(h.hubRead).toHaveBeenCalledOnce(); expect(h.hubRead).toHaveBeenCalledWith(order.serviceAppointmentId)
      expect(h.workspace.flushDraft).not.toHaveBeenCalled()
      expect(command.start).toHaveBeenCalledOnce(); expect(command.upsert).toHaveBeenCalledOnce()
    } finally { h.close() }
  })
  it.each(['action', 'work', 'node', 'role'] as const)('rejects stale success navigation when actual parent %s binding changes', async change => {
    const h = await mountedParent()
    try {
      h.workspace.quotationOrderState = { state: 'submitting' }
      h.composition.clear()
      h.workspace.quotationOrderState = { state: 'succeeded', order }
      await Vue.nextTick()
      const tap = find(h.root, 'quotation-success-open-orders')!.props.onTap
      if (change === 'role') h.actor.session = { ...h.actor.session, currentRole: { id: asOpaqueId<'RoleId'>('other-role') } }
      else h.load({ ...h.route, ...(change === 'action' ? { action: 'interact_with_form' } : change === 'work' ? { id: 'other-work' } : { node: 'other-node' }) })
      tap(); await Vue.nextTick()
      expect(h.hubRead).not.toHaveBeenCalled()
      expect(find(h.root, 'quotation-order-success')).toBeUndefined()
    } finally { h.close() }
  })
})


it('real Pinia Action Workspace submission keeps descriptor stable through draft finalization and parent success/hub navigation', async () => {
  const h = await mountedParent(true)
  const workspace = h.workspace as ReturnType<typeof useActionWorkspaceStore>
  try {
    expect(workspace.descriptor).toMatchObject({ contentKind: 'quotation', actionIntent: 'place_order', execution: 'enabled' })
    const descriptor = workspace.descriptor
    const group = h.composition.createGroup({ repairParts: ['synthetic-roof'], partDescription: 'Synthetic repair', maintainAreaNum: '1' })
    expect(group.state).toBe('succeeded')
    workspace.quotationCatalogBrowser.open('material')
    await workspace.quotationCatalogBrowser.loadList('material')
    expect(workspace.addQuotationCatalogSelection(group.data!, 'material', 'synthetic-material').state).toBe('succeeded')
    workspace.quotationCatalogBrowser.open('procedure')
    await workspace.quotationCatalogBrowser.loadList('procedure')
    expect(workspace.addQuotationCatalogSelection(group.data!, 'procedure', 'synthetic-procedure').state).toBe('succeeded')
    await workspace.refreshQuotationEngine()
    expect(workspace.quotationEngine.result?.issues).toEqual([])
    expect(workspace.quotationEngine.result).toMatchObject({ state: 'ready' })
    expect(workspace.canSubmitQuotation).toBe(true)
    const flight = workspace.submitQuotationOrder()
    expect(workspace.quotationOrderState.state).toBe('submitting')
    expect(workspace.descriptor).toBe(descriptor)
    expect((await flight).state).toBe('succeeded')
    expect(workspace.descriptor).toBe(descriptor)
    expect(h.composition.draft).toBeNull()
    expect(h.composition.localState).toBe('idle')
    expect(workspace.draftStatus).toBe('clean')
    await Vue.nextTick()
    expect(find(h.root, 'quotation-order-success')).toBeDefined()
    const tap = find(h.root, 'quotation-success-open-orders')!.props.onTap
    tap(); tap(); await Vue.nextTick()
    expect(find(h.root, 'real-page-order-hub')).toBeDefined()
    expect(h.hubRead).toHaveBeenCalledOnce()
    expect(h.commands.start).toHaveBeenCalledOnce(); expect(h.commands.upsert).toHaveBeenCalledOnce()
  } finally { h.close(); workspace.clear() }
})
