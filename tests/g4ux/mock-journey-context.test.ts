import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { advanceMockJourney, resetMockJourney, mockJourneyNodes, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import { readMockJourneyContext, type ReadPriorDraft } from '@app/mock-journey-context'
import type { ActionDraftRecord } from '@runtimes/action'
import { asOpaqueId } from '@shared/types'

const local = new Map<string, unknown>()
beforeEach(() => {
  local.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => local.get(key),
    setStorageSync: (key: string, value: unknown) => { local.set(key, value) },
    removeStorageSync: (key: string) => { local.delete(key) },
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

describe('MOCK-019 previous-stage read-only draft projection', () => {
  it('uses exact prior-node identities and carries only known local fields', async () => {
    const touched: string[] = []
    const read: ReadPriorDraft = async (identity) => {
      touched.push(String(identity.workflowNodeId))
      expect(String(identity.workOrderId)).toBe(mockJourneyWorkOrderId)
      const stage = String(identity.workflowNodeId) === mockJourneyNodes.appointment ? 'appointment' : 'survey'
      return {
        state: 'succeeded',
        data: {
          version: 1,
          identity: {
            ...identity,
            version: 1,
            userId: asOpaqueId<'UserId'>('synthetic-user'),
          },
          status: 'unfinished',
          updatedAt: '2026-10-10T08:00:00Z',
          values: stage === 'appointment'
            ? { need: '1', datetime: '2026-10-20 09:00', note: '演示前序预约备注', phone: 'must-not-display' }
            : { part: ['code-001'], squareMeter: '14.5', images1: ['private-image'] },
        } satisfies ActionDraftRecord<Readonly<Record<string, unknown>>>,
      }
    }
    expect(await readMockJourneyContext('appointment', read)).toBeNull()
    expect(advanceMockJourney('appointment')).toBe('survey')
    const survey = await readMockJourneyContext('survey', read)
    expect(survey?.sections).toHaveLength(1)
    expect(survey?.sections[0].lines).toContainEqual({ label: '预约备注', value: '演示前序预约备注' })
    expect(JSON.stringify(survey)).not.toContain('must-not-display')
    expect(advanceMockJourney('survey')).toBe('quotation')
    const quote = await readMockJourneyContext('quotation', read)
    expect(touched).toEqual([mockJourneyNodes.appointment, mockJourneyNodes.appointment, mockJourneyNodes.survey])
    expect(quote?.sections.map((item) => item.state)).toEqual(['saved_local', 'saved_local'])
    expect(quote?.sections[1].lines).toContainEqual({ label: '防水施工面积（㎡）', value: '14.5' })
    expect(JSON.stringify(quote)).not.toContain('private-image')
  })

  it('shows missing and failed reads explicitly rather than fabricating completion', async () => {
    advanceMockJourney('appointment')
    advanceMockJourney('survey')
    let calls = 0
    const read: ReadPriorDraft = async () => {
      calls += 1
      return calls === 1 ? { state: 'succeeded', data: null } : { state: 'failed_terminal' }
    }
    const context = await readMockJourneyContext('quotation', read)
    expect(context?.sections.map((x) => x.state)).toEqual(['not_recorded', 'read_failed'])
  })

  it('never reads context when DEV-only isolation is disabled', async () => {
    advanceMockJourney('appointment')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    const read = vi.fn<ReadPriorDraft>()
    expect(await readMockJourneyContext('survey', read)).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
})
