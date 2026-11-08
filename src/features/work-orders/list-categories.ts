import type { WorkOrderCategory } from '@shared/ports'

export const workOrderCategories: readonly { key: WorkOrderCategory; label: string }[] = [
  { key: 'to_accept', label: '待接单' },
  { key: 'need_contact', label: '待联系' },
  { key: 'onsite', label: '待上门' },
  { key: 'following', label: '待跟进' },
  { key: 'all', label: '全部' },
]
