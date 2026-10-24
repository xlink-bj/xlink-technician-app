import {
  advanceMockJourney,
  isDevMockJourneyEnabled,
  mockJourneyNodes,
  mockJourneyStage,
  mockJourneyWorkOrderId,
  resetMockJourney,
  type MockJourneyStage,
} from '@adapters/api/mock/journey'
import { actionWorkspaceRouteFor } from '@features/work-orders/action-workspace'
import { asOpaqueId } from '@shared/types'
import { resetMockCommercialReview } from '@app/mock-commercial-journey'

/** Review-only visual navigation. Never calls Order/Workflow/ExtForm commands. */
export function isMockJourneyAvailable(): boolean { return isDevMockJourneyEnabled() }

export function mockJourneyContext(workOrderId: string | null | undefined) {
  if (!isDevMockJourneyEnabled() || workOrderId !== mockJourneyWorkOrderId) return null
  const stage = mockJourneyStage()
  return {
    stage,
    workOrderId: mockJourneyWorkOrderId,
    nextLabel: stage === 'appointment' ? '模拟进入现场勘察' : stage === 'survey' ? '模拟进入报价' : '',
  }
}

export function advanceMockJourneyContext(expected: MockJourneyStage): boolean {
  return advanceMockJourney(expected) !== null
}

export function mockJourneyRoute(): string {
  const stage = mockJourneyStage()
  const actionIntent = stage === 'appointment' ? 'set_appointment'
    : stage === 'survey' ? 'interact_with_form' : 'place_order'
  return actionWorkspaceRouteFor(
    asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
    asOpaqueId<'WorkflowNodeRuntimeId'>(mockJourneyNodes[stage]),
    actionIntent,
  )
}

export function resetAndOpenMockJourney(): string {
  resetMockCommercialReview()
  resetMockJourney()
  return mockJourneyRoute()
}
