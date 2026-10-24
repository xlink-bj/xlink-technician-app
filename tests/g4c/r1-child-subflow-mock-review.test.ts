import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import {
  childSubflowMockReviewUrl, childSubflowMockWorkOrderId,
  isChildSubflowMockPreviewAvailable, readChildSubflowMock,
  type ChildSubflowMockScenario,
} from '@app/child-subflow-mock-review'

const input = {
  workOrderId: childSubflowMockWorkOrderId,
  userId: 'synthetic-user',
  roleId: 'synthetic-role',
  scenario: 'mixed' as ChildSubflowMockScenario,
}

beforeEach(() => {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  resetBusinessMockCache()
  setBusinessMockMode('data')
})
afterEach(() => {
  resetBusinessMockCache()
  vi.unstubAllEnvs()
})

describe('R1 child subflow DEV Mock panel preview', () => {
  it('exposes a bounded synthetic entry without network or mutation hooks', () => {
    expect(isChildSubflowMockPreviewAvailable()).toBe(true)
    expect(childSubflowMockReviewUrl()).toContain('child-subflow-mock-review?id=mock-work-order-006')
    const result = readChildSubflowMock(input)
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.parent.category).toBe('subworkflow')
    expect(result.parent.sourceNodeType).toBe('subflows')
    expect(result.nodes).toHaveLength(3)
    expect(result.nodes.every((node) => node.parentNodeId === result.parent.id)).toBe(true)
    expect(result.nodes.every((node) => node.nodeTypeEvidence === 'unresolved')).toBe(true)
    expect(result.nodes.every((node) => !node.sourceNodeType)).toBe(true)
    expect(result.nodes.some((node) => node.formDefinitionIdEvidence === 'runtime_node')).toBe(true)
    expect(result.nodes.filter((node) => node.lifecycle === 'inactive')).toHaveLength(1)
  })

  it('renders inactive-only, empty and bounded failure states from synthetic data only', () => {
    const inactive = readChildSubflowMock({ ...input, scenario: 'cancelled' })
    expect(inactive.kind).toBe('ready')
    if (inactive.kind === 'ready') {
      expect(inactive.nodes).toHaveLength(1)
      expect(inactive.nodes[0].lifecycle).toBe('inactive')
    }
    const empty = readChildSubflowMock({ ...input, scenario: 'empty' })
    expect(empty.kind === 'ready' && empty.nodes).toEqual([])
    expect(readChildSubflowMock({ ...input, scenario: 'read_error' }).kind).toBe('read_error')
  })

  it('fails closed for forged identity and unrecognized scenarios', () => {
    for (const override of [
      { workOrderId: 'unrelated-work-order' }, { userId: 'unrelated-user' },
      { roleId: 'unrelated-role' }, { scenario: 'repeat' as ChildSubflowMockScenario },
    ]) expect(readChildSubflowMock({ ...input, ...override }).kind).toBe('blocked')
    expect(readChildSubflowMock({ ...input, userId: undefined }).kind).toBe('blocked')
  })

  it('disappears in Mock OFF, empty, Production and when H5-E2E is disabled', () => {
    setBusinessMockMode('off')
    expect(isChildSubflowMockPreviewAvailable()).toBe(false)
    expect(readChildSubflowMock(input).kind).toBe('blocked')
    setBusinessMockMode('empty')
    expect(readChildSubflowMock(input).kind).toBe('blocked')
    setBusinessMockMode('data')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(readChildSubflowMock(input).kind).toBe('blocked')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    expect(readChildSubflowMock(input).kind).toBe('blocked')
  })
})
