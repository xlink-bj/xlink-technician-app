import { isProductionReadOnlyRuntime } from '@shared/config'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'
import { asOpaqueId } from '@shared/types'
import type { SessionSnapshot, WorkOrderSummary } from '@shared/ports'

import { isBusinessMockMode } from './config'

type Assignment = Readonly<{ workOrderId: string; runId: string; nodeId: string }>

// This fixture alone grants refusal to its direct synthetic handler. An accept
// projection, ordinary work-order state, or general write flag grants nothing.
export const g05Assignment = Object.freeze({
  workOrderId: 'mock-g05-work-order', runId: 'mock-g05-run', nodeId: 'mock-g05-assignment-1',
})
type RefusalReceipt = Readonly<Assignment & {
  state: 'refused'; reason: string; actorId: string; roleId: string
}>

// Same-process mock authority, independent of any list or confirmation dialog.
let receipt: RefusalReceipt | null = null
let simulatedReadLost = false

function allowed(session: SessionSnapshot | null): boolean {
  return import.meta.env.DEV === true
    && import.meta.env.VITE_XLINK_ENVIRONMENT === 'dev'
    && import.meta.env.VITE_XLINK_MOCK === 'true'
    && import.meta.env.VITE_XLINK_G05_REFUSAL === 'true'
    && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true'
    && !isProductionReadOnlyRuntime()
    && isBusinessMockMode() === 'data'
    && session?.sessionRef === 'local-mock-only-session'
    && session.user.id === mockJourneyUserId && session.currentRole?.id === mockJourneyRoleId
    && session.roleVersion === 'local-dev-role-version-1'
}

// Dedicated review row served only to the exact synthetic actor. It never
// enters the generic accept command state or the ordinary work-order store.
const fixtureRow: WorkOrderSummary = {
  id: asOpaqueId(g05Assignment.workOrderId), displayNumber: 'G05-01501', taskLabel: '派工确认',
  workflowNodes: [{
    id: asOpaqueId(g05Assignment.nodeId), runId: asOpaqueId(g05Assignment.runId),
    category: 'accept', lifecycle: 'active', nodeTypeEvidence: 'runtime_node_def',
    handlers: [{ kind: 'user', userId: asOpaqueId(mockJourneyUserId) }],
  }],
}

export function readG05AssignedRow(session: SessionSnapshot | null): WorkOrderSummary | null {
  return allowed(session) ? fixtureRow : null
}

function sameAssignment(target: Assignment): boolean {
  return target.workOrderId === g05Assignment.workOrderId && target.runId === g05Assignment.runId
    && target.nodeId === g05Assignment.nodeId
}

function active(rows: readonly WorkOrderSummary[]): boolean {
  const matches = rows.filter(row => row.id === g05Assignment.workOrderId)
  if (matches.length !== 1) return false
  const nodes = matches[0].workflowNodes?.filter(node => node.lifecycle === 'active')
  if (nodes?.length !== 1) return false
  const [node] = nodes
  return node.id === g05Assignment.nodeId && node.runId === g05Assignment.runId
    && node.category === 'accept' && node.nodeTypeEvidence === 'runtime_node_def'
    && !node.isSystem && !node.isSentinel
    && node.handlers?.some(handler => handler.kind === 'user' && handler.userId === mockJourneyUserId) === true
}

/** Isolated synthetic command; getters must read the current session and rows.
 * No transport, storage writer, list mutation or real workflow command. */
export function createG05RefusalReview(currentSession: () => SessionSnapshot | null, currentRows: () => readonly WorkOrderSummary[]) {
  function readOutcome(target: Assignment): RefusalReceipt | 'pending' | 'unknown' {
    if (!allowed(currentSession()) || !sameAssignment(target)) return 'unknown'
    if (receipt) return receipt
    return active(currentRows()) ? 'pending' : 'unknown'
  }

  function begin(target: Assignment) {
    if (readOutcome(target) !== 'pending') return null
    let open = true
    return {
      cancel() { open = false },
      confirm(rawReason: string) {
        if (!open) return 'closed' as const
        const reason = rawReason.trim()
        if (!reason) return 'reason_required' as const
        open = false
        // Recheck the live target immediately before the synchronous fixture
        // write. A competing dialog or an ambiguous row must only re-read.
        if (readOutcome(target) !== 'pending') return 'check_receipt' as const
        receipt = Object.freeze({
          ...g05Assignment, state: 'refused', reason, actorId: mockJourneyUserId, roleId: mockJourneyRoleId,
        })
        return 'check_receipt' as const
      },
    }
  }
  // A single optional synthetic read failure, consumed only by an explicit
  // receipt lookup. It never changes the recorded command or list projection.
  function readReceipt(target: Assignment) {
    const outcome = readOutcome(target)
    if (typeof outcome === 'object' && !simulatedReadLost && import.meta.env.VITE_XLINK_G05_MISS_FIRST_RECEIPT === 'true') {
      simulatedReadLost = true
      return 'unknown'
    }
    return outcome
  }
  return { begin, readOutcome, readReceipt }
}
