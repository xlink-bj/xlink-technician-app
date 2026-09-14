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
  },
): WorkflowNodeRead {
  return {
    id: asOpaqueId<'WorkflowNodeRuntimeId'>(input.id ? String(input.id) : 'node'),
    category: input.category,
    lifecycle: input.lifecycle,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.handlers ? { handlers: input.handlers } : {}),
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
      { id: mockDetailScenarioIds[3], category: 'placeOrder', lifecycle: 'active', title: '下单', action: 'place_order' },
      { id: mockDetailScenarioIds[4], category: 'forms', lifecycle: 'active', selection: 'none' },
      { id: mockDetailScenarioIds[5], category: 'unsupported', lifecycle: 'unknown', selection: 'none' },
    ] as const

    for (const scenario of expected) {
      const result = await readScenario(scenario.id)
      const nodes = result.data?.workflowNodes ?? []
      const normalizedNode = nodes.find((node) => node.lifecycle === scenario.lifecycle)
      expect(normalizedNode).toMatchObject({ category: scenario.category, lifecycle: scenario.lifecycle })
      expect(nodes.every((node) => !('state' in node) && !('nodeDef' in node))).toBe(true)

      const projection = projectDetailWorkflow(nodes, scenario.id === mockDetailScenarioIds[4] ? actor : undefined)
      if ('title' in scenario) {
        expect(projection).toMatchObject({
          selection: 'selected',
          currentTask: {
            title: scenario.title,
            actionIntent: scenario.action,
            domainPolicy: { allowed: true, action: scenario.action },
            execution: 'disabled_read_only',
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

    const projection = projectDetailWorkflow([first, second])
    expect(projection.selection).toBe('ambiguous')
    expect(projection.currentTask).toBeUndefined()
    expect(projection.actionableNodeCount).toBe(2)

    const one = projectDetailWorkflow([second, readNode({ ...first, lifecycle: 'closed' })])
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
    })
    const metadata: WorkflowNodeMetadata = {
      id: blocked.id,
      category: blocked.category,
      lifecycle: blocked.lifecycle,
      handlers: blocked.handlers,
    }

    expect(evaluateNodeVisibility(metadata, actor)).toEqual({ visible: false, reason: 'not_handler' })
    expect(projectDetailWorkflow([blocked], actor)).toMatchObject({
      selection: 'none',
      visibleNodeCount: 0,
      actionableNodeCount: 0,
    })
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
    ])
    expect(current.currentTask?.execution).toBe('disabled_read_only')
    expect(current.currentTask?.domainPolicy.allowed).toBe(true)
  })

  it('keeps presentation labels outside Runtime and never uses status as Current Task truth', () => {
    const detail = {
      id: asOpaqueId<'WorkOrderId'>('mock-work-order-001'),
      taskLabel: '跟进签约',
      workflowNodes: [
        readNode({ id: 'forms-node', category: 'forms', lifecycle: 'active', displayName: '勘察' }),
      ],
    }

    const projection = detailWorkflowUiProjectionFor(detail, null)
    expect(projection.currentTask).toMatchObject({
      title: '勘察',
      actionIntent: 'interact_with_form',
      actionLabel: '处理表单',
      tone: 'blue',
      domainPolicy: { allowed: true },
      execution: 'disabled_read_only',
    })
  })
})
