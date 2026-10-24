import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { mockJourneyStage, resetMockJourney } from '@adapters/api/mock/journey'
import { advanceMockJourneyWithSavedDraft, hasLocalJourneyEvidence } from '@app/mock-journey-closure'
import type { ReadPriorDraft } from '@app/mock-journey-context'
import { asOpaqueId } from '@shared/types'

const stored = new Map<string, unknown>()
beforeEach(() => {
  stored.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => stored.get(key),
    setStorageSync: (key: string, value: unknown) => { stored.set(key, value) },
    removeStorageSync: (key: string) => { stored.delete(key) },
  })
  resetBusinessMockCache()
  setBusinessMockMode('data')
  resetMockJourney()
})
afterEach(() => {
  resetBusinessMockCache()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function saved(values: Readonly<Record<string, unknown>>, overrides?: {
  readonly status?: 'completed' | 'unfinished'
  readonly nodeId?: string
}): ReadPriorDraft {
  return async (identity) => ({ state: 'succeeded', data: {
    version: 1,
    identity: {
      ...identity, version: 1,
      userId: asOpaqueId<'UserId'>('synthetic-user'),
      ...(overrides?.nodeId ? { workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(overrides.nodeId) } : {}),
    },
    status: overrides?.status ?? 'unfinished',
    updatedAt: '2026-10-24T00:00:00Z', values,
  } })
}

describe('DEV Mock saved-form → workflow projection handoff', () => {
  it('requires known, nonempty local field evidence', () => {
    expect(hasLocalJourneyEvidence('appointment', { unknown: 'fake' })).toBe(false)
    expect(hasLocalJourneyEvidence('appointment', { note: '   ' })).toBe(false)
    expect(hasLocalJourneyEvidence('appointment', { need: '0' })).toBe(true)
    expect(hasLocalJourneyEvidence('survey', { squareMeter: 0 })).toBe(true)
    expect(hasLocalJourneyEvidence('survey', { part: [] })).toBe(false)
    expect(hasLocalJourneyEvidence('survey', { part: ['roof'] })).toBe(true)
  })

  it('does not advance from empty, completed, malformed-identity or missing local drafts', async () => {
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({}))).state).toBe('blocked')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '现场核验' }, { status: 'completed' }))).state).toBe('blocked')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '现场核验' }, { nodeId: 'foreign-node' }))).state).toBe('blocked')
    expect(mockJourneyStage()).toBe('appointment')
    expect(await advanceMockJourneyWithSavedDraft('appointment', async () => ({ state: 'succeeded', data: null })))
      .toEqual({ state: 'blocked', reason: 'missing_draft' })
  })

  it('advances only after exact saved draft readback, preserving synthetic node progression', async () => {
    expect(await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '平屋顶渗漏' })))
      .toEqual({ state: 'advanced', next: 'survey' })
    expect(mockJourneyStage()).toBe('survey')
    expect(await advanceMockJourneyWithSavedDraft('survey', saved({ squareMeter: '18.5' })))
      .toEqual({ state: 'advanced', next: 'quotation' })
    expect(mockJourneyStage()).toBe('quotation')
    expect((await advanceMockJourneyWithSavedDraft('survey', saved({ squareMeter: '18.5' }))).state).toBe('blocked')
  })

  it('fails closed on read error, scope flip, disabled DEV flag and local persistence failure', async () => {
    expect(await advanceMockJourneyWithSavedDraft('appointment', async () => ({ state: 'failed_terminal' })))
      .toEqual({ state: 'blocked', reason: 'read_failed' })
    expect(await advanceMockJourneyWithSavedDraft('appointment', async () => {
      setBusinessMockMode('off')
      return saved({ note: 'draft' })({
        workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-019-continuous-journey'),
        workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-019-appointment'),
        actionIntent: 'set_appointment', contentKind: 'dynamic_form',
        contentIdentity: 'mock-appointment',
      })
    })).toEqual({ state: 'blocked', reason: 'scope' })
    setBusinessMockMode('data')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: 'draft' }))).state).toBe('blocked')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    vi.stubGlobal('uni', {
      getStorageSync: () => null,
      setStorageSync: () => { throw new Error('no storage') },
      removeStorageSync: () => {},
    })
    expect(await advanceMockJourneyWithSavedDraft('appointment', saved({ note: 'draft' })))
      .toEqual({ state: 'blocked', reason: 'storage_failed' })
  })
})
