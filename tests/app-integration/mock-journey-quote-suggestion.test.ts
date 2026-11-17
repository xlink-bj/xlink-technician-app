import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { resetMockJourney } from '@adapters/api/mock/journey'
import { reachMockQuotationForTest } from './mock-journey-test-fixture'
import { canAdoptMockSurveySuggestion, mockSurveyQuoteSuggestionFor, verifiedSurveyPartLabel } from '@app/mock-journey-quote-suggestion'

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

const roof = ['survey-option-6b86b273ff34', 'survey-option-9bdb2af67992']
const quoteOptions = [{ value: 'repair-part-code-001', label: '屋面', children: [] }]

describe('P1C explicit synthetic Survey to Quotation suggestion', () => {
  it('resolves verified two-level Survey label but maps only a known synthetic first-level code', async () => {
    expect(verifiedSurveyPartLabel(roof)).toBe('屋面 / 有保护平屋面')
    const suggestion = mockSurveyQuoteSuggestionFor(roof)
    expect(suggestion).toEqual({
      surveyPathLabel: '屋面 / 有保护平屋面',
      targetRepairPartCode: 'repair-part-code-001',
      targetRepairPartLabel: '屋面',
      sourceDepth: 2,
    })
    expect(canAdoptMockSurveySuggestion(suggestion, quoteOptions, 0)).toBe(false)
    await reachMockQuotationForTest()
    expect(canAdoptMockSurveySuggestion(suggestion, quoteOptions, 0)).toBe(true)
    expect(canAdoptMockSurveySuggestion(suggestion, quoteOptions, 1)).toBe(false)
    expect(canAdoptMockSurveySuggestion(suggestion, [{ value: 'repair-part-code-001', label: '外墙' }], 0)).toBe(false)
    expect(canAdoptMockSurveySuggestion(suggestion, [], 0)).toBe(false)
  })

  it('rejects opaque/unverified child paths, unknown parents and cross-system raw ID copying', () => {
    expect(verifiedSurveyPartLabel(['arbitrary'])).toBeNull()
    expect(mockSurveyQuoteSuggestionFor(['survey-option-6b86b273ff34', 'unknown-child'])).toBeNull()
    expect(mockSurveyQuoteSuggestionFor(['repair-part-code-001'])).toBeNull()
    expect(mockSurveyQuoteSuggestionFor(['survey-option-4e07408562be'])).toBeNull()
    expect(mockSurveyQuoteSuggestionFor('survey-option-6b86b273ff34')).toBeNull()
  })

  it('is absent entirely when DEV journey isolation is disabled', () => {
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(mockSurveyQuoteSuggestionFor(roof)).toBeNull()
    expect(canAdoptMockSurveySuggestion({
      surveyPathLabel: '屋面', targetRepairPartCode: 'repair-part-code-001', targetRepairPartLabel: '屋面', sourceDepth: 1,
    }, quoteOptions, 0)).toBe(false)
  })
})
