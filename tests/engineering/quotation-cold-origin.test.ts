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
function workspace(values = new Map<string, unknown>()) {
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

beforeEach(()=>setActivePinia(createPinia()));
it('cold runtime must not promote an existing-order draft with lost edit provenance into a new order',async()=>{
 const original=workspace();await original.load('scope-a');
 expect((await original.store.loadQuotationOrderForEdit('order-scope-a')).state).toBe('succeeded');
 expect(original.store.quotationEditState.state).toBe('ready');
 await original.store.quotationComposition.flushDraft();
 const persisted=new Map([...original.values].map(([k,v])=>[k,JSON.parse(JSON.stringify(v))]));
 expect(persisted.size).toBeGreaterThan(0);
 setActivePinia(createPinia());const cold=workspace(persisted);
 await cold.load('scope-a');expect(cold.store.quotationComposition.localState).toBe('restored');
 expect(cold.store.quotationComposition.groups).toHaveLength(1);
 expect((await cold.store.refreshQuotationEngine())?.state).toBe('ready');
 expect(cold.getOrder).not.toHaveBeenCalled();expect(cold.start).not.toHaveBeenCalled();expect(cold.upsert).not.toHaveBeenCalled();
 // No command is invoked. Refusing submission is the only safe assertion
 // while this draft's former Order identity has not been re-read.
 expect(cold.store.canSubmitQuotation).toBe(false);
});

async function storedExisting(){const w=workspace();await w.load('scope-a');await w.store.loadQuotationOrderForEdit('order-scope-a');await w.store.quotationComposition.flushDraft();return new Map([...w.values].map(([k,v])=>[k,JSON.parse(JSON.stringify(v))]));}
for(const marker of [undefined, null, {}, 'bogus'])it('unverified marker '+JSON.stringify(marker)+' retains content but direct submission dispatches zero',async()=>{
 const values=await storedExisting();for(const v of values.values()){if(marker===undefined)delete v.values.origin;else v.values.origin=marker;}
 setActivePinia(createPinia());const w=workspace(values);await w.load('scope-a');
 expect(w.store.quotationComposition.groups).toHaveLength(1);await w.store.refreshQuotationEngine();
 expect(w.store.canSubmitQuotation).toBe(false);expect((await w.store.submitQuotationOrder()).state).toBe('failed_terminal');
 expect(w.start).not.toHaveBeenCalled();expect(w.upsert).not.toHaveBeenCalled();
});
it('existing cold draft direct command is guarded and failed retry retains stored content',async()=>{
 const values=await storedExisting();const baseline=JSON.stringify([...values]);setActivePinia(createPinia());const w=workspace(values);await w.load('scope-a');await w.store.refreshQuotationEngine();
 await w.store.submitQuotationOrder();await w.store.submitQuotationOrder();expect(w.start).not.toHaveBeenCalled();expect(w.upsert).not.toHaveBeenCalled();expect(JSON.stringify([...values])).toBe(baseline);
});
it('new composition and its cold restored draft keep explicit new origin',async()=>{
 const w=workspace();await w.load('scope-a');expect(w.store.quotationComposition.origin).toBe('new');
 const group=w.store.quotationComposition.createGroup({repairParts:['roof'],partDescription:'test',maintainAreaNum:'12'});expect(group.state).toBe('succeeded');
 w.store.quotationComposition.addCatalogReadItem(group.data!,{id:'procedure',kind:'procedure',name:'procedure',unit:'处',guideUnitPrice:10,minimumGuideTotalPrice:0});
 w.store.quotationComposition.addCatalogReadItem(group.data!,{id:'material',kind:'material',name:'material',unit:'桶',price:20});
 expect((await w.store.refreshQuotationEngine())?.state).toBe('ready');expect(w.store.canSubmitQuotation).toBe(true);await w.store.quotationComposition.flushDraft();
 const values=new Map([...w.values].map(([k,v])=>[k,JSON.parse(JSON.stringify(v))]));
 setActivePinia(createPinia());const cold=workspace(values);await cold.load('scope-a');expect(cold.store.quotationComposition.origin).toBe('new');expect(cold.store.quotationEditState.state).toBe('none');expect(cold.store.quotationComposition.groups).toHaveLength(1);expect((await cold.store.refreshQuotationEngine())?.state).toBe('ready');expect(cold.store.canSubmitQuotation).toBe(true);
});
it('same-process verified existing source survives scope reload',async()=>{
 const w=workspace();await w.load('scope-a');await w.store.loadQuotationOrderForEdit('order-scope-a');await w.store.quotationComposition.flushDraft();await w.load('scope-a');await w.store.refreshQuotationEngine();expect(w.store.quotationEditState.state).toBe('ready');expect(w.store.canSubmitQuotation).toBe(true);
});

it('failed local save of loaded existing order never relabels it new',async()=>{
 const w=workspace();await w.load('scope-a');w.storage.write=async()=>({state:'failed_terminal'});
 await w.store.loadQuotationOrderForEdit('order-scope-a');expect(w.store.quotationComposition.origin).toBe('existing');expect(w.store.quotationComposition.groups).toHaveLength(1);await w.store.submitQuotationOrder();expect(w.start).not.toHaveBeenCalled();expect(w.upsert).not.toHaveBeenCalled();expect(w.store.quotationComposition.origin).toBe('existing');
});

it('legacy unknown remains unknown after editing, autosave and a second cold restart',async()=>{
 const values=await storedExisting();for(const v of values.values())delete v.values.origin;
 setActivePinia(createPinia());const w=workspace(values);await w.load('scope-a');
 expect(w.store.quotationComposition.origin).toBe('unknown');const group=w.store.quotationComposition.groups[0];
 w.store.quotationComposition.updateGroupContext(group.groupId,{repairParts:['roof'],partDescription:'retained edit',maintainAreaNum:'12'});await w.store.quotationComposition.flushDraft();
 const coldValues=new Map([...values].map(([k,v])=>[k,JSON.parse(JSON.stringify(v))]));
 setActivePinia(createPinia());const cold=workspace(coldValues);await cold.load('scope-a');expect(cold.store.quotationComposition.origin).toBe('unknown');expect(cold.store.quotationComposition.groups[0].partDescription).toBe('retained edit');await cold.store.refreshQuotationEngine();expect(cold.store.canSubmitQuotation).toBe(false);await cold.store.submitQuotationOrder();expect(cold.start).not.toHaveBeenCalled();expect(cold.upsert).not.toHaveBeenCalled();
});

// Execute the actual page's computed expression, rather than a copied title
// function. This is presentation only; it does not certify Order authority.
function actualQuotationTitle(origin:'new'|'existing'|'unknown',state:string,routeId=''){
 const source=parse(readFileSync(resolve('src/pages/work-orders/action-workspace.vue'),'utf8')).descriptor.scriptSetup!.content
 const ast=ts.createSourceFile('actual-page.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 let expression=''
 function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='workspaceNavigationTitle')expression=n.initializer!.getText(ast);ts.forEachChild(n,visit)}visit(ast)
 const get=new Function('computed','quotationHubVisible','quotationChoiceVisible','successfulQuotationOrder','routeAction','workspace','routeQuotationOrderId','quotationComposition','return '+expression)
 return get(Vue.computed,Vue.ref(false),Vue.ref(false),Vue.ref(null),Vue.ref('place_order'),{descriptor:{contentKind:'quotation'},quotationEditState:{state}},Vue.ref(routeId),{draft:{retained:true},origin}).value
}
describe('actual quotation page title on preserved cold draft',()=>{
 it.each(['existing','unknown'] as const)('labels blocked %s origin as a draft, not a new order',origin=>{expect(actualQuotationTitle(origin,'blocked')).toBe('报价草稿')})
 it('keeps reliable existing and genuine new intent distinct',()=>{expect(actualQuotationTitle('existing','ready')).toBe('修改订单');expect(actualQuotationTitle('new','idle')).toBe('新增订单')})
})
