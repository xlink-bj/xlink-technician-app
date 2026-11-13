import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ActualWorkspacePage from '../../../src/pages/work-orders/action-workspace.vue'
import { useActionWorkspaceStore } from '../../../src/features/work-orders/action-workspace'
import { useSessionStore } from '../../../src/shared/state/session'
import { createActionDraftRepository } from '../../../src/runtimes/action'
import { asOpaqueId } from '../../../src/shared/types'
import type { SessionSnapshot, StoragePort, TechnicianApiCommandPort, TechnicianApiReadPort, WorkOrderDetail } from '../../../src/shared/ports'

/** Test-only legacy Generic port fixture. Mounts the actual page ancestry,
 * shell, actions, Generic renderer and AppInput. Does not change a real R1
 * sourceNodeType=forms/repeat execution fence or install a production grant. */
export async function mountGenericNumericWorkspace(type: 'number' | 'digit') {
  const pinia = createPinia(), actor: SessionSnapshot = {
    sessionRef: asOpaqueId<'SessionRef'>('synthetic-numeric-session'),
    user: { id: asOpaqueId<'UserId'>('synthetic-numeric-user') },
    currentRole: { id: asOpaqueId<'RoleId'>('synthetic-numeric-role') }, capabilityNames: [],
  }
  const auth = useSessionStore(pinia); auth.session = actor; auth.status = 'authenticated'
  const id = asOpaqueId<'WorkOrderId'>('synthetic-generic-numeric'), nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-numeric-node')
  const definitionId = asOpaqueId<'FormDefinitionId'>('synthetic-numeric-definition')
  const detail: WorkOrderDetail = { id, workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-numeric-workflow'),
    workflowNodes: [{ id: nodeId, category: 'forms', displayName: '合成通用表单', lifecycle: 'active', formPurpose: 'survey', formDefinitionId: definitionId,
      visibility: { evidenceState: 'verified', viewableRoleIds: [actor.currentRole!.id] } }] }
  const writes: { kind: string; values?: unknown }[] = [], drafts = new Map<string, unknown>()
  let completed = false
  const ok = <T>(data: T) => ({ state: 'succeeded' as const, data })
  const storage = {
    read: async (key: { key: string }) => ok(drafts.get(key.key) ?? null),
    write: async (key: { key: string }, value: unknown) => { drafts.set(key.key, value); return ok(undefined) },
    remove: async (key: { key: string }) => { drafts.delete(key.key); return ok(undefined) },
    listKeys: async () => ok([...drafts.keys()]),
  } as unknown as StoragePort
  const workspace = useActionWorkspaceStore(pinia)
  workspace.configure({ apiRead: { getWorkOrderDetail: async () => ok(completed ? {...detail,workflowNodes:[]} : detail) } as unknown as TechnicianApiReadPort,
    commandApi: {
      readDynamicForm: async () => ok({ purpose: 'survey', definitionId, fields: [{ fieldId: 'amount', valueKey: 'amount', label: '合成数量', type, required: false, readOnly: false }], values: { amount: 12 } }),
      saveDynamicForm: async (input: { values: unknown }) => { writes.push({ kind: 'save', values: structuredClone(input.values) }); return ok(asOpaqueId<'FormDataId'>('synthetic-numeric-saved')) },
      completeWorkflowNode: async () => { writes.push({ kind: 'complete' }); completed = true; return ok(undefined) },
    } as unknown as TechnicianApiCommandPort,
    storage, draftRepository: createActionDraftRepository(storage), getSession: () => actor,
    navigation: { navigate: async () => undefined }, debounceMs: 60000,
  })
  const loaded = await workspace.load({ workOrderId: id, workflowNodeId: nodeId, actionIntent: 'interact_with_form' })
  if (loaded.state !== 'succeeded' || workspace.descriptor?.execution !== 'enabled') throw Error('Synthetic Generic contract not executable: '+JSON.stringify({loaded,descriptor:workspace.descriptor}))
  const host = document.createElement('div'); host.id = 'generic-numeric-workspace'; document.body.append(host)
  const app = createApp(ActualWorkspacePage); app.use(pinia); app.mount(host); await nextTick()
  return { ledger: () => structuredClone(writes), value: () => workspace.dynamicForm?.values.amount,
    unmount() { app.unmount(); workspace.clear(); host.remove() } }
}
