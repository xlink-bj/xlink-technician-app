/**
 * DEV-only Mock Journey display DTOs shared by App composition and Work Order
 * UI. They describe prior-draft presentation, not a production workflow,
 * quotation or cross-domain ID mapping contract.
 */
export interface MockSurveyQuoteSuggestion {
  readonly surveyPathLabel: string
  readonly targetRepairPartCode: string
  readonly targetRepairPartLabel: string
  readonly sourceDepth: number
}

export interface MockJourneyContextLine {
  readonly label: string
  readonly value: string
}

export interface MockJourneyContextSection {
  readonly stage: 'appointment' | 'survey'
  readonly title: string
  readonly updatedAt: string | null
  readonly lines: readonly MockJourneyContextLine[]
  readonly state: 'saved_local' | 'not_recorded' | 'read_failed'
  readonly suggestion?: MockSurveyQuoteSuggestion
}

export interface MockJourneyContextSummary {
  readonly workOrderId: string
  readonly sections: readonly MockJourneyContextSection[]
  readonly suggestion?: MockSurveyQuoteSuggestion
}
