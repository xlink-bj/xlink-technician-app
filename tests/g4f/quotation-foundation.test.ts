import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import {
  isMockOwnedRead,
  mockCommandScenarioIds,
  mockQuotationWorkflowNodeId,
  resetBusinessMockCache,
  resetMockCommandState,
  setBusinessMockMode,
} from '@adapters/api/mock'
import { actionContentKindForIntent, createActionDraftRepository } from '@runtimes/action'
import { evaluateWorkflowAction, projectDetailWorkflow, type WorkflowActor } from '@runtimes/workflow'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type {
  NavigationPort,
  SessionSnapshot,
  StorageKey,
  StoragePort,
  TechnicianApiCommandPort,
} from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

const workOrderId = asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.quotationFoundation)
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>(mockQuotationWorkflowNodeId)
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('g4f-test-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user') },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') },
  capabilityNames: [],
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function memoryStorage(): StoragePort {
  const data = new Map<string, unknown>()
  return {
    read: async <T>(key: StorageKey) => succeeded((data.get(key.key) as T | undefined) ?? null),
    write: async (key, value) => { data.set(key.key, value); return succeeded(undefined) },
    remove: async (key) => { data.delete(key.key); return succeeded(undefined) },
    listKeys: async () => succeeded([...data.keys()]),
  }
}

function navigation(): NavigationPort {
  return {
    navigate: vi.fn(async () => undefined),
    replace: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    back: vi.fn(async () => undefined),
  }
}

function workflowActor(): WorkflowActor {
  return {
    userId: session.user.id,
    roleIds: [session.currentRole!.id],
    organizationRoles: [],
  }
}

