import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
export { createDevMockDevicePort } from '@adapters/device/dev-mock-device'

/** Separate synthetic device task attached to a DEV Mock listed work order.
 * It does not claim that the existing placeOrder workflow node is construction. */
export const devDeviceTask = {
  workOrderId: 'mock-work-order-002',
  nodeId: 'mock-device-action-node-002',
  contentIdentity: 'device-action-content-v1',
} as const

export function devDeviceActionAvailable(id: string): boolean {
  return isDevMockJourneyEnabled() && id === devDeviceTask.workOrderId
}
export function devDeviceActionUrl(): string {
  return `/pages/work-orders/device-action-mock?id=${encodeURIComponent(devDeviceTask.workOrderId)}`
}
