import { afterEach, describe, expect, it, vi } from 'vitest'
import { createR1Stage1PilotExecution } from '@app/r1-stage1-pilot-reconciliation'
import { inspectR1MultiStepReceipt, type R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import type { SessionSnapshot, StorageKey, StoragePort, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const scope: R1MultiStepScope = {
  userId: 'pilot-user', workOrderId: 'pilot-work-order', runtimeNodeId: 'pilot-node',
  workflowRunId: 'pilot-run', formDefinitionId: 'pilot-def', sourceNodeType: 'forms',
  authorizationScope: 'pilot-role:version-one',
}
const roleId = asOpaqueId<'RoleId'>('pilot-role')
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('pilot-session'),
  user: { id: asOpaqueId<'UserId'>('pilot-user') } as SessionSnapshot['user'],
  currentRole: { id: roleId } as SessionSnapshot['currentRole'],
  roleVersion: 'version-one', capabilityNames: [],
}
function storage() {
  const map = new Map<string, unknown>()
  const port = {
    read: vi.fn(async (key: StorageKey) => ({ state: 'succeeded' as const, data: map.get(key.key) ?? null })),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      map.set(key.key, value)
      return { state: 'succeeded' as const }
    }),
    remove: vi.fn(async (key: StorageKey) => {
      map.delete(key.key)
      return { state: 'succeeded' as const }
    }),
  } as unknown as StoragePort
  return port
}

