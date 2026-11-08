import type { WorkOrderCategory } from '@shared/ports'
import { AdapterMappingError } from '../common/operations'

// Pinned R2 list classification; raw R1 status codes stay in the adapter.
const categoryStatuses = {
  to_accept: ['101', '102', '103'],
  need_contact: ['104'],
  onsite: ['105', '202'],
  following: ['200', '201', '203', '204', '205', '206', '207', '300', '301', '302', '401', '402', '403', '407', '501', '502', '999'],
} as const

/** null means an empty intersection, never an unfiltered query. */
export function workOrderCategoryStatusFilter(category: WorkOrderCategory | undefined, roleFilter?: string): string | undefined | null {
  if (category === undefined || category === 'all') return roleFilter
  if (!Object.prototype.hasOwnProperty.call(categoryStatuses, category)) {
    throw new AdapterMappingError('Unsupported Work Order category')
  }
  const statuses: readonly string[] = categoryStatuses[category]
  if (!roleFilter) return statuses.join(',')
  const allowed = new Set(roleFilter.split(',').map(value => value.trim()))
  const intersection = statuses.filter(value => allowed.has(value))
  return intersection.length ? intersection.join(',') : null
}
