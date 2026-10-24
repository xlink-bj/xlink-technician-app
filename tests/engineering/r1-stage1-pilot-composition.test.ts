import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedR1Stage1Pilot } from '@app/r1-stage1-pilot-composition'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import type { AuthSessionPort, SessionSnapshot, StorageKey, StoragePort, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import type { R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'

const scope: R1MultiStepScope = {
  userId: 'synthetic-user', workOrderId: 'synthetic-order',
  runtimeNodeId: 'synthetic-node', workflowRunId: 'synthetic-run',
  formDefinitionId: 'synthetic-def', sourceNodeType: 'forms',
  authorizationScope: JSON.stringify([
    'synthetic-session', 'synthetic-user', 'synthetic-role', 'one',
  ]),
}
function flags() {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'staging')
  vi.stubEnv('VITE_XLINK_PLATFORM', 'mp-weixin')
  vi.stubEnv('VITE_XLINK_API_BASE_URL', 'https://isolated-pilot.invalid')
  vi.stubEnv('VITE_XLINK_AUTH_TENANT', 'synthetic-tenant')
  vi.stubEnv('VITE_XLINK_AUTH_METHOD', 'phone')
  vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
  vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
  vi.stubEnv('VITE_XLINK_MOCK', 'false')
}
function harness() {
  const session: SessionSnapshot = {
    sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
    user: { id: asOpaqueId<'UserId'>('synthetic-user') } as SessionSnapshot['user'],
    currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') } as SessionSnapshot['currentRole'],
    roleVersion: 'one', capabilityNames: [],
  }
  const storageValues = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: StorageKey) => ({ state: 'succeeded' as const, data: storageValues.get(key.key) ?? null })),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      storageValues.set(key.key, value)
      return { state: 'succeeded' as const }
    }),
    remove: vi.fn(async (key: StorageKey) => {
      storageValues.delete(key.key)
      return { state: 'succeeded' as const }
    }),
  } as unknown as StoragePort
  const read = {
    isWorkOrderListedForCurrentSession: vi.fn(() => true),
    getWorkOrderDetail: vi.fn(async () => ({
      state: 'succeeded' as const,
      data: {
        id: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
        workflowRunId: asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
        workflowNodes: [{
          id: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.runtimeNodeId),
          runId: asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
          formDefinitionId: asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId),
          sourceNodeType: 'forms' as const, category: 'forms' as const,
          nodeTypeEvidence: 'runtime_node_def' as const,
          lifecycle: 'active' as const,
          visibility: { evidenceState: 'verified' as const,
            selectableRoleIds: [session.currentRole!.id] },
          formList: { source: 'exts.formList' as const, evidence: 'available' as const,
            truncated: false, entries: [{
              id: asOpaqueId<'FormDataId'>('saved-pilot'), state: 'active' as const,
            }] },
        }],
      },
    })),
  } as unknown as TechnicianApiReadPort
  const authSession = { getCurrentSession: () => session } as AuthSessionPort
  const calls: ApiReadRequest[] = []
  const commandCalls: ApiCommandRequest[] = []
  const options = {
    storage, read, authSession, approvedApiBaseUrl: 'https://isolated-pilot.invalid',
    ownerGrant: vi.fn(() => true),
    readTransport: { execute: vi.fn(async (req: ApiReadRequest) => {
      calls.push(req)
      return req.path.startsWith('biz/extForm/query/')
        ? { success: true, total: 1, data: { items: [{
          _id: 'saved-pilot', sid: scope.workOrderId, nodeId: scope.runtimeNodeId,
          workflowId: scope.workflowRunId, smodule: 'serviceAppointment',
          state: 1, formDefId: scope.formDefinitionId, note: 'synthetic',
        }] } }
        : { success: true, data: {
          serviceAppointment: { _id: scope.workOrderId },
          workflowNode: [{ _id: scope.runtimeNodeId, workflowId: scope.workflowRunId,
            exts: { formList: [{ _id: 'saved-pilot', state: 1 }] } }],
        } }
    }) },
    commandTransport: { execute: vi.fn(async (req: ApiCommandRequest) => {
      commandCalls.push(req)
      return req.path.startsWith('biz/extForm/upsert/')
        ? { success: true, data: { _id: 'saved-pilot' } }
        : { success: true, data: {} }
    }) },
  }
  return { options, calls, commandCalls }
}
afterEach(() => vi.unstubAllEnvs())
describe('Isolated R1 Beta composition (not mounted in the App)', () => {
  it('returns no transport if either write flag is missing, or environment is not staging', () => {
    flags()
    const h = harness()
    vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES', 'false')
    expect(createIsolatedR1Stage1Pilot(h.options)).toBeNull()
    vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES', 'true')
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    expect(createIsolatedR1Stage1Pilot(h.options)).toBeNull()
    expect(h.calls).toHaveLength(0)
    expect(h.commandCalls).toHaveLength(0)
  })

  it('rejects mismatched approved hosts and actor authorization scope before any write', async () => {
    flags()
    const h = harness()
    expect(createIsolatedR1Stage1Pilot({
      ...h.options, approvedApiBaseUrl: 'https://some-other-beta.invalid',
    })).toBeNull()
    const pilot = createIsolatedR1Stage1Pilot(h.options)
    expect(pilot).not.toBeNull()
    expect((await pilot!.execute({
      scope: { ...scope, authorizationScope: 'unrelated-role' },
      sourceNodeType: 'forms', kind: 'forms_save', title: '合成',
      fields: { note: 'synthetic' }, authoritativeExts: { formList: [] },
      processActive: false,
    }, { kind: 'main' })).state).toBe('not_authorized')
    expect(h.commandCalls).toHaveLength(0)
  })

  it('wires full R1 transport paths only for an explicit, scoped Beta harness', async () => {
    flags()
    const h = harness()
    const pilot = createIsolatedR1Stage1Pilot(h.options)
    expect(pilot).not.toBeNull()
    const result = await pilot!.execute({
      scope, sourceNodeType: 'forms', kind: 'forms_save',
      title: '合成表单', fields: { note: 'synthetic' },
      authoritativeExts: { formList: [] }, processActive: false,
    }, { kind: 'main' })
    expect(result.state).toBe('verified')
    expect(h.commandCalls.map(req => req.path)).toEqual([
      'biz/extForm/upsert/synthetic-def',
      'workflowNode/updateExts/synthetic-node',
    ])
    expect(h.calls.map(req => req.path)).toEqual([
      'biz/extForm/query/synthetic-def',
      'basic/serviceAppointment/queryById/synthetic-order',
    ])
    expect(h.options.ownerGrant).toHaveBeenCalled()
  })
})
