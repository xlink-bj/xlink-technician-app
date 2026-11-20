import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDevMockUxSessionPort } from '@adapters/auth/dev-mock-ux-session'
import type { SessionSnapshot, WorkflowNodeRead, WorkOrderSummary } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_API_BASE_URL', '')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_G05_REFUSAL', 'true')
})
afterEach(() => { vi.unstubAllEnvs() })

async function scenario() {
  const { g05Assignment: target, createG05RefusalReview } = await import('@adapters/api/mock/g05-refusal')
  const session = createDevMockUxSessionPort().getCurrentSession()!
  const node: WorkflowNodeRead = {
    id: asOpaqueId(target.nodeId), runId: asOpaqueId(target.runId),
    category: 'accept', lifecycle: 'active', nodeTypeEvidence: 'runtime_node_def',
    handlers: [{ kind: 'user', userId: session.user.id }],
  }
  const row: WorkOrderSummary = { id: asOpaqueId(target.workOrderId), workflowNodes: [node] }
  const source = { session: session as SessionSnapshot | null, rows: [row] }
  const openReview = () => createG05RefusalReview(() => source.session, () => source.rows)
  return { target, node, row, session, source, openReview, review: openReview() }
}

describe('explicit G05 DEV fixture', () => {
  it('requires a reason; cancel writes nothing and closes the old confirmation', async () => {
    const { review, target } = await scenario()
    const dialog = review.begin(target)!
    expect(dialog.confirm('  ')).toBe('reason_required')
    dialog.cancel()
    expect(dialog.confirm('时间冲突')).toBe('closed')
    expect(review.readOutcome(target)).toBe('pending')
  })

  it('recovers a lost response from the same assignment after reopening; no duplicate or list mutation', async () => {
    const { review, target, row, source, session, openReview } = await scenario()
    const first = review.begin(target)!
    const competitor = review.begin(target)!
    first.confirm('  已有现场任务  ') // Simulate the caller losing this reply.
    expect(competitor.confirm('第二次点击')).toBe('check_receipt')
    expect(source.rows).toEqual([row])
    source.rows = []
    const reopened = openReview()
    source.session = null
    expect(reopened.readOutcome(target)).toBe('unknown')
    expect(reopened.begin(target)).toBeNull()
    source.session = session
    expect(reopened.readOutcome(target)).toMatchObject({ ...target, state: 'refused', reason: '已有现场任务' })
    expect(reopened.begin(target)).toBeNull()
    expect(reopened.readOutcome({ ...target, nodeId: 'later-assignment' })).toBe('unknown')
  })

  it('rechecks actor and active assignment on confirm; missing list row is an unknown outcome', async () => {
    const { review, target, source, session, row } = await scenario()
    const stale = review.begin(target)!
    source.session = { ...session, roleVersion: 'revoked' }
    expect(stale.confirm('原任务')).toBe('check_receipt')
    expect(review.readOutcome(target)).toBe('unknown')
    source.session = session
    const next = review.begin(target)!
    source.rows = []
    expect(next.confirm('旧派工')).toBe('check_receipt')
    expect(review.readOutcome(target)).toBe('unknown')
    expect(review.begin(target)).toBeNull()
    source.rows = [row]
    expect(review.readOutcome(target)).toBe('pending')
  })

  it('refuses ordinary rows, ambiguous nodes, stale runs, other handlers and unverified metadata', async () => {
    const { review, source, row, node, target } = await scenario()
    for (const nodes of [
      [], [node, node], [{ ...node, runId: asOpaqueId<'WorkflowRunId'>('other') }], [{ ...node, handlers: [] }],
      [{ ...node, nodeTypeEvidence: 'unresolved' as const }], [{ ...node, isSentinel: true }],
    ]) {
      source.rows = [{ ...row, workflowNodes: nodes }]
      expect(review.begin(target)).toBeNull()
    }
    source.rows = [row, row]
    expect(review.begin(target)).toBeNull()
    source.rows = [{ ...row, id: asOpaqueId('ordinary-order'), taskLabel: '待接单' }]
    expect(review.begin(target)).toBeNull()
    expect(review.begin({ ...target, workOrderId: 'ordinary-order' })).toBeNull()
  })

  it('rechecks the exact run, node and direct synthetic handler without sharing read rights', async () => {
    const { review, target, node, row, source, session } = await scenario()
    const stale = review.begin(target)!
    source.rows = [{ ...row, workflowNodes: [{ ...node, id: asOpaqueId('reassigned') }] }]
    expect(stale.confirm('无法到场')).toBe('check_receipt')
    expect(review.readOutcome(target)).toBe('unknown')
    source.rows = [row]
    expect(review.readOutcome(target)).toBe('pending')
    source.session = { ...session, user: { id: asOpaqueId('other-technician') } }
    expect(review.begin(target)).toBeNull()
    source.session = { ...session, currentRole: { id: asOpaqueId('other-role') } }
    expect(review.readOutcome(target)).toBe('unknown')
  })

  it('disables the command in empty or read-through Mock mode', async () => {
    const { review, target } = await scenario()
    const { setBusinessMockMode } = await import('@adapters/api/mock/config')
    for (const mode of ['empty', 'off'] as const) {
      setBusinessMockMode(mode)
      expect(review.begin(target)).toBeNull()
      expect(review.readOutcome(target)).toBe('unknown')
    }
  })

  it('stays closed in a release build even with the scenario flags', async () => {
    const { review, target } = await scenario()
    vi.stubEnv('DEV', false)
    expect(review.begin(target)).toBeNull()
  })

  it.each([
    ['VITE_XLINK_ENVIRONMENT', 'prod'], ['VITE_XLINK_ENVIRONMENT', 'staging'], ['VITE_XLINK_MOCK', 'false'],
    ['VITE_XLINK_G05_REFUSAL', 'false'], ['VITE_XLINK_H5_MOCK_E2E', 'false'],
    ['VITE_XLINK_API_BASE_URL', 'https://xlink.fsgo365.cn'],
  ])('keeps the fixture closed for %s=%s', async (key, value) => {
    const { review, target } = await scenario()
    vi.stubEnv(key, value)
    expect(review.begin(target)).toBeNull()
    expect(review.readOutcome(target)).toBe('unknown')
  })
})
