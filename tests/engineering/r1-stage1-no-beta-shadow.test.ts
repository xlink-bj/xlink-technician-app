/**
 * No-Beta shadow rehearsal. Every byte here is synthetic and in memory.
 * It exercises the REAL R1 request encoders, scoped gateway and authoritative
 * readback parser against a state-changing protocol double. It cannot attest
 * to real R1 side effects or replace an authorized live pilot.
 */
import { describe, expect, it, vi } from 'vitest'
import { createR1Stage1PilotExecution } from '@app/r1-stage1-pilot-reconciliation'
import { createR1PilotAuthoritativeReadback } from '@adapters/api/r1-pilot-authoritative-readback'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import type { R1Stage1Intent } from '@app/r1-stage1-functional-flow'
import { inspectR1MultiStepReceipt, type R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { SessionSnapshot, StorageKey, StoragePort, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const baseScope: R1MultiStepScope = {
  userId: 'synthetic-technician', workOrderId: 'synthetic-work-order',
  runtimeNodeId: 'synthetic-runtime-node', workflowRunId: 'synthetic-workflow-run',
  formDefinitionId: 'synthetic-form-def', sourceNodeType: 'forms',
  authorizationScope: 'synthetic-authorized-role',
}
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-technician') } as SessionSnapshot['user'],
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') } as SessionSnapshot['currentRole'],
  roleVersion: 'synthetic-version', capabilityNames: [],
}

function shadow(sourceNodeType: 'forms' | 'repeat' = 'forms') {
  const scope: R1MultiStepScope = { ...baseScope, sourceNodeType }
  const rawRecords = new Map<string, Record<string, unknown>>()
  const commands: ApiCommandRequest[] = []
  const reads: ApiReadRequest[] = []
  const receipts = new Map<string, unknown>()
  const state = {
    lifecycle: 'active' as WorkflowNodeRead['lifecycle'],
    exts: { formList: [] as Record<string, unknown>[], syntheticOpaqueMetadata: { preserved: true } },
    nextId: 0,
    withholdReadback: false,
    corruptReadbackScope: false,
    loseUpsertAck: false,
  }
  const storage = {
    read: vi.fn(async (key: StorageKey) => ({ state: 'succeeded' as const, data: receipts.get(key.key) ?? null })),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      receipts.set(key.key, value)
      return { state: 'succeeded' as const }
    }),
    remove: vi.fn(async (key: StorageKey) => {
      receipts.delete(key.key)
      return { state: 'succeeded' as const }
    }),
  } as unknown as StoragePort

  const node = (): WorkflowNodeRead => ({
    id: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.runtimeNodeId),
    runId: asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
    formDefinitionId: asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId),
    sourceNodeType, category: sourceNodeType,
    nodeTypeEvidence: 'runtime_node_def', lifecycle: state.lifecycle,
    visibility: { evidenceState: 'verified', selectableRoleIds: [session.currentRole!.id] },
    ...(sourceNodeType === 'forms' ? { formList: {
      source: 'exts.formList' as const, evidence: 'available' as const,
      truncated: false,
      entries: state.exts.formList.map(record => ({
        id: asOpaqueId<'FormDataId'>(String(record._id)),
        state: (record.state === -1 ? 'deleted' : 'active') as 'deleted' | 'active',
      })),
    } } : {}),
  })
  const read = {
    isWorkOrderListedForCurrentSession: vi.fn(() => true),
    getWorkOrderDetail: vi.fn(async () => ({
      state: 'succeeded' as const,
      data: {
        id: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
        workflowRunId: asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
        workflowNodes: [node()],
      },
    })),
  } as unknown as TechnicianApiReadPort

  const command = { execute: vi.fn(async (request: ApiCommandRequest) => {
    commands.push(request)
    if (request.path === `biz/extForm/upsert/${scope.formDefinitionId}`) {
      const raw = JSON.parse(String(request.body?.dataStr)) as Record<string, unknown>
      const id = typeof raw._id === 'string' ? raw._id : `synthetic-form-${++state.nextId}`
      rawRecords.set(id, { ...raw, _id: id, formDefId: scope.formDefinitionId })
      if (state.loseUpsertAck) throw new Error('Synthetic transport lost ACK after backend commit')
      return { success: true, data: { _id: id } }
    }
    if (request.path === `workflowNode/updateExts/${scope.runtimeNodeId}`) {
      const exts = request.jsonBody as typeof state.exts
      state.exts = structuredClone(exts)
      return { success: true, data: {} }
    }
    if (request.path === 'workflow/process') {
      state.lifecycle = 'closed'
      return { success: true, data: {} }
    }
    throw new Error(`Unexpected synthetic command: ${request.path}`)
  }) }

  const readTransport = { execute: vi.fn(async (request: ApiReadRequest) => {
    reads.push(request)
    if (request.path === `biz/extForm/query/${scope.formDefinitionId}`) {
      const exactId = request.body?.['is:_id|string#and']
      let rows = exactId
        ? [rawRecords.get(String(exactId))].filter((value): value is Record<string, unknown> => !!value)
        : [...rawRecords.values()].filter(row => row.workflowId === scope.workflowRunId && row.state !== -1)
      if (state.withholdReadback) rows = []
      if (state.corruptReadbackScope) rows = rows.map(row => ({ ...row, sid: 'foreign-work-order' }))
      return { success: true, total: rows.length, data: { items: structuredClone(rows) } }
    }
    if (request.path === `basic/serviceAppointment/queryById/${scope.workOrderId}`) {
      return { success: true, data: {
        serviceAppointment: { _id: scope.workOrderId },
        workflowNode: [{ _id: scope.runtimeNodeId, workflowId: scope.workflowRunId,
          exts: structuredClone(state.exts) }],
      } }
    }
    throw new Error(`Unexpected synthetic read: ${request.path}`)
  }) }
  const rawReadback = createR1PilotAuthoritativeReadback({
    transport: readTransport, environment: 'test', apiBaseUrl: 'https://synthetic-only.invalid',
    mayReadScope: candidate => candidate.workOrderId === scope.workOrderId
      && candidate.runtimeNodeId === scope.runtimeNodeId,
  })
  const facade = createR1Stage1PilotExecution({
    storage, read, command, rawReadback, getSession: () => session,
    environment: 'test', apiBaseUrl: 'https://synthetic-only.invalid',
    isExplicitPilotWriteAuthorized: candidate => candidate.workOrderId === scope.workOrderId
      && candidate.runtimeNodeId === scope.runtimeNodeId,
  })
  const save = (processActive = false): R1Stage1Intent => ({
    scope, sourceNodeType: 'forms', kind: 'forms_save',
    title: 'Synthetic roof inspection', fields: { note: 'synthetic-roof' },
    authoritativeExts: structuredClone(state.exts), processActive,
  })
  return { scope, state, rawRecords, reads, commands, read, storage,
    facade, save, nodeLocation: { kind: 'main' as const } }
}

