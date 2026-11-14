import { describe, expect, it } from 'vitest'
import { workOrderDetail } from '@adapters/api/read-models/work-order'
import { reviewR1ActivePlaceOrderHandler } from '@features/work-orders/signing/r1-signing-node-handler-evidence'
import { reviewR1SigningIntent } from '@features/work-orders/signing/r1-signing-command-intents'
import type { SessionSnapshot } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const actor: SessionSnapshot = { sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user') }, currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') }, capabilityNames: [] }

function mapped(workflowId: string | undefined, nodeWorkflowId: string | undefined) {
  return workOrderDetail({ data: {
    serviceAppointment: { _id: 'synthetic-work', state: 1 },
    ...(workflowId === undefined ? {} : { workflow: { _id: workflowId } }),
    workflowNode: [{ _id: 'synthetic-node', state: 0, handlerIds: ['synthetic-user'],
      ...(nodeWorkflowId === undefined ? {} : { workflowId: nodeWorkflowId }), nodeDef: { nodeType: 'placeOrder' } }],
  } }, asOpaqueId<'WorkOrderId'>('synthetic-work'), new Map(), new Map())
}

describe('fresh signing handler evidence requires a proven workflow instance', () => {
  it.each([
    ['missing detail run', undefined, 'synthetic-run'],
    ['missing node run', 'synthetic-run', undefined],
    ['both runs missing', undefined, undefined],
    ['blank detail run', '', 'synthetic-run'],
    ['blank node run', 'synthetic-run', ''],
  ] as const)('%s cannot qualify even with a matching handler in a real mapped response', (_label, workflowId, nodeWorkflowId) => {
    const detail = mapped(workflowId, nodeWorkflowId)
    expect(detail.workflowNodes?.[0]?.visibility?.evidenceState).toBe('verified')
    const handler = reviewR1ActivePlaceOrderHandler(detail, actor, 'synthetic-work')
    expect(handler.verified).toBe(false)
    const intent = reviewR1SigningIntent('electronic', { workOrderId: 'synthetic-work', selectedOrderId: 'synthetic-order',
      officialOrder: { id: 'synthetic-order', serviceAppointmentId: 'synthetic-work', type: 1, state: 1,
        processState: 0, hasExts: true, isAgainState: 'absent' }, contractState: 'succeeded', contracts: [],
      currentIdentityVerified: true, currentRoleWorkOrderVerified: true, currentNodeHandlerVerified: handler.verified })
    expect(intent).toMatchObject({ assessment: 'blocked', mayDispatch: false, backendPermissionProven: false })
  })

  it('accepts complete matching workflow evidence', () => {
    expect(reviewR1ActivePlaceOrderHandler(mapped('synthetic-run', 'synthetic-run'), actor, 'synthetic-work').verified).toBe(true)
  })

  it('retains mapper rejection of conflicting workflow identities', () => {
    expect(() => mapped('synthetic-run', 'foreign-run')).toThrow(/different workflow run/)
  })
})
