import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import {
  isMockOwnedRead,
  mockCommandScenarioIds,
  mockQuotationCatalogServiceType,
  mockQuotationCatalogSourceType,
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

  it('initializes place_order without the quote fixture and bridges only explicit direct catalog selections', async () => {
    const realRequest = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://mock-review.invalid',
      getSessionRef: () => session.sessionRef,
      request: realRequest as never,
      mockLatencyMs: 0,
    })
    const api = createTechnicianApiReadAdapter(transport)
    const quotationCatalogRead = createQuotationCatalogReadAdapter(transport)
    const fixtureRead = await api.getQuotationActionContent!({ workOrderId, workflowNodeId })
    expect(fixtureRead).toEqual(succeeded({
      source: 'mock_fixture',
      fixtureId: 'g4f-quotation-empty-v1',
      state: 'no_persisted_quote',
    }))
    const quotationFixtureRead = vi.spyOn(api, 'getQuotationActionContent')
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
      quotationCatalogRead,
      commandApi,
      draftRepository: createActionDraftRepository(memoryStorage()),
      navigation: navigation(),
      getSession: () => session,
    })

    const result = await workspace.load({ workOrderId, workflowNodeId, actionIntent: 'place_order' })
    expect(result.state).toBe('succeeded')
    expect(workspace.descriptor).toMatchObject({ actionIntent: 'place_order', contentKind: 'quotation', execution: 'enabled' })
    expect(quotationFixtureRead).not.toHaveBeenCalled()
    expect(workspace.quotationContentState).toBe('ready')
    expect(workspace.detail?.quotationCatalogContext).toEqual({
      serviceType: mockQuotationCatalogServiceType,
      sourceType: mockQuotationCatalogSourceType,
    })
    expect(workspace.quotationComposition.localState).toBe('fresh')
    expect(workspace.quotationComposition.draft).toMatchObject({
      workOrderId: String(workOrderId),
      workflowNodeId: String(workflowNodeId),
      groups: [],
    })
    const groupId = workspace.quotationComposition.createGroup({
      repairParts: ['verified-roof-path'],
      maintainAreaNum: '9.5',
    }).data!
    const localDraftBeforeCatalogRead = JSON.stringify(workspace.quotationComposition.draft)
    expect(workspace.configureQuotationPackageSelection(groupId, 'mock-catalog-package-basic', []).state).toBe('failed_terminal')
    workspace.quotationCatalogBrowser.open('package')
    await workspace.quotationCatalogBrowser.loadList('package')
    expect(workspace.quotationCatalogBrowser.catalogStatesByKind.package).toBe('succeeded')
    expect(workspace.quotationCatalogBrowser.visibleCatalogItems.map((item) => item.id)).toContain('mock-catalog-package-basic')
    expect(workspace.configureQuotationPackageSelection(groupId, 'unlisted-package', []).state).toBe('failed_terminal')
    expect(workspace.configureQuotationPackageSelection(groupId, 'mock-catalog-package-basic', []).state).toBe('failed_terminal')
    await workspace.quotationCatalogBrowser.openPackageDetail('mock-catalog-package-basic')
    expect(workspace.quotationCatalogBrowser.packageDetailState).toBe('succeeded')
    expect(workspace.quotationCatalogBrowser.packageMaterialLayers.map((layer) => layer.label)).toEqual(['层级：mock-layer-1', '层级：2'])
    expect(JSON.stringify(workspace.quotationComposition.draft)).toBe(localDraftBeforeCatalogRead)
    const packageChoices = [
      { layer: 'mock-layer-1', componentId: 'mock-package-material-row', referenceId: 'mock-catalog-material-sealant' },
      { layer: 2, componentId: 'mock-package-material-row-layer-2', referenceId: 'mock-catalog-material-layer-2' },
    ] as const
    expect(workspace.configureQuotationPackageSelection(groupId, 'unlisted-package', packageChoices).state).toBe('failed_terminal')
    expect(workspace.configureQuotationPackageSelection(groupId, 'mock-catalog-package-basic', packageChoices).state).toBe('succeeded')
    expect(workspace.quotationComposition.selectionsFor(groupId, 'package')).toMatchObject([{
      kind: 'package',
      catalogId: 'mock-catalog-package-basic',
      quantity: 9.5,
      configuration: { materials: [{ layer: 'mock-layer-1' }, { layer: 2 }] },
    }])
    for (const kind of ['procedure', 'material', 'measure'] as const) {
      workspace.quotationCatalogBrowser.open(kind)
      await workspace.quotationCatalogBrowser.loadList(kind)
      const item = workspace.quotationCatalogBrowser.visibleCatalogItems[0]
      expect(item?.kind).toBe(kind)
      expect(workspace.addQuotationCatalogSelection(groupId, kind, item!.id).state).toBe('succeeded')
      expect(workspace.quotationComposition.selectionsFor(groupId, kind)).toMatchObject([
        { catalogId: item!.id, label: item!.name, ...(item!.unit ? { unit: item!.unit } : {}), quantity: 1 },
      ])
    }
    workspace.quotationCatalogBrowser.open('package')
    await workspace.quotationCatalogBrowser.loadList('package')
    const beforeRejectedPackage = JSON.stringify(workspace.quotationComposition.draft)
    expect(workspace.addQuotationCatalogSelection(groupId, 'package', 'mock-catalog-package-basic').state).toBe('failed_terminal')
    workspace.quotationCatalogBrowser.open('material')
    await workspace.quotationCatalogBrowser.loadList('material')
    expect(workspace.addQuotationCatalogSelection(groupId, 'material', 'unlisted-material').state).toBe('failed_terminal')
    expect(JSON.stringify(workspace.quotationComposition.draft)).toBe(beforeRejectedPackage)

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

  it('opens place_order with Mock off and no catalog context while blocking only catalog reads', async () => {
    setBusinessMockMode('off')
    const activeWorkOrderId = asOpaqueId<'WorkOrderId'>('active-place-order-without-catalog-context')
    const requestPaths: string[] = []
    const realRequest = vi.fn((options: UniNamespace.RequestOptions) => {
      const path = String(options.url).replace('https://mock-review.invalid/', '')
      requestPaths.push(path)
      let data: unknown
      if (path === `basic/serviceAppointment/queryById/${encodeURIComponent(activeWorkOrderId)}`) {
        data = {
          data: {
            serviceAppointment: {
              _id: String(activeWorkOrderId),
              orderNum: 'SYNTHETIC-PLACE-ORDER',
              workflowRunId: 'mock-run-no-catalog-context',
            },
            workflow: { _id: 'mock-run-no-catalog-context' },
            workflowNode: [{
              _id: String(workflowNodeId),
              state: 0,
              nodeDef: { nodeType: 'placeOrder', name: '报价', viewableRoleIds: ['synthetic-role'] },
            }],
          },
        }
      } else if (path === 'biz/action/query.do') {
        data = { data: [] }
      } else if (path === 'i/code/selectMultistageCode.do') {
        data = [{ type: 'repairParts', children: [] }]
      } else {
        throw new Error(`Unexpected request in no-context regression: ${path}`)
      }
      options.success?.({ statusCode: 200, data } as UniNamespace.RequestSuccessCallbackResult)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://mock-review.invalid',
      getSessionRef: () => session.sessionRef,
      request: realRequest,
      mockLatencyMs: 0,
    })
    const api = createTechnicianApiReadAdapter(transport, { cascadeTenantId: 'synthetic-tenant' })
    const quotationFixtureRead = vi.spyOn(api, 'getQuotationActionContent')
    const quotationCatalogRead = createQuotationCatalogReadAdapter(transport)
    const listPackages = vi.spyOn(quotationCatalogRead, 'listPackages')
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
      quotationCatalogRead,
      commandApi,
      draftRepository: createActionDraftRepository(memoryStorage()),
      navigation: navigation(),
      getSession: () => session,
    })

    const result = await workspace.load({ workOrderId: activeWorkOrderId, workflowNodeId, actionIntent: 'place_order' })
    expect(result.state, workspace.error?.message ?? JSON.stringify(result)).toBe('succeeded')
    expect(workspace.loadState).toBe('succeeded')
    expect(workspace.quotationContentState).toBe('ready')
    expect(workspace.detail?.quotationCatalogContext).toBeUndefined()
    expect(workspace.quotationComposition.localState).toBe('fresh')
    expect(workspace.quotationComposition.draft?.groups).toEqual([])
    expect(quotationFixtureRead).not.toHaveBeenCalled()

    workspace.quotationCatalogBrowser.open('package')
    expect(workspace.quotationCatalogBrowser.catalogStatesByKind.package).toBe('blocked')
    expect(workspace.quotationCatalogBrowser.listErrorCopyByKind.package).toContain('适用范围')
    expect(listPackages).not.toHaveBeenCalled()
    expect(requestPaths).toContain(`basic/serviceAppointment/queryById/${encodeURIComponent(activeWorkOrderId)}`)
    expect(requestPaths).not.toContain('__mock/quotation/action-content')
    expect(requestPaths.some((path) => path.startsWith('biz/projPackage/queryWithRank'))).toBe(false)
    expect(commandApi.saveDynamicForm).not.toHaveBeenCalled()
    expect(commandApi.completeWorkflowNode).not.toHaveBeenCalled()
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

  it('keeps quotation composition local with no quote mutation API surface', async () => {
    const { readFile } = await import('node:fs/promises')
    const [component, commandPort, page] = await Promise.all([
      readFile(new URL('../../src/features/work-orders/quotation/QuotationActionContent.vue', import.meta.url), 'utf8'),
      readFile(new URL('../../src/shared/ports/commands.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8'),
    ])
    expect(component).toContain('仅本机草稿')
    expect(component).toContain('服务方案 / 报价明细')
    expect(component).not.toContain('MOCK_PRODUCT_REVIEW')
    expect(component).not.toContain('H5_VISUAL_PROXY')
    expect(commandPort).not.toMatch(/createQuotation|updateQuotation|sendQuotation|convertQuotation/)
    expect(page).toContain("workspace.descriptor?.contentKind === 'quotation'")
    expect(page).toContain(':can-submit="false"')
  })
})
