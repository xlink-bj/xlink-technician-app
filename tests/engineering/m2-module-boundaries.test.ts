import { describe, expect, it } from 'vitest'
import { actionWorkspaceRouteFor as publicRouteFor } from '@features/work-orders'
import { actionWorkspaceRouteFor as sourceRouteFor } from '@features/work-orders/action-workspace-routes'
import type { MockJourneyContextSummary } from '@shared/types/mock-journey'
import type { MockJourneyContextSummary as AppSummary } from '@app/mock-journey-context'
import type { MockSurveyQuoteSuggestion as AppSuggestion } from '@app/mock-journey-quote-suggestion'
import { asOpaqueId } from '@shared/types'

describe('M2 public feature and neutral Mock presentation contracts', () => {
  it('uses the exact existing Work Order route implementation through the public facade', () => {
    expect(publicRouteFor).toBe(sourceRouteFor)
    expect(publicRouteFor(
      asOpaqueId<'WorkOrderId'>('wo /1'),
      asOpaqueId<'WorkflowNodeRuntimeId'>('node/&2'),
      'set_appointment',
    )).toBe('/pages/work-orders/action-workspace?id=wo%20%2F1&node=node%2F%262&action=set_appointment')
  })

  it('retains the existing App-level type compatibility without a feature-to-App import', () => {
    const suggestion: AppSuggestion = {
      surveyPathLabel: '平屋顶', targetRepairPartCode: 'synthetic-test',
      targetRepairPartLabel: '屋面', sourceDepth: 1,
    }
    const sharedSummary: MockJourneyContextSummary = {
      workOrderId: 'synthetic-work-order',
      sections: [{
        stage: 'survey', title: '勘察记录', updatedAt: null,
        state: 'not_recorded', lines: [], suggestion,
      }],
      suggestion,
    }
    const formerAppSummary: AppSummary = sharedSummary
    expect(formerAppSummary.suggestion).toBe(suggestion)
    expect(formerAppSummary.sections[0]?.state).toBe('not_recorded')
  })
})
