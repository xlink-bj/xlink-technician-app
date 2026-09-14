export type DetailTabKey = 'follow-up' | 'customer' | 'order' | 'files'

export interface DetailTab {
  readonly key: DetailTabKey
  readonly label: string
}

/** Read-only tabs are navigation structure, not a source of business truth. */
export const detailTabs: readonly DetailTab[] = [
  { key: 'follow-up', label: '跟进记录' },
  { key: 'customer', label: '客户信息' },
  { key: 'order', label: '订单信息' },
  { key: 'files', label: '资料' },
]
