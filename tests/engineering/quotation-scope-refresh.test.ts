import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as Vue from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { compileScript, parse } from '@vue/compiler-sfc';
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace';
import { useQuotationOrderBrowseStore } from '@features/work-orders/quotation/order-browse-store';
import { createActionDraftRepository } from '@runtimes/action';
import * as language from '@shared/ui/ux-state-language';
import * as numbers from '@shared/ui/work-order-number-display';
import * as routes from '@features/work-orders/signing/signing-review-read-workspace';
import * as policy from '@shared/signing-order-read-policy';
import type { SessionSnapshot, StoragePort, TechnicianApiReadPort, TechnicianApiCommandPort, QuotationCatalogReadPort, QuotationOrderRead, QuotationOrderReadPort, QuotationOrderBrowseItem, QuotationOrderCommandPort, WorkOrderDetail } from '@shared/ports';
import { asOpaqueId, type OperationSnapshot } from '@shared/types';
const ok = <T>(data: T) => ({
    state: 'succeeded' as const, data
});
const session: SessionSnapshot = {
    sessionRef: asOpaqueId<'SessionRef'>('scope-session'), user: {
        id: asOpaqueId<'UserId'>('scope-user')
    }, currentRole: {
        id: asOpaqueId<'RoleId'>('scope-role')
    }, roleVersion: 'v1', capabilityNames: []
};
const detail = (work: string) => ({
    id: asOpaqueId<'WorkOrderId'>(work), displayNumber: work, customerName: 'Synthetic', quotationCatalogContext: {
        serviceType: 'synthetic', sourceType: 'synthetic'
    }, workflowNodes: [{
            id: asOpaqueId<'WorkflowNodeRuntimeId'>(work + '-node'), category: 'placeOrder' as const, lifecycle: 'active' as const, displayName: '报价', childWorkflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>('quote-def'), visibility: {
                evidenceState: 'verified' as const, viewableRoleIds: [session.currentRole!.id]
            }
        }]
});
function order(work = 'scope-a'): QuotationOrderRead {
    return {
        id: 'order-' + work, type: 1, serviceAppointmentId: work, state: 1, processState: 0, discount: 1, preferentialAmount: 0, coupons: '', bjProducts: {
            orderList: [{
                    repairParts: ['roof'], partDescription: 'area', maintainAreaNum: '12', projPackages: {
                        data: [], totalAmount: 0
                    }, procedures: {
                        data: [{
                                _id: 'procedure', name: 'procedure', number: 1
                            }]
                    }, materials: {
                        data: [{
                                _id: 'material', name: 'material', number: 1
                            }]
                    }, measures: {
                        data: []
                    }
                }], addItems: {
                data: []
            }, deleteItems: {
                data: []
            }
        }, replaceSnapshot: {
            _id: 'order-' + work, type: 1, serviceAppointmentId: work, productIds: '[]', exts: {}
        }
    };
}
function workspace() {
    const values = new Map<string, unknown>();
    const storage: StoragePort = {
        read: async <T>(k: {
            key: string;
        }) => ok((values.get(k.key) ?? null) as T | null), write: async (k, v) => {
            values.set(k.key, v);
            return ok(undefined);
        }, remove: async (k) => {
            values.delete(k.key);
            return ok(undefined);
        }, listKeys: async () => ok([...values.keys()])
    };
    const getOrder = vi.fn(async (id: string) => ok(order(id.slice('order-'.length))));
    const catalog = {
        listProcedures: async () => ok({
            items: [{
                    id: 'procedure', kind: 'procedure', name: 'procedure', unit: '处', guideUnitPrice: 10, minimumGuideTotalPrice: 0
                }], page: 1, pageSize: 20, totalCount: 1
        }), listMaterials: async () => ok({
            items: [{
                    id: 'material', kind: 'material', name: 'material', unit: '桶', price: 20
                }], page: 1, pageSize: 20, totalCount: 1
        })
    } as unknown as QuotationCatalogReadPort;
    let activeSession: SessionSnapshot | null = session;
    const start = vi.fn(async (_input: Parameters<QuotationOrderCommandPort['startOrderWorkflow']>[0]) => ({
        state: 'failed_terminal' as const
    }));
    const upsert = vi.fn(async (_input: Parameters<QuotationOrderCommandPort['upsertOfficialOrder']>[0]) => ({
        state: 'failed_terminal' as const
    }));
    const getDetail = vi.fn<(id: string) => Promise<OperationSnapshot<WorkOrderDetail>>>(async (id) => ok(detail(id)));
    const store = useActionWorkspaceStore();
    store.configure({
        apiRead: {
            getWorkOrderDetail: getDetail, getCascadeCodeOptions: async () => ok({
                items: [{
                        value: 'roof', label: 'Roof'
                    }]
            })
        } as unknown as TechnicianApiReadPort, commandApi: {} as TechnicianApiCommandPort, quotationCatalogRead: catalog, quotationOrderCommand: {
            startOrderWorkflow: start, upsertOfficialOrder: upsert
        } as QuotationOrderCommandPort, quotationOrderRead: {
            getQuotationOrderById: getOrder
        } as unknown as QuotationOrderReadPort, storage, draftRepository: createActionDraftRepository(storage), navigation: {
            navigate: vi.fn(), back: vi.fn()
        }, getSession: () => activeSession, debounceMs: 0
    });
    const load = async (work: string) => {
        expect((await store.load({
            workOrderId: asOpaqueId<'WorkOrderId'>(work), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(work + '-node')
        })).state).toBe('succeeded');
    };
    return {
        store, load, getOrder, getDetail, values, storage, start, upsert, setSession: (next: SessionSnapshot | null) => {
            activeSession = next;
        }
    };
}
interface Host {
    type: string;
    props: Record<string, any>;
    text: string;
    children: Host[];
    parent: Host | null;
}
const node = (type: string, text = ''): Host => ({
    type, text, props: {}, children: [], parent: null
});
const renderer = Vue.createRenderer<Host, Host>({
    patchProp: (e, k, _p, v) => {
        e.props[k] = v;
    }, insert(e, p, a = null) {
        if (e.parent)
            e.parent.children.splice(e.parent.children.indexOf(e), 1);
        e.parent = p;
        const i = a ? p.children.indexOf(a) : -1;
        if (i < 0)
            p.children.push(e);
        else
            p.children.splice(i, 0, e);
    }, remove(e) {
        if (e.parent)
            e.parent.children.splice(e.parent.children.indexOf(e), 1);
        e.parent = null;
    }, createElement: t => node(t), createText: t => node('#text', t), createComment: t => node('#comment', t), setText: (e, t) => {
        e.text = t;
    }, setElementText: (e, t) => {
        e.children = [];
        e.text = t;
    }, parentNode: e => e.parent, nextSibling: e => e.parent?.children[e.parent.children.indexOf(e) + 1] ?? null
});
const ui = Vue.defineComponent({
    inheritAttrs: false, setup: (_p, c) => () => Vue.h('view', c.attrs, c.slots.default?.())
});
function hub() {
    const filename = resolve('src/features/work-orders/quotation/QuotationOrderHub.vue');
    const { descriptor } = parse(readFileSync(filename, 'utf8'), {
        filename
    });
    const source = compileScript(descriptor, {
        id: 'hub-contract', inlineTemplate: true, templateOptions: {
            compilerOptions: {
                isCustomElement: tag => tag === 'navigator'
            }
        }
    }).content.replaceAll('import.meta.env.DEV', 'true');
    const js = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true
        }
    }).outputText;
    const modules: Record<string, unknown> = {
        vue: Vue, './order-browse-store': {
            useQuotationOrderBrowseStore
        }, '@shared/ui/ux-state-language': language, '@shared/ui/work-order-number-display': numbers, '@features/work-orders/signing/signing-review-read-workspace': routes, '@shared/signing-order-read-policy': policy
    };
    const m = {
        exports: {} as {
            default: Vue.Component;
        }
    };
    new Function('require', 'module', 'exports', js)((k: string) => {
        if (k.endsWith('.vue') && k.startsWith('@shared/ui/'))
            return {
                __esModule: true, default: ui
            };
        if (!(k in modules))
            throw Error('Unmapped import ' + k);
        return modules[k];
    }, m, m.exports);
    return m.exports.default;
}
const row = (id: string, work = 'scope-a'): QuotationOrderBrowseItem => ({
    id, type: 1, serviceAppointmentId: work, groups: [], contentSupported: false, pdfState: 'absent'
});
const page = (id: string, work = 'scope-a') => ok({
    items: [row(id, work)], page: 1, pageSize: 3, totalCount: 1
});
const tick = async () => {
    for (let i = 0; i < 12; i++)
        await Vue.nextTick();
};
function contents(n: Host): string {
    return n.text + ' ' + n.children.map(contents).join(' ');
}
function action(n: Host, label: string): Host | undefined {
    if (typeof n.props.onTap === 'function' && contents(n).includes(label))
        return n;
    return n.children.map(x => action(x, label)).find(Boolean);
}
beforeEach(() => setActivePinia(createPinia()));
describe('quotation action identity and authoritative hub refresh', () => {
    it('clears blocked edit status on a genuine new quotation action load', async () => {
        const h = workspace();
        await h.load('scope-a');
        h.getOrder.mockResolvedValueOnce(ok({
            ...order(), serviceAppointmentId: 'foreign'
        }));
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('failed_terminal');
        expect(h.store.quotationEditState.state).toBe('blocked');
        await h.load('scope-b');
        expect(h.store.quotationEditState).toEqual({
            state: 'none'
        });
        expect(h.store.descriptor?.workOrderId).toBe('scope-b');
    });
    it('does not show old ready edit identity after loading another work order', async () => {
        const h = workspace();
        await h.load('scope-a');
        const edited = await h.store.loadQuotationOrderForEdit('order-scope-a');
        expect(edited).toMatchObject({
            state: 'succeeded'
        });
        expect(h.store.quotationEditState.state).toBe('ready');
        await h.load('scope-b');
        expect(h.store.quotationEditState).toEqual({
            state: 'none'
        });
    });
    it('a real hub mount refreshes a same-scope cached successful page', async () => {
        const read = vi.fn().mockResolvedValueOnce(page('old')).mockResolvedValueOnce(page('fresh'));
        const browse = useQuotationOrderBrowseStore();
        browse.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => session);
        await browse.load('scope-a', 3);
        const root = node('root');
        const app = renderer.createApp(hub(), {
            workOrderId: 'scope-a', localDraftGroupCount: 0, localDraftState: 'fresh', readOnly: true
        });
        app.component('navigator', ui);
        app.mount(root);
        try {
            await tick();
            expect(read).toHaveBeenCalledTimes(2);
            expect(browse.items.map(x => x.id)).toEqual(['fresh']);
        }
        finally {
            app.unmount();
        }
    });
    it('unchanged action reentry and explicit reload retain a verified same-order edit', async () => {
        const h = workspace();
        await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        const draft = h.store.quotationComposition.draft;
        expect((await h.store.ensureLoaded({
            workOrderId: asOpaqueId<'WorkOrderId'>('scope-a'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('scope-a-node')
        })).state).toBe('succeeded');
        expect(h.store.quotationComposition.draft).toBe(draft);
        await h.load('scope-a');
        expect(h.store.quotationEditState.state).toBe('ready');
        expect((await h.store.refreshQuotationEngine())?.state).toBe('ready');
        h.getOrder.mockClear();
        await h.store.submitQuotationOrder();
        expect(h.getOrder).toHaveBeenCalledWith('order-scope-a');
        expect(h.start).not.toHaveBeenCalled();
        expect(h.upsert).toHaveBeenCalledOnce();
    });
    it('a new action starts its own submission rather than reading the old edit ID; uncertainty survives returning', async () => {
        const h = workspace();
        await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        await h.load('scope-b');
        const comp = h.store.quotationComposition;
        const group = comp.createGroup({
            repairParts: ['roof'], partDescription: 'area', maintainAreaNum: '12'
        });
        expect(group.state).toBe('succeeded');
        expect(comp.addCatalogReadItem(group.data!, {
            id: 'procedure', kind: 'procedure', name: 'procedure', unit: '处'
        }).state).toBe('succeeded');
        expect(comp.addCatalogReadItem(group.data!, {
            id: 'material', kind: 'material', name: 'material', unit: '桶'
        }).state).toBe('succeeded');
        expect((await h.store.refreshQuotationEngine())?.state).toBe('ready');
        h.getOrder.mockClear();
        const [a, b] = await Promise.all([h.store.submitQuotationOrder(), h.store.submitQuotationOrder()]);
        expect(a.state).toBe('failed_ambiguous_after_dispatch');
        expect(b.state).toBe(a.state);
        expect(h.getOrder).not.toHaveBeenCalled();
        expect(h.start).toHaveBeenCalledOnce();
        expect(h.start.mock.calls[0][0]).toMatchObject({
            workOrderId: 'scope-b'
        });
        expect(h.upsert).not.toHaveBeenCalled();
        const receipts = [...h.values.entries()].filter(([k]) => k.startsWith('quotation-order-receipt:'));
        expect(receipts).toHaveLength(1);
        const receipt = JSON.stringify(receipts);
        await h.load('scope-a');
        await h.load('scope-b');
        expect(h.store.quotationOrderState.state).toBe('failed_ambiguous_after_dispatch');
        expect(JSON.stringify([...h.values.entries()].filter(([k]) => k.startsWith('quotation-order-receipt:')))).toBe(receipt);
        await h.store.refreshQuotationEngine();
        await h.store.submitQuotationOrder();
        expect(h.start).toHaveBeenCalledOnce();
    });
    it('ignores a late edit preflight from the previous action', async () => {
        const h = workspace();
        await h.load('scope-a');
        let release!: (v: ReturnType<typeof ok<QuotationOrderRead>>) => void;
        h.getOrder.mockImplementationOnce(() => new Promise(r => {
            release = r;
        }));
        const old = h.store.loadQuotationOrderForEdit('order-scope-a');
        await h.load('scope-b');
        release(ok(order()));
        expect((await old).state).toBe('failed_terminal');
        expect(h.store.quotationEditState).toEqual({
            state: 'none'
        });
        expect(h.store.quotationComposition.groups).toHaveLength(0);
        expect(h.start).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
    });
    it('does not carry ready edit state into a new authenticated session', async () => {
        const h = workspace();
        await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        h.setSession({
            ...session, sessionRef: asOpaqueId<'SessionRef'>('replacement-session')
        });
        await h.load('scope-a');
        expect(h.store.quotationEditState).toMatchObject({
            state: 'blocked'
        });
        expect(h.store.quotationEditState.message).toContain('不能改走新建订单');
        expect(h.store.canSubmitQuotation).toBe(false);
        expect(h.start).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
    });
    it('normal loads still cache, but refresh coalesces pending reads and replaces successful rows', async () => {
        let release!: (v: ReturnType<typeof page>) => void;
        const read = vi.fn().mockResolvedValueOnce(page('cached')).mockImplementationOnce(() => new Promise(r => {
            release = r;
        }));
        const b = useQuotationOrderBrowseStore();
        b.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => session);
        await b.load('scope-a');
        await b.load('scope-a');
        expect(read).toHaveBeenCalledOnce();
        const one = b.refresh('scope-a'), two = b.refresh('scope-a');
        await tick();
        expect(b.state).toBe('loading');
        expect(b.items).toEqual([]);
        expect(read).toHaveBeenCalledTimes(2);
        release(page('fresh'));
        expect((await one).state).toBe('succeeded');
        expect((await two).state).toBe('succeeded');
        expect(b.items.map(x => x.id)).toEqual(['fresh']);
        await b.load('scope-a');
        expect(read).toHaveBeenCalledTimes(2);
    });
    it('failed refresh never revives the old cache and a normal retry reads again', async () => {
        const read = vi.fn().mockResolvedValueOnce(page('old')).mockResolvedValueOnce({
            state: 'failed_retryable'
        }).mockResolvedValueOnce(page('recovered'));
        const b = useQuotationOrderBrowseStore();
        b.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => session);
        await b.load('scope-a');
        expect((await b.refresh('scope-a')).state).toBe('failed_retryable');
        expect(b.items).toEqual([]);
        expect((await b.load('scope-a')).state).toBe('succeeded');
        expect(read).toHaveBeenCalledTimes(3);
        expect(b.items[0].id).toBe('recovered');
    });
    it('an invalidated or superseded refresh cannot reinstall stale rows', async () => {
        let release!: (v: ReturnType<typeof page>) => void;
        const read = vi.fn().mockResolvedValueOnce(page('old')).mockImplementationOnce(() => new Promise(r => {
            release = r;
        })).mockResolvedValueOnce(page('other', 'scope-b'));
        const b = useQuotationOrderBrowseStore();
        b.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => session);
        await b.load('scope-a');
        const stale = b.refresh('scope-a');
        await tick();
        await b.load('scope-b');
        release(page('late'));
        expect((await stale).state).toBe('failed_terminal');
        expect(b.items.map(x => x.id)).toEqual(['other']);
    });
    it('the actual hub retry button rereads once on repeated taps and recovers from failure', async () => {
        const read = vi.fn().mockResolvedValueOnce({
            state: 'failed_retryable'
        }).mockResolvedValueOnce(page('recovered'));
        const b = useQuotationOrderBrowseStore();
        b.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => session);
        const root = node('root');
        const app = renderer.createApp(hub(), {
            workOrderId: 'scope-a', localDraftGroupCount: 0, localDraftState: 'fresh', readOnly: true
        });
        app.component('navigator', ui);
        app.mount(root);
        try {
            await tick();
            expect(b.state).toBe('failed_retryable');
            const retry = action(root, '重新读取');
            expect(retry).toBeDefined();
            retry!.props.onTap();
            retry!.props.onTap();
            await tick();
            expect(read).toHaveBeenCalledTimes(2);
            expect(b.items[0].id).toBe('recovered');
        }
        finally {
            app.unmount();
        }
    });
    it('the real hub scope watcher rereads and rejects the earlier refresh completion', async () => {
        let release!: (v: ReturnType<typeof page>) => void;
        const read = vi.fn().mockImplementationOnce(() => new Promise(r => {
            release = r;
        })).mockResolvedValueOnce(page('other', 'scope-b'));
        const b = useQuotationOrderBrowseStore();
        b.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => session);
        const current = Vue.ref('scope-a');
        const Hub = hub(), root = node('root');
        const app = renderer.createApp(Vue.defineComponent({
            setup: () => () => Vue.h(Hub, {
                workOrderId: current.value, localDraftGroupCount: 0, localDraftState: 'fresh', readOnly: true
            })
        }));
        app.component('navigator', ui);
        app.mount(root);
        try {
            await tick();
            current.value = 'scope-b';
            await tick();
            release(page('late'));
            await tick();
            expect(read).toHaveBeenCalledTimes(2);
            expect(b.fetchedWorkOrderId).toBe('scope-b');
            expect(b.items.map(x => x.id)).toEqual(['other']);
            expect(contents(root)).not.toContain('late');
        }
        finally {
            app.unmount();
        }
    });
    it('refresh observes logout and cannot reinstall a successful old page', async () => {
        let current: SessionSnapshot | null = session, release!: (v: ReturnType<typeof page>) => void;
        const read = vi.fn().mockResolvedValueOnce(page('old')).mockImplementationOnce(() => new Promise(r => {
            release = r;
        }));
        const b = useQuotationOrderBrowseStore();
        b.configure({
            listTypeOneOrdersForWorkOrder: read
        } as unknown as QuotationOrderReadPort, () => current);
        await b.load('scope-a');
        const pending = b.refresh('scope-a');
        await tick();
        current = null;
        release(page('late'));
        expect((await pending).state).toBe('failed_terminal');
        expect(b.items).toEqual([]);
        expect(b.state).toBe('idle');
    });
    it('a different quotation node in the same work order cannot inherit the old edit', async () => {
        const h = workspace();
        await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        const next = detail('scope-a');
        h.getDetail.mockResolvedValueOnce(ok({
            ...next, workflowNodes: [{
                    ...next.workflowNodes[0], id: asOpaqueId<'WorkflowNodeRuntimeId'>('other-quote-node')
                }]
        }));
        expect((await h.store.load({
            workOrderId: asOpaqueId<'WorkOrderId'>('scope-a'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('other-quote-node')
        })).state).toBe('succeeded');
        expect(h.store.quotationEditState).toEqual({
            state: 'none'
        });
        expect(h.start).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
    });
    it('an explicit same-action reload hides old edit state while pending and never restores it after failure', async () => {
        const h = workspace();
        await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        let release!: (v: OperationSnapshot<WorkOrderDetail>) => void;
        h.getDetail.mockImplementationOnce(() => new Promise(r => {
            release = r;
        }));
        const pending = h.store.load({
            workOrderId: asOpaqueId<'WorkOrderId'>('scope-a'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('scope-a-node')
        });
        await tick();
        expect(h.store.loadState).toBe('loading');
        expect(h.store.quotationEditState).toEqual({
            state: 'none'
        });
        release({
            state: 'failed_retryable'
        });
        expect((await pending).state).toBe('failed_retryable');
        expect(h.store.quotationEditState).toEqual({
            state: 'none'
        });
        expect(h.store.canSubmitQuotation).toBe(false);
    });
    it('failed same-scope reload followed by retry keeps existing-order submission identity, not create', async () => {
        const h = workspace(); await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        h.getDetail.mockResolvedValueOnce({ state: 'failed_retryable' });
        expect((await h.store.load({ workOrderId: asOpaqueId<'WorkOrderId'>('scope-a'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('scope-a-node') })).state).toBe('failed_retryable');
        expect(h.store.quotationEditState).toEqual({ state: 'none' }); expect(h.store.canSubmitQuotation).toBe(false);
        await h.load('scope-a'); expect((await h.store.refreshQuotationEngine())?.state).toBe('ready');
        expect(h.store.canSubmitQuotation).toBe(true); h.getOrder.mockClear();
        await h.store.submitQuotationOrder();
        expect(h.start).not.toHaveBeenCalled(); expect(h.getOrder).toHaveBeenCalledTimes(1); expect(h.getOrder).toHaveBeenCalledWith('order-scope-a');
        expect(h.upsert).toHaveBeenCalledOnce(); expect(h.upsert.mock.calls[0][0]).toMatchObject({ order: { _id: 'order-scope-a', serviceAppointmentId: 'scope-a' } });
        expect(h.start).not.toHaveBeenCalled();
    });

    it.each(['work', 'node', 'action', 'session', 'actor', 'role'] as const)('failed edit reload cannot lend its identity to changed %s scope', async change => {
        const h = workspace(); await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        h.getDetail.mockResolvedValueOnce({ state: 'failed_retryable' });
        await h.store.load({ workOrderId: asOpaqueId<'WorkOrderId'>('scope-a'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('scope-a-node') });
        let work = 'scope-a', node = 'scope-a-node', actionIntent = 'place_order';
        if (change === 'work') { work = 'scope-b'; node = 'scope-b-node'; }
        if (change === 'node') {
            node = 'other-node'; const next = detail(work);
            h.getDetail.mockResolvedValueOnce(ok({ ...next, workflowNodes: [{ ...next.workflowNodes[0], id: asOpaqueId<'WorkflowNodeRuntimeId'>(node) }] }));
        }
        if (change === 'action') actionIntent = 'set_appointment';
        if (change === 'session') h.setSession({ ...session, sessionRef: asOpaqueId<'SessionRef'>('replacement-session') });
        if (change === 'actor') h.setSession({ ...session, user: { id: asOpaqueId<'UserId'>('replacement-user') } });
        if (change === 'role') h.setSession({ ...session, roleVersion: 'replacement-version' });
        await h.store.load({ workOrderId: asOpaqueId<'WorkOrderId'>(work), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(node), actionIntent });
        expect(h.store.quotationEditState.state).not.toBe('ready'); h.getOrder.mockClear();
        await h.store.refreshQuotationEngine(); await h.store.submitQuotationOrder();
        expect(h.getOrder).not.toHaveBeenCalled(); expect(h.upsert).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled();
        if (change === 'session' || change === 'role') {
            h.setSession(session); await h.load('scope-a'); await h.store.refreshQuotationEngine();
            expect(h.store.quotationEditState.state).toBe('blocked'); await h.store.submitQuotationOrder();
            expect(h.getOrder).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled();
        }
    });
    it('a pending old edit read cannot install provenance after scope replacement', async () => {
        const h = workspace(); await h.load('scope-a');
        let release!: (v: ReturnType<typeof ok<QuotationOrderRead>>) => void;
        h.getOrder.mockImplementationOnce(() => new Promise(r => { release = r; }));
        const pending = h.store.loadQuotationOrderForEdit('order-scope-a'); await h.load('scope-b');
        release(ok(order())); await pending; expect(h.store.quotationEditState).toEqual({ state: 'none' });
        await h.load('scope-a'); expect(h.store.quotationEditState).toEqual({ state: 'none' });
        expect(h.store.quotationComposition.groups).toHaveLength(0); expect(h.start).not.toHaveBeenCalled(); expect(h.upsert).not.toHaveBeenCalled();
    });
    it('a late old upsert receipt cannot revive edit readiness in the new action', async () => {
        const h = workspace(); await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        let release!: (v: { state: 'failed_terminal' }) => void;
        h.upsert.mockImplementationOnce(() => new Promise(r => { release = r; }));
        const old = h.store.submitQuotationOrder(); await vi.waitFor(() => expect(h.upsert).toHaveBeenCalledOnce());
        await h.load('scope-b'); release({ state: 'failed_terminal' }); await old;
        expect(h.store.descriptor?.workOrderId).toBe('scope-b'); expect(h.store.quotationEditState).toEqual({ state: 'none' });
        expect(h.store.quotationOrderState.state).toBe('idle'); expect(h.start).not.toHaveBeenCalled(); expect(h.upsert).toHaveBeenCalledOnce();
        expect([...h.values.entries()].some(([k,v]) => k.startsWith('quotation-order-receipt:') && JSON.stringify(v).includes('ambiguous'))).toBe(true);
    });

    it('an authorization mismatch observed by the pending load revokes edit origin without a computed getter', async () => {
        const h = workspace(); await h.load('scope-a');
        expect((await h.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
        let release!: (v: OperationSnapshot<WorkOrderDetail>) => void;
        h.getDetail.mockImplementationOnce(() => new Promise(r => { release = r; }));
        const pending = h.store.load({ workOrderId: asOpaqueId<'WorkOrderId'>('scope-a'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('scope-a-node') });
        await tick(); expect(h.store.loadState).toBe('loading');
        h.setSession({ ...session, sessionRef: asOpaqueId<'SessionRef'>('pending-replacement-session') });
        // No capability/computed read while B is active: the load itself must observe revocation.
        release(ok(detail('scope-a')));
        expect(await pending).toMatchObject({ state: 'failed_terminal', error: { category: 'session_invalid' } });
        expect(h.store.loadState).toBe('idle'); expect(h.store.quotationEditState.state).toBe('none');
        h.setSession(session); await h.load('scope-a');
        expect((await h.store.refreshQuotationEngine())?.state).toBe('ready');
        h.getOrder.mockClear(); await h.store.submitQuotationOrder();
        expect(h.upsert).not.toHaveBeenCalled(); expect(h.getOrder).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled();
        expect(h.store.quotationEditState.state).toBe('blocked'); expect(h.store.canSubmitQuotation).toBe(false);
    });

});
