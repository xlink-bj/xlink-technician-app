import { describe, expect, it, vi } from 'vitest'

import type { ApiReadTransport } from '@adapters/api/technician-api'
import {
  createTechnicianApiReadAdapter,
} from '@adapters/api/technician-api'
import {
  mockDetailScenarioIds,
  mockStatusOptionsResponse,
  mockWorkOrderDetailResponseFor,
} from '@adapters/api/mock'
import {
  evaluateNodeVisibility,
  projectDetailWorkflow,
  type WorkflowActor,
  type WorkflowNodeMetadata,
} from '@runtimes/workflow'
import { detailWorkflowUiProjectionFor } from '@features/work-orders/detail-workflow'
import type { WorkflowNodeRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

function readNode(
  input: Pick<WorkflowNodeRead, 'category' | 'lifecycle'> & {
    id?: string
    displayName?: string
    handlers?: WorkflowNodeRead['handlers']
    visibility?: WorkflowNodeRead['visibility']
  },
): WorkflowNodeRead {
  return {
    id: asOpaqueId<'WorkflowNodeRuntimeId'>(input.id ? String(input.id) : 'node'),
    category: input.category,
    lifecycle: input.lifecycle,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.handlers ? { handlers: input.handlers } : {}),
    visibility: input.visibility ?? {
      evidenceState: 'verified',
      selectableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')],
    },
  }
}

const actor: WorkflowActor = {
  userId: asOpaqueId<'UserId'>('synthetic-user'),
  roleIds: [asOpaqueId<'RoleId'>('synthetic-role')],
  organizationRoles: [],
}

async function readScenario(id: string) {
  const transport: ApiReadTransport = {
    execute: vi.fn(async (request) => {
      if (request.path === 'code/query') return mockStatusOptionsResponse
      const encodedId = request.path.split('/').at(-1)
      const response = encodedId ? mockWorkOrderDetailResponseFor(decodeURIComponent(encodedId)) : null
      if (!response) throw new Error(`Missing fixture for ${id}`)
      return response
    }),
  }
  return createTechnicianApiReadAdapter(transport).getWorkOrderDetail(
    asOpaqueId<'WorkOrderId'>(id),
  )
}

