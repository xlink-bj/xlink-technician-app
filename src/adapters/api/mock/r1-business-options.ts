import type { TechnicianApiReadPort } from '@shared/ports'
import { createOperationError } from '@shared/types'
import { isDevMockJourneyEnabled } from './journey'

/** R1 serviceGoods is List<String> from projPackage. These are synthetic
 * entity IDs, never code-table rows, prices, quotes or real API responses. */
export function createMockR1BusinessOptions(isCurrent: () => boolean): Pick<TechnicianApiReadPort, 'getBusinessRecordOptions'> {
  return {
    getBusinessRecordOptions: async ({ valueOption }) => {
      if (!isDevMockJourneyEnabled() || !isCurrent() || valueOption !== 'projPackage') {
        return { state: 'failed_terminal', error: createOperationError('authorization_denied', '当前业务选项不可用') }
      }
      return { state: 'succeeded', data: { items: [
        { value: 'mock-service-package-roof', label: '屋面防水维修' },
        { value: 'mock-service-package-wall', label: '外墙防水维修' },
      ] } }
    },
  }
}
