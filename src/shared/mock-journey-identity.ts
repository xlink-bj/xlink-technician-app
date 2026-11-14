/** Synthetic DEV Mock identities only; these values grant no authorization. */
export const mockJourneyUserId = 'synthetic-user'
export const mockJourneyRoleId = 'synthetic-role'
export const mockJourneyWorkOrderId = 'mock-work-order-019-continuous-journey'
export const mockJourneyNodes = {
  appointment: 'mock-workflow-node-019-appointment',
  survey: 'mock-workflow-node-019-survey',
  quotation: 'mock-workflow-node-019-place-order',
} as const