describe('G4-UX Detail D3 workflow projection', () => {
  it('normalizes all six raw scenarios through the adapter and projects bounded results', async () => {
    const expected = [
      { id: mockDetailScenarioIds[0], category: 'forms', lifecycle: 'active', title: '勘察', action: 'interact_with_form' },
      { id: mockDetailScenarioIds[1], category: 'placeOrder', lifecycle: 'active', title: '下单', action: 'place_order' },
      { id: mockDetailScenarioIds[2], category: 'subworkflow', lifecycle: 'active', title: '派工', action: 'open_subworkflow' },
      { id: mockDetailScenarioIds[3], category: 'placeOrder', lifecycle: 'active', selection: 'none' },
      { id: mockDetailScenarioIds[4], category: 'forms', lifecycle: 'active', selection: 'none' },
      { id: mockDetailScenarioIds[5], category: 'unsupported', lifecycle: 'unknown', selection: 'none' },
    ] as const

    for (const scenario of expected) {
      const result = await readScenario(scenario.id)
      const nodes = result.data?.workflowNodes ?? []
      const normalizedNode = nodes.find((node) => node.lifecycle === scenario.lifecycle)
      expect(normalizedNode).toMatchObject({ category: scenario.category, lifecycle: scenario.lifecycle })
      expect(nodes.every((node) => !('state' in node) && !('nodeDef' in node))).toBe(true)
      if (scenario.id === mockDetailScenarioIds[0]) {
        expect(normalizedNode?.visibility).toEqual({
          evidenceState: 'verified',
          selectableRoleIds: ['synthetic-role'],
        })
      }
      if (scenario.id === mockDetailScenarioIds[1]) {
        expect(normalizedNode?.visibility).toEqual({
          evidenceState: 'verified',
          viewableRoleIds: ['synthetic-role'],
        })
      }
      if (scenario.id === mockDetailScenarioIds[2]) {
        expect(normalizedNode?.visibility).toEqual({ evidenceState: 'verified' })
        expect(normalizedNode?.handlers).toEqual([{ kind: 'unclassified', value: 'synthetic-user' }])
      }
      if (scenario.id === mockDetailScenarioIds[4]) {
        expect(normalizedNode?.visibility).toEqual({ evidenceState: 'missing' })
      }

      const projection = projectDetailWorkflow(nodes, actor)
      if ('title' in scenario) {
        expect(projection).toMatchObject({
          selection: 'selected',
          currentTask: {
            title: scenario.title,
            actionIntent: scenario.action,
            domainPolicy: { allowed: true, action: scenario.action },
            execution: 'action' in scenario && scenario.action === 'place_order' ? 'enabled' : 'disabled_read_only',
          },
        })
      } else {
        expect(projection.selection).toBe(scenario.selection)
        expect(projection.currentTask).toBeUndefined()
      }
    }
  })

  it('selects exactly one visible active actionable node without using array position', () => {
    const first = readNode({ id: 'first', category: 'forms', lifecycle: 'active', displayName: '表单处理' })
    const second = readNode({ id: 'second', category: 'placeOrder', lifecycle: 'active', displayName: '下单' })

    const projection = projectDetailWorkflow([first, second], actor)
    expect(projection.selection).toBe('ambiguous')
    expect(projection.currentTask).toBeUndefined()
    expect(projection.actionableNodeCount).toBe(2)

    const one = projectDetailWorkflow([second, readNode({ ...first, lifecycle: 'closed' })], actor)
    expect(one.selection).toBe('selected')
    expect(one.currentTask).toMatchObject({ title: '下单', actionIntent: 'place_order' })
  })

  it('uses Runtime visibility and handler policy for blocked nodes', () => {
    const blocked = readNode({
      id: 'blocked',
      category: 'forms',
      lifecycle: 'active',
      displayName: '受限表单',
      handlers: [{ kind: 'unclassified', value: 'another-role' }],
      visibility: { evidenceState: 'verified' },
    })
    const metadata: WorkflowNodeMetadata = {
      id: blocked.id,
      category: blocked.category,
      lifecycle: blocked.lifecycle,
      handlers: blocked.handlers,
      visibility: blocked.visibility,
    }

    expect(evaluateNodeVisibility(metadata, actor)).toEqual({ visible: false, reason: 'not_handler' })
    expect(projectDetailWorkflow([blocked], actor)).toMatchObject({
      selection: 'none',
      visibleNodeCount: 0,
      actionableNodeCount: 0,
    })
  })

  it('requires explicit visibility evidence and supports each verified R1 match path', () => {
    const userMatch = readNode({
      id: 'user-match',
      category: 'forms',
      lifecycle: 'active',
      displayName: '用户处理',
      handlers: [{ kind: 'unclassified', value: 'synthetic-user' }],
      visibility: { evidenceState: 'verified' },
    })
    const selectableRoleMatch = readNode({
      id: 'selectable-role-match',
      category: 'forms',
      lifecycle: 'active',
      displayName: '角色选择',
      visibility: {
        evidenceState: 'verified',
        selectableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')],
      },
    })
    const viewableRoleMatch = readNode({
      id: 'viewable-role-match',
      category: 'forms',
      lifecycle: 'active',
      displayName: '角色查看',
      visibility: {
        evidenceState: 'verified',
        viewableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')],
      },
    })
    const missing = readNode({
      id: 'missing-evidence',
      category: 'forms',
      lifecycle: 'active',
      displayName: '无证据',
      visibility: { evidenceState: 'missing' },
    })
    const mismatch = readNode({
      id: 'mismatch',
      category: 'forms',
      lifecycle: 'active',
      displayName: '不匹配',
      visibility: {
        evidenceState: 'verified',
        viewableRoleIds: [asOpaqueId<'RoleId'>('other-role')],
      },
    })

    expect(projectDetailWorkflow([userMatch], actor).selection).toBe('selected')
    expect(projectDetailWorkflow([selectableRoleMatch], actor).selection).toBe('selected')
    expect(projectDetailWorkflow([viewableRoleMatch], actor).selection).toBe('selected')
    expect(projectDetailWorkflow([missing], actor)).toMatchObject({
      selection: 'none',
      visibleNodeCount: 0,
      actionableNodeCount: 0,
    })
    expect(projectDetailWorkflow([mismatch], actor).selection).toBe('none')
    expect(projectDetailWorkflow([userMatch], { ...actor, userId: asOpaqueId<'UserId'>('other-user') }).selection).toBe(
      'none',
    )
  })

  it('keeps a semantic result stable when node arrays are reordered', () => {
    const active = readNode({
      id: 'active',
      category: 'placeOrder',
      lifecycle: 'active',
      displayName: '下单',
      visibility: {
        evidenceState: 'verified',
        selectableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')],
      },
    })
    const closed = readNode({
      id: 'closed',
      category: 'forms',
      lifecycle: 'closed',
      displayName: '已完成',
      visibility: { evidenceState: 'verified', selectableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')] },
    })

    expect(projectDetailWorkflow([active, closed], actor)).toEqual(projectDetailWorkflow([closed, active], actor))
  })

  it('normalizes the evidenced organization-role handler encoding at the adapter boundary', async () => {
    const api = createTechnicianApiReadAdapter({
      execute: vi.fn(async () => ({
        data: {
          serviceAppointment: { _id: 'work-order-handler' },
          workflowNode: [
            {
              _id: 'workflow-node-handler',
              state: 0,
              handlerIds: ['synthetic-org+synthetic-role'],
              nodeDef: { nodeType: 'forms', name: '组织角色表单' },
            },
          ],
        },
      })),
    })

    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('work-order-handler'))
    expect(result.data?.workflowNodes?.[0]).toMatchObject({
      category: 'forms',
      lifecycle: 'active',
      handlers: [
        {
          kind: 'organizationRole',
          organizationId: 'synthetic-org',
          roleId: 'synthetic-role',
        },
      ],
    })
  })

  it('marks malformed visibility metadata unverified instead of granting visibility', async () => {
    const api = createTechnicianApiReadAdapter({
      execute: vi.fn(async () => ({
        data: {
          serviceAppointment: { _id: 'work-order-malformed-visibility' },
          workflowNode: [
            {
              _id: 'workflow-node-malformed-visibility',
              state: 0,
              nodeDef: { nodeType: 'forms', name: '结构异常', userChoose: 'synthetic-role' },
            },
          ],
        },
      })),
    })

    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('work-order-malformed-visibility'))
    const node = result.data?.workflowNodes?.[0]
    expect(node?.visibility).toEqual({ evidenceState: 'unknown', selectableRoleIds: [] })
    expect(projectDetailWorkflow(result.data?.workflowNodes ?? [], actor).selection).toBe('none')
  })

  it('makes unknown node types and lifecycle explicit and keeps execution read-only', () => {
    const unknown = readNode({
      id: 'unknown',
      category: 'unsupported',
      lifecycle: 'unknown',
      displayName: '未知节点',
    })
    expect(evaluateNodeVisibility({
      id: unknown.id,
      category: unknown.category,
      lifecycle: unknown.lifecycle,
    })).toEqual({ visible: false, reason: 'policy_unverified' })

    const current = projectDetailWorkflow([
      readNode({ id: 'form', category: 'forms', lifecycle: 'active', displayName: '表单' }),
    ], actor)
    expect(current.currentTask?.execution).toBe('disabled_read_only')
    expect(current.currentTask?.domainPolicy.allowed).toBe(true)
  })

  it('keeps presentation labels outside Runtime and never uses status as Current Task truth', () => {
    const detail = {
      id: asOpaqueId<'WorkOrderId'>('mock-work-order-001'),
      taskLabel: '跟进签约',
      workflowNodes: [
        readNode({
          id: 'forms-node',
          category: 'forms',
          lifecycle: 'active',
          displayName: '勘察',
          visibility: {
            evidenceState: 'verified',
            selectableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')],
          },
        }),
      ],
    }

    const projection = detailWorkflowUiProjectionFor(
      detail,
      {
        sessionRef: asOpaqueId<'SessionRef'>('synthetic-session-ref'),
        user: { id: asOpaqueId<'UserId'>('synthetic-user'), displayName: 'Synthetic Technician' },
        currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: 'Synthetic Role' },
        capabilityNames: [],
      },
    )
    expect(projection.currentTask).toMatchObject({
      title: '勘察',
      actionIntent: 'interact_with_form',
      actionLabel: '处理表单',
      tone: 'orange',
      domainPolicy: { allowed: true },
      execution: 'disabled_read_only',
    })
  })

  it('inherits the List status tone for each read-only Detail Action', async () => {
    const detailSession = {
      sessionRef: asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      user: { id: asOpaqueId<'UserId'>('synthetic-user'), displayName: 'Synthetic Technician' },
      currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: 'Synthetic Role' },
      capabilityNames: [],
    } as const
    const expected = [
      [mockDetailScenarioIds[0], 'orange', 'disabled_read_only'],
      [mockDetailScenarioIds[1], 'green', 'enabled'],
      [mockDetailScenarioIds[2], 'blue', 'disabled_read_only'],
    ] as const

    for (const [id, tone, execution] of expected) {
      const detail = await readScenario(id)
      expect(detailWorkflowUiProjectionFor(detail.data ?? null, detailSession).currentTask).toMatchObject({
        tone,
        execution,
      })
    }
  })
})
