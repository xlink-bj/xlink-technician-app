import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import type {
  MaterialFulfillmentReadPort,
  MaterialFulfillmentSnapshot,
} from '@features/work-orders/downstream/material-fulfillment-read'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'
import type { SessionSnapshot } from '@shared/ports'

export const materialFulfillmentMockWorkOrderId = 'mock-work-order-002'
const workOrderId = materialFulfillmentMockWorkOrderId
const roofRequestId = 'CL-001'
const drainRequestId = 'CL-002'

const initial: MaterialFulfillmentSnapshot = {
  workOrderId,
  requests: [
    {
      id: roofRequestId,
      workOrderId,
      materials: [
        { name: '高分子防水卷材', quantity: 2, unit: '卷' },
        { name: '密封胶', quantity: 6, unit: '支' },
      ],
    },
    {
      id: drainRequestId,
      workOrderId,
      materials: [{ name: '排水口附加层材料', quantity: 1, unit: '套' }],
    },
  ],
  batches: [
    { id: 'PS-001', workOrderId, requestId: roofRequestId, arrival: 'arrived', updatedAt: '11月19日 09:10' },
    { id: 'PS-002', workOrderId, requestId: roofRequestId, arrival: 'in_transit', updatedAt: '11月19日 14:25' },
    { id: 'PS-003', workOrderId, requestId: drainRequestId },
  ],
}

// Independent, pre-authored snapshots let the reviewer re-read a changed batch
// status without a submission, simulated write, or persisted state.
const rechecked: MaterialFulfillmentSnapshot = {
  ...initial,
  batches: initial.batches.map(batch => batch.id === 'PS-002'
    ? { ...batch, arrival: 'arrived', updatedAt: '11月20日 08:40' }
    : batch),
}

export function isMaterialFulfillmentMockAvailable(id: string, session: SessionSnapshot | null): boolean {
  return isDevMockJourneyEnabled() && id === workOrderId
    && session?.user.id === mockJourneyUserId && session.currentRole?.id === mockJourneyRoleId
}

export const materialFulfillmentMock: { read: MaterialFulfillmentReadPort } = {
  async read(id, mode) {
    if (!isDevMockJourneyEnabled() || id !== workOrderId) throw new Error('Offline material record scope denied')
    return mode === 'initial' ? initial : rechecked
  },
}