describe('G4-F Phase 1A quotation action foundation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBusinessMockCache()
    resetMockCommandState()
    setBusinessMockMode('data')
  })

  it('keeps place_order as the Workflow intent and maps only its content to quotation', () => {
    expect(actionContentKindForIntent('place_order')).toBe('quotation')
    expect(actionContentKindForIntent('set_appointment')).toBe('dynamic_form')
    expect(actionContentKindForIntent('interact_with_form')).toBe('dynamic_form')

    const result = evaluateWorkflowAction({
      action: 'quotation',
      node: {
        id: workflowNodeId,
        category: 'placeOrder',
        lifecycle: 'active',
        visibility: { evidenceState: 'verified', viewableRoleIds: [session.currentRole!.id] },
      },
      actor: workflowActor(),
    })
    expect(result).toMatchObject({ allowed: false, reason: 'policy_unverified', action: 'quotation' })
  })

  it('projects placeOrder without formDefinitionId as executable while generic forms still require one', async () => {
    const api = createTechnicianApiReadAdapter({
      execute: async (request) => {
        if (request.path === `basic/serviceAppointment/queryById/${encodeURIComponent(workOrderId)}`) {
          return {
            data: {
              serviceAppointment: { _id: workOrderId, orderNum: 'MOCK-018', name: '演示报价工单', workflowRunId: 'mock-run' },
              workflow: { _id: 'mock-run' },
              workflowNode: [{ _id: workflowNodeId, state: 0, nodeDef: { nodeType: 'placeOrder', name: '报价', viewableRoleIds: ['synthetic-role'] } }],
            },
          }
        }
        throw new Error(`Unexpected read ${request.path}`)
      },
    })
    const read = await api.getWorkOrderDetail(workOrderId)
    expect(read.data?.workflowNodes?.[0]).toMatchObject({ category: 'placeOrder', lifecycle: 'active' })
    const quotationNode = read.data!.workflowNodes![0]
    const visibleQuotation = evaluateWorkflowAction({
      action: 'place_order',
      node: {
        id: quotationNode.id,
        category: quotationNode.category,
        lifecycle: quotationNode.lifecycle,
        visibility: quotationNode.visibility,
      },
      actor: workflowActor(),
    })
    expect(visibleQuotation.allowed).toBe(true)

    const genericRead = await createTechnicianApiReadAdapter({
      execute: async () => ({
        data: {
          serviceAppointment: { _id: 'generic-order', orderNum: 'G-1' },
          workflowNode: [{ _id: 'generic-form-node', state: 0, nodeDef: { nodeType: 'forms', name: '普通表单', userChoose: ['synthetic-role'] } }],
        },
      }),
    }).getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('generic-order'))
    const genericNode = genericRead.data!.workflowNodes![0]
    expect(projectDetailWorkflow([genericNode], workflowActor()).currentTask?.execution).toBe('disabled_read_only')
  })

  it('loads the synthetic empty-quote fixture through Mock transport, Adapter, and Action Workspace only', async () => {
    const realRequest = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://mock-review.invalid',
      getSessionRef: () => session.sessionRef,
      request: realRequest as never,
      mockLatencyMs: 0,
    })
    const api = createTechnicianApiReadAdapter(transport)
    const commandApi = {
      readAppointmentForm: vi.fn(),
      readDynamicForm: vi.fn(),
      saveDynamicForm: vi.fn(),
      completeWorkflowNode: vi.fn(),
      submitAppointment: vi.fn(),
    } as unknown as TechnicianApiCommandPort
    const workspace = useActionWorkspaceStore()
    workspace.configure({
      apiRead: api,
      commandApi,
      draftRepository: createActionDraftRepository(memoryStorage()),
      navigation: navigation(),
      getSession: () => session,
    })

    const result = await workspace.load({ workOrderId, workflowNodeId, actionIntent: 'place_order' })
    expect(result.state).toBe('succeeded')
    expect(workspace.descriptor).toMatchObject({ actionIntent: 'place_order', contentKind: 'quotation', execution: 'enabled' })
    expect(workspace.quotationContent).toEqual({
      source: 'mock_fixture',
      fixtureId: 'g4f-quotation-empty-v1',
      state: 'no_persisted_quote',
    })
    expect(workspace.quotationContentState).toBe('ready')
    expect(workspace.detail?.customerName).toBe('演示报价工单')
    expect(workspace.canSubmit).toBe(false)
    expect(isMockOwnedRead('__mock/quotation/action-content')).toBe(true)
    expect(realRequest).not.toHaveBeenCalled()
    expect(commandApi.readAppointmentForm).not.toHaveBeenCalled()
    expect(commandApi.readDynamicForm).not.toHaveBeenCalled()

    await workspace.saveDynamicForm()
    await workspace.completeDynamicForm()
    await workspace.submit()
    expect(commandApi.saveDynamicForm).not.toHaveBeenCalled()
    expect(commandApi.completeWorkflowNode).not.toHaveBeenCalled()
    expect(commandApi.submitAppointment).not.toHaveBeenCalled()
  })

  it('fails closed when Mock is off and the quotation fixture cannot be served', async () => {
    setBusinessMockMode('off')
    const realRequest = vi.fn()
    const api = createTechnicianApiReadAdapter(createUniApiReadTransport({
      apiBaseUrl: 'https://mock-review.invalid',
      getSessionRef: () => session.sessionRef,
      request: realRequest as never,
      mockLatencyMs: 0,
    }))
    const result = await api.getQuotationActionContent!({ workOrderId, workflowNodeId })
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
    expect(realRequest).not.toHaveBeenCalled()
  })

  it('rejects mismatched Mock fixture identity instead of accepting content for another node', async () => {
    const api = createTechnicianApiReadAdapter({
      execute: vi.fn(async () => ({
        data: {
          workOrderId: String(workOrderId),
          workflowNodeId: 'another-node',
          fixtureId: 'g4f-quotation-empty-v1',
          quotation: null,
        },
      })),
    })
    const result = await api.getQuotationActionContent!({ workOrderId, workflowNodeId })
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
  })

  it('keeps quotation foundation UI read-only with no quote mutation API surface', async () => {
    const { readFile } = await import('node:fs/promises')
    const [component, commandPort, page] = await Promise.all([
      readFile(new URL('../../src/features/work-orders/quotation/QuotationActionContent.vue', import.meta.url), 'utf8'),
      readFile(new URL('../../src/shared/ports/commands.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8'),
    ])
    expect(component).toContain('本阶段不开放报价编辑、保存、提交、客户确认或转订单')
    expect(commandPort).not.toMatch(/createQuotation|updateQuotation|sendQuotation|convertQuotation/)
    expect(page).toContain("workspace.descriptor?.contentKind === 'quotation'")
    expect(page).toContain(':can-submit="false"')
  })
})