describe('No-Beta: state-changing R1 protocol shadow, never live business evidence', () => {
  it('runs Forms upsert → full-fidelity EXTS → exact-ID reads → receipt cleared', async () => {
    const h = shadow()
    const answer = await h.facade.execute(h.save(), h.nodeLocation)
    expect(answer.state).toBe('verified')
    expect(h.commands.map(request => request.path)).toEqual([
      'biz/extForm/upsert/synthetic-form-def',
      'workflowNode/updateExts/synthetic-runtime-node',
    ])
    expect(h.reads.map(request => request.path)).toEqual([
      'biz/extForm/query/synthetic-form-def',
      'basic/serviceAppointment/queryById/synthetic-work-order',
    ])
    expect(h.state.exts.syntheticOpaqueMetadata).toEqual({ preserved: true })
    expect(h.state.exts.formList).toMatchObject([{ _id: 'synthetic-form-1', state: 1 }])
    expect(h.rawRecords.get('synthetic-form-1')).toMatchObject({
      sid: h.scope.workOrderId, nodeId: h.scope.runtimeNodeId, note: 'synthetic-roof',
    })
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).toBeNull()
  })

  it('keeps a durable replay fence until lagging readback independently catches up', async () => {
    const h = shadow()
    h.state.withholdReadback = true
    expect((await h.facade.execute(h.save(), h.nodeLocation)).state).toBe('awaiting_readback')
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).toMatchObject({ state: 'completed' })
    expect((await h.facade.execute(h.save(), h.nodeLocation)).state).toBe('manual_reconciliation')
    expect(h.commands).toHaveLength(2)
    h.state.withholdReadback = false
    expect((await h.facade.reconcile(h.scope, h.nodeLocation,
      { note: 'synthetic-roof' })).state).toBe('verified')
    expect(h.commands).toHaveLength(2)
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).toBeNull()
  })

  it('rejects cross-work-order FormData even if both commands ACK and EXTS is present', async () => {
    const h = shadow()
    h.state.corruptReadbackScope = true
    expect((await h.facade.execute(h.save(), h.nodeLocation)).state).toBe('awaiting_readback')
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).not.toBeNull()
    expect(h.commands).toHaveLength(2)
  })

  it('does not replay a FormData POST after the server applied it but its ACK was lost', async () => {
    const h = shadow()
    h.state.loseUpsertAck = true
    expect((await h.facade.execute(h.save(), h.nodeLocation)).state).toBe('manual_reconciliation')
    expect(h.rawRecords.size).toBe(1)
    expect(h.commands.map(request => request.path)).toEqual(['biz/extForm/upsert/synthetic-form-def'])
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).not.toBeNull()
    expect((await h.facade.execute(h.save(), h.nodeLocation)).state).toBe('manual_reconciliation')
    expect(h.commands).toHaveLength(1)
  })

  it('verifies a completed Forms node only after full post-Process FormData readback', async () => {
    const h = shadow()
    expect((await h.facade.execute(h.save(true), h.nodeLocation)).state).toBe('verified')
    expect(h.state.lifecycle).toBe('closed')
    expect(h.commands.map(request => request.path).at(-1)).toBe('workflow/process')
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).toBeNull()
  })

  it('processes a bounded Repeat batch using authoritative new FormData IDs', async () => {
    const h = shadow('repeat')
    const intent: R1Stage1Intent = {
      scope: h.scope, sourceNodeType: 'repeat', kind: 'repeat_batch',
      forms: [{ note: 'synthetic-one' }, { note: 'synthetic-two' }],
    }
    expect((await h.facade.execute(intent, h.nodeLocation)).state).toBe('verified')
    expect(h.commands.map(request => request.path)).toEqual([
      'biz/extForm/upsert/synthetic-form-def',
      'biz/extForm/upsert/synthetic-form-def',
      'workflow/process',
    ])
    expect(h.commands.at(-1)?.body?.nodeFormDataId).toBe('synthetic-form-1,synthetic-form-2')
    expect(h.rawRecords.size).toBe(2)
    expect((await inspectR1MultiStepReceipt(h.storage, h.scope)).data).toBeNull()
  })
})
