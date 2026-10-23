import { isDevMockJourneyEnabled, mockJourneyStage } from '@adapters/api/mock/journey'
import { surveyContract } from '@adapters/api/mock/survey-contract'
import type { CodeOptionRead } from '@shared/ports'

export interface MockSurveyQuoteSuggestion {
  readonly surveyPathLabel: string
  readonly targetRepairPartCode: string
  readonly targetRepairPartLabel: string
  readonly sourceDepth: number
}

/**
 * These are TWO deliberately verified SYNTHETIC fixtures, not a production
 * cross-domain ID map. Survey and quotation are separate code systems.
 * Reject rather than infer unknown real tenant paths or partial child IDs.
 */
const syntheticFirstLevelMap = [
  { surveyCode: 'survey-option-6b86b273ff34', quoteCode: 'repair-part-code-001', label: '屋面' },
  { surveyCode: 'survey-option-d4735e3a265e', quoteCode: 'repair-part-code-003', label: '卫生间' },
] as const

function surveyPartPath(raw: unknown): { readonly codes: readonly string[]; readonly labels: readonly string[] } | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3
    || !raw.every((code) => typeof code === 'string' && code.length > 0)) return null
  const provider = surveyContract.providers.find((item) => item.id === 'parts' && item.verification === 'VERIFIED')
  if (!provider) return null
  let options = provider.options
  const labels: string[] = []
  for (const code of raw as string[]) {
    const option = options.find((item) => item.value === code)
    if (!option) return null
    labels.push(option.label)
    options = option.children ?? []
  }
  return { codes: raw as string[], labels }
}

/** Display verified survey labels, never claim opaque codes are place names. */
export function verifiedSurveyPartLabel(raw: unknown): string | null {
  return surveyPartPath(raw)?.labels.join(' / ') ?? null
}

/** A *suggestion*, not a quotation, line item, price or confirmed repair plan. */
export function mockSurveyQuoteSuggestionFor(raw: unknown): MockSurveyQuoteSuggestion | null {
  if (!isDevMockJourneyEnabled()) return null
  const source = surveyPartPath(raw)
  if (!source) return null
  const mapping = syntheticFirstLevelMap.find((item) =>
    item.surveyCode === source.codes[0] && item.label === source.labels[0])
  if (!mapping) return null
  return {
    surveyPathLabel: source.labels.join(' / '),
    targetRepairPartCode: mapping.quoteCode,
    targetRepairPartLabel: mapping.label,
    sourceDepth: source.codes.length,
  }
}

/**
 * Final confirmation guard validates the currently loaded quotation options,
 * blank local draft, active stage, and original static synthetic ID mapping.
 */
export function canAdoptMockSurveySuggestion(
  suggestion: MockSurveyQuoteSuggestion | null | undefined,
  options: readonly CodeOptionRead[],
  existingGroupCount: number,
): boolean {
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== 'quotation' || !suggestion || existingGroupCount !== 0) return false
  const mapped = syntheticFirstLevelMap.find((item) =>
    item.quoteCode === suggestion.targetRepairPartCode && item.label === suggestion.targetRepairPartLabel)
  return Boolean(mapped && options.some((option) =>
    option.value === mapped.quoteCode && option.label === mapped.label))
}
