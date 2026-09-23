import type {
  CodeOptionRead,
  QuotationCatalogContext,
  QuotationCatalogReadPort,
} from '@shared/ports'

import type { QuotationDraft } from './model'
import { hydrateQuotationDraft, type QuotationHydrationIssue } from './hydration'
import { calculateQuotationPricing, type QuotationPricingIssue, type QuotationPricingResult } from './pricing'
import { encodeR1OfficialOrderType1, type QuotationEncodingIssue, type R1OfficialOrderType1Payload } from './order-encoder'
import { validateQuotationDraft, type QuotationValidationIssue, type QuotationValidationResult } from './validation'

export type QuotationEngineIssue =
  | ({ readonly phase: 'validation' } & QuotationValidationIssue)
  | ({ readonly phase: 'hydration' } & QuotationHydrationIssue)
  | ({ readonly phase: 'pricing' } & QuotationPricingIssue)
  | ({ readonly phase: 'encoding' } & QuotationEncodingIssue)

export interface QuotationEngineResult {
  readonly state: 'ready' | 'blocked'
  readonly draftVersion: number
  readonly validation: QuotationValidationResult
  readonly pricing?: QuotationPricingResult
  readonly payload?: R1OfficialOrderType1Payload
  readonly issues: readonly QuotationEngineIssue[]
}

export async function evaluateQuotationDraft(input: {
  readonly draft: QuotationDraft
  readonly catalogContext: QuotationCatalogContext | null | undefined
  readonly catalogRead: QuotationCatalogReadPort | null | undefined
  readonly serviceAppointmentNum?: string
  readonly repairPartOptions?: readonly CodeOptionRead[]
}): Promise<QuotationEngineResult> {
  const validation = validateQuotationDraft(input.draft)
  if (validation.state !== 'ready') {
    return {
      state: 'blocked',
      draftVersion: input.draft.draftVersion,
      validation,
      issues: validation.issues.map((issue) => ({ ...issue, phase: 'validation' as const })),
    }
  }

  const hydration = await hydrateQuotationDraft({
    draft: input.draft,
    context: input.catalogContext,
    port: input.catalogRead,
  })
  if (hydration.state !== 'succeeded') {
    return {
      state: 'blocked',
      draftVersion: input.draft.draftVersion,
      validation,
      issues: hydration.issues.map((issue) => ({ ...issue, phase: 'hydration' as const })),
    }
  }

  const pricing = calculateQuotationPricing(hydration.data)
  if (pricing.state !== 'succeeded') {
    return {
      state: 'blocked',
      draftVersion: input.draft.draftVersion,
      validation,
      issues: pricing.issues.map((issue) => ({ ...issue, phase: 'pricing' as const })),
    }
  }

  const encoding = encodeR1OfficialOrderType1({
    draft: hydration.data,
    pricing: pricing.data,
    catalogContext: input.catalogContext!,
    serviceAppointmentNum: input.serviceAppointmentNum,
    repairPartOptions: input.repairPartOptions,
  })
  if (encoding.state !== 'ready') {
    return {
      state: 'blocked',
      draftVersion: input.draft.draftVersion,
      validation,
      pricing: pricing.data,
      issues: encoding.issues.map((issue) => ({ ...issue, phase: 'encoding' as const })),
    }
  }
  return {
    state: 'ready',
    draftVersion: input.draft.draftVersion,
    validation,
    pricing: pricing.data,
    payload: encoding.payload,
    issues: [],
  }
}