function pilot(overrides?: {
  grant?: () => boolean
  environment?: string
  apiBaseUrl?: string
  mutationReadback?: () => boolean
  processedReadback?: () => boolean
  roleChangeOnCommand?: boolean
  child?: boolean
}) {
  let current = session
  let lifecycle: WorkflowNodeRead['lifecycle'] = 'active'
  let savedId: string | null = null
  let extsAcknowledged = false
  const node = (): WorkflowNodeRead => ({
    id: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.runtimeNodeId),
    runId: asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
    formDefinitionId: asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId),
    category: 'forms', sourceNodeType: 'forms', nodeTypeEvidence: 'runtime_node_def',
    lifecycle, visibility: { evidenceState: 'verified', selectableRoleIds: [roleId] },
    ...(extsAcknowledged && savedId ? { formList: {
      source: 'exts.formList' as const, evidence: 'available' as const,
      truncated: false,
      entries: [{ id: asOpaqueId<'FormDataId'>(savedId), state: 'active' as const }],
    } } : {}),
  })
  const parentNode = (): WorkflowNodeRead => ({
    ...node(), id: asOpaqueId<'WorkflowNodeRuntimeId'>('pilot-parent'),
    category: 'subworkflow', sourceNodeType: 'subflows', lifecycle: 'active',
  })
  const read = {
    isWorkOrderListedForCurrentSession: vi.fn(() => true),
    getWorkOrderDetail: vi.fn(async () => ({
      state: 'succeeded' as const,
      data: {
        id: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
        workflowRunId: asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
        workflowNodes: overrides?.child ? [parentNode()] : [node()],
      },
    })),
    getChildWorkflowNodes: vi.fn(async () => ({
      state: 'succeeded' as const, data: [node()],
    })),
  } as unknown as TechnicianApiReadPort
  const commands: ApiCommandRequest[] = []
  const command = {
    execute: vi.fn(async (request: ApiCommandRequest) => {
      commands.push(request)
      if (request.path.startsWith('biz/extForm/upsert/')) savedId = 'pilot-saved-1'
      if (request.path.startsWith('workflowNode/updateExts/')) extsAcknowledged = true
      if (request.path === 'workflow/process') lifecycle = 'closed'
      if (overrides?.roleChangeOnCommand) current = { ...session, roleVersion: 'version-two' }
      return request.path.startsWith('biz/extForm/upsert/')
        ? { success: true, data: { _id: savedId } }
        : { success: true, data: {} }
    }),
  }
  const rawReadback = {
    readMutation: vi.fn(async () => overrides?.mutationReadback?.() === false
      ? null : {
        workOrderId: scope.workOrderId,
        runtimeNodeId: scope.runtimeNodeId,
        workflowRunId: scope.workflowRunId,
        formDefinitionId: scope.formDefinitionId,
        sourceNodeType: 'forms' as const,
        formsExts: { formList: savedId ? [{ _id: savedId, state: 1 }] : [] },
        formData: {
          _id: savedId, sid: scope.workOrderId, nodeId: scope.runtimeNodeId,
          smodule: 'serviceAppointment', state: 1, note: 'pilot-test',
        },
      }),
    readProcessedRecords: vi.fn(async () => overrides?.processedReadback?.() === false
      ? null : savedId ? [{
        _id: savedId, sid: scope.workOrderId, nodeId: scope.runtimeNodeId,
        smodule: 'serviceAppointment', state: 1, note: 'pilot-test',
      }] : null),
  }
  const receiptStorage = storage()
  const facade = createR1Stage1PilotExecution({
    read, command, rawReadback, storage: receiptStorage,
    getSession: () => current,
    environment: overrides?.environment ?? 'beta',
    apiBaseUrl: overrides?.apiBaseUrl ?? 'https://isolated-beta.invalid',
    isExplicitPilotWriteAuthorized: overrides?.grant ?? (() => true),
  })
  const location = overrides?.child
    ? { kind: 'child' as const, parentRuntimeNodeId: 'pilot-parent' }
    : { kind: 'main' as const }
  const intent = (processActive: boolean) => ({
    scope, sourceNodeType: 'forms' as const, kind: 'forms_save' as const,
    title: '合成勘察表单', fields: { note: 'pilot-test' },
    authoritativeExts: { formList: [] }, processActive,
  })
  return { facade, location, intent, commands, command, read, rawReadback, storage: receiptStorage,
    closeNode: () => { lifecycle = 'closed' },
    changeRole: () => { current = { ...session, roleVersion: 'version-two' } },
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('Isolated R1 pilot: ACK→authoritative readback→receipt release', () => {
  it('rechecks scope before both writes, compares raw FormData with fresh node EXTS and releases the receipt', async () => {
    const h = pilot()
    const outcome = await h.facade.execute(h.intent(false), h.location)
    expect(outcome.state).toBe('verified')
    expect(h.commands.map(request => request.path)).toEqual([
      'biz/extForm/upsert/pilot-def', 'workflowNode/updateExts/pilot-node',
    ])
    expect(h.rawReadback.readMutation).toHaveBeenCalledOnce()
    expect(h.read.getWorkOrderDetail).toHaveBeenCalledTimes(4)
    expect((await inspectR1MultiStepReceipt(h.storage, scope)).data).toBeNull()
  })

  it('requires a CLOSED R1 node and independently fetched full FormData after Process', async () => {
    const h = pilot()
    expect((await h.facade.execute(h.intent(true), h.location)).state).toBe('verified')
    expect(h.commands).toHaveLength(3)
    expect(h.rawReadback.readProcessedRecords).toHaveBeenCalledOnce()
    expect((await inspectR1MultiStepReceipt(h.storage, scope)).data).toBeNull()
  })

  it('preserves replay fence on readback failure even when all writes ACK; no second dispatch', async () => {
    const h = pilot({ processedReadback: () => false })
    expect((await h.facade.execute(h.intent(true), h.location)).state).toBe('awaiting_readback')
    expect((await inspectR1MultiStepReceipt(h.storage, scope)).data).toMatchObject({ state: 'completed' })
    expect((await h.facade.execute(h.intent(true), h.location)).state).toBe('manual_reconciliation')
    expect(h.commands).toHaveLength(3)
  })

  it('blocks before any command, read or receipt when grant is missing or target is Production', async () => {
    for (const input of [
      { grant: () => false },
      { environment: 'prod' },
      { apiBaseUrl: 'https://xlink.fsgo365.cn' },
    ]) {
      const h = pilot(input)
      expect((await h.facade.execute(h.intent(false), h.location)).state).toBe('not_authorized')
      expect(h.command.execute).not.toHaveBeenCalled()
      expect(h.read.getWorkOrderDetail).not.toHaveBeenCalled()
      expect(h.storage.write).not.toHaveBeenCalled()
    }
  })

  it('losing the actor role during an uncertain command stops all later writes and readback', async () => {
    const h = pilot({ roleChangeOnCommand: true })
    expect((await h.facade.execute(h.intent(false), h.location)).state).toBe('manual_reconciliation')
    expect(h.commands).toHaveLength(1)
    expect(h.rawReadback.readMutation).not.toHaveBeenCalled()
    expect((await inspectR1MultiStepReceipt(h.storage, scope)).data).not.toBeNull()
  })

  it('child node requires a proven outer parent; role drift after ACK cannot close receipt', async () => {
    const h = pilot({ child: true, mutationReadback: () => false })
    expect((await h.facade.execute(h.intent(false), h.location)).state).toBe('awaiting_readback')
    expect(h.read.getChildWorkflowNodes).toHaveBeenCalled()
    h.changeRole()
    expect((await h.facade.reconcile(scope, h.location, { note: 'pilot-test' })).state).toBe('not_authorized')
    expect((await inspectR1MultiStepReceipt(h.storage, scope)).data).not.toBeNull()
  })

  it('missing transient field values never falsely marks an old save receipt verified', async () => {
    const h = pilot({ mutationReadback: () => false })
    expect((await h.facade.execute(h.intent(false), h.location)).state).toBe('awaiting_readback')
    expect((await h.facade.reconcile(scope, h.location)).state).toBe('awaiting_readback')
    expect((await inspectR1MultiStepReceipt(h.storage, scope)).data).not.toBeNull()
  })
})
