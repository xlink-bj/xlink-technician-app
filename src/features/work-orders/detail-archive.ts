import type { QuotationOrderBrowseItem, ReadPage, WorkOrderDetail } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

export type DetailReadView = 'home' | 'follow-up' | 'customer' | 'quotation' | 'appointment'
export function detailReadView(value: unknown): DetailReadView {
  return value === 'follow-up' || value === 'customer' || value === 'quotation' || value === 'appointment' ? value : 'home'
}

export function detailReadTitle(view: DetailReadView, selectedOrder = false): string {
  if (view === 'appointment') return '预约信息'
  if (view === 'quotation') return selectedOrder ? '订单详情' : '订单'
  if (view === 'customer') return '客户资料'
  if (view === 'follow-up') return '跟进记录'
  return '工单详情'
}

/** Only the verified Order source is registered here. A form title or service
 * number never creates a customer-deliverable category or document permission. */
export interface OrderArchiveSummary {
  readonly kind: 'order'
  readonly title: '正式订单'
  readonly items: readonly QuotationOrderBrowseItem[]
  readonly complete: boolean
  readonly total?: number
}
export function orderArchiveSummary(page: ReadPage<QuotationOrderBrowseItem> | null): OrderArchiveSummary {
  const rows = page?.items ?? []
  const total = page?.totalCount
  const complete = page?.page === 1 && typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 && total === rows.length
  // Order.updateTime is record time, NOT PDF version time. Missing/invalid
  // times retain the API's createTime-desc order, with source index as tie-break.
  const timestamp = (value?: string) => value && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(value)
    ? Date.parse(value.replace(' ', 'T')) : NaN
  const items = rows.map((item, index) => ({ item, index, time: timestamp(item.updateTime) }))
    .sort((a, b) => Number.isFinite(a.time) && Number.isFinite(b.time) ? b.time - a.time || a.index - b.index
      : Number.isFinite(a.time) ? -1 : Number.isFinite(b.time) ? 1 : a.index - b.index)
    .map(row => row.item)
  return { kind: 'order', title: '正式订单', items, complete, total: complete ? total : undefined }
}

/** Displays only the verified construction state of this individual Order. */
export function childOrderConstructionProgress(
  workOrderId: string,
  order: Pick<QuotationOrderBrowseItem, 'id' | 'serviceAppointmentId' | 'state' | 'processState'> & { readonly type: number },
): string {
  const unconfirmed = '暂不可确认'
  if (![workOrderId, order.id].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id))
    || order.serviceAppointmentId !== workOrderId || order.type !== 1 || order.state !== 1) {
    return unconfirmed
  }
  switch (order.processState) {
    case 1: return '待开工'
    case 2: return '已开工'
    case 3: return '已完工'
    default: return unconfirmed
  }
}

export function followUpReadMessage(detail: WorkOrderDetail): string {
  switch (detail.activityReadState) {
    case 'succeeded': return detail.activities?.length ? '' : '暂无跟进记录'
    case 'denied': return '当前账号无权读取跟进记录'
    case 'failed': return '跟进记录读取失败，请重新读取工单'
    case 'unavailable': return '跟进记录暂不可读取'
    default: return detail.activities?.length ? '' : '跟进记录尚未核验'
  }
}

export function detailReadRoute(id: string, view: DetailReadView, orderId?: string): string {
  return `/pages/work-orders/detail?id=${encodeURIComponent(id)}&read=${view}${orderId ? `&order=${encodeURIComponent(orderId)}` : ''}`
}

const serviceResultArchiveKinds = ['acceptance', 'warranty'] as const
export type ServiceResultArchiveKind = typeof serviceResultArchiveKinds[number]

export interface ServiceResultArchiveRecord {
  readonly kind: ServiceResultArchiveKind
  readonly workOrderId: string
  readonly id: string
  readonly summary: string
  readonly details?: readonly { readonly label: string; readonly value: string }[]
}

/** Candidate input for an object-specific reader. actorScope binds the read to
 * the active role/session; it does not grant access. The reader must prove that
 * the record is the formal result or issued card for this work order. Only a
 * complete, authorized read can return a successful null. */
export interface ScopedServiceResultArchiveRead {
  readonly workOrderId: string
  readonly actorScope: string
  readonly result: OperationSnapshot<ServiceResultArchiveRecord | null>
}

export type ServiceResultArchiveReads = Readonly<Partial<Record<ServiceResultArchiveKind, ScopedServiceResultArchiveRead>>>

export interface ServiceResultArchiveCard {
  readonly kind: ServiceResultArchiveKind
  readonly title: string
  readonly state: 'present' | 'empty' | 'denied' | 'failed' | 'loading'
  readonly text: string
  readonly record?: Pick<ServiceResultArchiveRecord, 'id' | 'details'>
}

const serviceResultArchiveCopy = {
  acceptance: { title: '正式验收结果', empty: '暂无正式验收结果' },
  warranty: { title: '已发质保卡', empty: '暂无已发质保卡' },
} as const

/**
 * The ordinary detail page has no proven reader for these archives. Without
 * active, matching read evidence the candidate contributes no archive card.
 */
export function serviceResultArchiveCards(
  workOrderId: string,
  actorScope: string | null | undefined,
  reads: ServiceResultArchiveReads | undefined,
): readonly ServiceResultArchiveCard[] {
  if (!workOrderId || !actorScope || !reads) return []
  return serviceResultArchiveKinds.flatMap((kind): ServiceResultArchiveCard[] => {
    const read = reads[kind]
    if (read?.workOrderId !== workOrderId || read.actorScope !== actorScope) return []
    const { title, empty } = serviceResultArchiveCopy[kind]
    const { state, data, error } = read.result
    const card = (state: ServiceResultArchiveCard['state'], text: string) => [{ kind, title, state, text }]

    if (state === 'idle' || error?.category === 'cancelled' || error?.category === 'unsupported_capability') return []
    if (error?.category === 'authorization_denied' || error?.category === 'session_invalid') {
      return card('denied', `当前账号无权查看${title}`)
    }
    if (state === 'loading') return card('loading', `正在读取${title}…`)
    if (state === 'succeeded' && !error) {
      if (data === null) return card('empty', empty)
      if (data?.workOrderId === workOrderId && data.kind === kind
        && typeof data.id === 'string' && data.id.trim()
        && typeof data.summary === 'string' && data.summary.trim()) {
        return [{ kind, title, state: 'present', text: data.summary, record: { id: data.id, details: data.details } }]
      }
    }
    return card('failed', `${title}读取失败`)
  })
}
