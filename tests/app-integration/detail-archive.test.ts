import { describe, expect, it } from 'vitest'
import { childOrderConstructionProgress, detailReadRoute, detailReadTitle, detailReadView, followUpReadMessage, orderArchiveSummary, serviceResultArchiveCards, type ScopedServiceResultArchiveRead, type ServiceResultArchiveReads } from '@features/work-orders/detail-archive'
import { workOrderActivities } from '@adapters/api/read-models/work-order-activity'
import type { QuotationOrderBrowseItem, WorkOrderDetail } from '@shared/ports'
import { createOperationError } from '@shared/types'

const order = (id: string, updateTime?: string): QuotationOrderBrowseItem => ({
  id, type: 1, serviceAppointmentId: 'work', updateTime, groups: [], contentSupported: true, pdfState: 'present_no_access',
})
describe('verified detail archive projection', () => {
  it('names only existing read views without creating Contract or Warranty pages', () => {
    expect(detailReadTitle('home')).toBe('工单详情')
    expect(detailReadTitle('quotation')).toBe('订单')
    expect(detailReadTitle('quotation', true)).toBe('订单详情')
    expect(detailReadTitle('customer')).toBe('客户资料')
    expect(detailReadTitle('follow-up')).toBe('跟进记录')
    expect(detailReadTitle(detailReadView('contract'))).toBe('工单详情')
    expect(detailReadTitle(detailReadView('warranty'))).toBe('工单详情')
  })
  it('requires explicit first-page total evidence for zero, one and multiple records', () => {
    for (const items of [[], [order('a')], [order('a'), order('b'), order('c')]]) {
      expect(orderArchiveSummary({ items, page: 1, totalCount: items.length })).toMatchObject({ complete: true, total: items.length })
      expect(orderArchiveSummary({ items })).toMatchObject({ complete: false, total: undefined })
    }
    expect(orderArchiveSummary({ items: [order('a')], page: 1, totalCount: 7 }).complete).toBe(false)
    expect(orderArchiveSummary({ items: [], page: 2, totalCount: 0 }).complete).toBe(false)
  })
  it('orders by record update time with stable source-order fallback, never generates times', () => {
    const items = [order('missing'), order('old', '2026-11-13 10:00:00'), order('new', '2026-11-15T10:00:00Z'), order('invalid', 'not-a-date'), order('missing-2')]
    expect(orderArchiveSummary({ items }).items.map(row => row.id)).toEqual(['new', 'old', 'missing', 'invalid', 'missing-2'])
    expect(items[0]?.updateTime).toBeUndefined()
  })
  it('keeps process-record errors, permission, unavailable and unknown separate from empty', () => {
    const detail = { id: 'work' } as WorkOrderDetail
    expect(followUpReadMessage({ ...detail, activityReadState: 'succeeded', activities: [] })).toBe('暂无跟进记录')
    expect(followUpReadMessage({ ...detail, activityReadState: 'failed' })).toContain('失败')
    expect(followUpReadMessage({ ...detail, activityReadState: 'denied' })).toContain('无权')
    expect(followUpReadMessage({ ...detail, activityReadState: 'unavailable' })).toContain('暂不可')
    expect(followUpReadMessage(detail)).toContain('尚未核验')
    expect(() => workOrderActivities({ status: 0, data: [] })).toThrow()
    expect(() => workOrderActivities({ data: 'invalid' })).toThrow()
    expect(workOrderActivities({ status: 1, data: [] })).toEqual([])
  })
  it('limits read views and encodes identities without creating a write route', () => {
    expect(detailReadView('follow-up')).toBe('follow-up')
    expect(detailReadView('submit')).toBe('home')
    expect(detailReadRoute('work &1', 'quotation', 'order/1')).toBe('/pages/work-orders/detail?id=work%20%261&read=quotation&order=order%2F1')
  })
})

describe('individual Order construction progress', () => {
  const activeOrder = { ...order('order-1'), state: 1, processState: 2 }

  it.each([
    [1, '待开工'],
    [2, '已开工'],
    [3, '已完工'],
  ] as const)('maps verified process state %s for the matching active Order', (processState, label) => {
    expect(childOrderConstructionProgress('work', { ...activeOrder, processState })).toBe(label)
  })

  it.each([
    ['blank Order ID', 'work', { id: '' }],
    ['invalid Order ID', 'work', { id: 'order/1' }],
    ['invalid Work Order ID', 'work 1', { serviceAppointmentId: 'work 1' }],
    ['foreign Work Order', 'work', { serviceAppointmentId: 'other-work' }],
    ['quotation', 'work', { type: 0 }],
    ['inactive Order', 'work', { state: -1 }],
    ['missing Order state', 'work', { state: undefined }],
  ] as const)('keeps progress unconfirmed for %s', (_case, workOrderId, changes) => {
    expect(childOrderConstructionProgress(workOrderId, { ...activeOrder, ...changes })).toBe('暂不可确认')
  })

  it('keeps unknown and out-of-scope process states unconfirmed', () => {
    for (const processState of [undefined, -2, -1, 0, 4, 99, 2.5, Number.NaN]) {
      expect(childOrderConstructionProgress('work', { ...activeOrder, processState })).toBe('暂不可确认')
    }
  })
})

describe('candidate service result archives', () => {
  const scope = 'session-role-scope'
  const record = { kind: 'acceptance', workOrderId: 'work', id: 'acceptance-1', summary: '已核对维修范围及现场施工结果。' } as const
  const read = (result: ScopedServiceResultArchiveRead['result']): ScopedServiceResultArchiveRead =>
    ({ workOrderId: 'work', actorScope: scope, result })
  const accepted = read({ state: 'succeeded', data: record })
  const empty = read({ state: 'succeeded', data: null })
  const cards = (reads: ServiceResultArchiveReads | undefined, workOrderId = 'work', actorScope = scope) =>
    serviceResultArchiveCards(workOrderId, actorScope, reads)

  it('shows independent objects in one work order and keeps successful empty explicit', () => {
    expect(cards({ acceptance: accepted, warranty: empty })).toEqual([
      { kind: 'acceptance', title: '正式验收结果', state: 'present', text: record.summary, record: { id: record.id } },
      { kind: 'warranty', title: '已发质保卡', state: 'empty', text: '暂无已发质保卡' },
    ])
    const issued = read({ state: 'succeeded', data: { ...record, kind: 'warranty', id: 'card-1', summary: '质保卡已发放。' } })
    expect(cards({ warranty: issued })).toEqual([
      { kind: 'warranty', title: '已发质保卡', state: 'present', text: '质保卡已发放。', record: { id: 'card-1' } },
    ])
  })

  it('keeps missing evidence and stale work order or actor scope out of the archive', () => {
    expect(cards(undefined)).toEqual([])
    expect(cards({ acceptance: accepted }, 'other-work')).toEqual([])
    expect(cards({ acceptance: accepted }, 'work', 'other-role')).toEqual([])
    expect(serviceResultArchiveCards('work', null, { acceptance: accepted })).toEqual([])
    expect(cards({ acceptance: read({ state: 'idle' }) })).toEqual([])
    expect(cards({ acceptance: read({ state: 'failed_terminal', error: createOperationError('unsupported_capability', 'no mapping') }) })).toEqual([])
  })

  it('does not disclose previous data on denial, invalid session, or read failure', () => {
    for (const category of ['authorization_denied', 'session_invalid', 'server_terminal', 'network_retryable'] as const) {
      const state = category === 'network_retryable' ? 'failed_retryable' : 'failed_terminal'
      const error = createOperationError(category, 'raw server detail')
      const denied = category === 'authorization_denied' || category === 'session_invalid'
      expect(cards({ acceptance: read({ state, error, data: record }), warranty: empty })).toEqual([
        { kind: 'acceptance', title: '正式验收结果', state: denied ? 'denied' : 'failed',
          text: denied ? '当前账号无权查看正式验收结果' : '正式验收结果读取失败' },
        { kind: 'warranty', title: '已发质保卡', state: 'empty', text: '暂无已发质保卡' },
      ])
    }
  })

  it('fails closed for missing or contradictory success data and hides stale loading content', () => {
    for (const data of [undefined, { ...record, kind: 'warranty' as const }, { ...record, workOrderId: 'other-work' }, { ...record, id: '' }, { ...record, summary: ' ' }]) {
      expect(cards({ acceptance: read({ state: 'succeeded', data }) })[0]).toMatchObject({ state: 'failed', text: '正式验收结果读取失败' })
    }
    expect(cards({ acceptance: read({ state: 'loading', data: record }) })[0]).toMatchObject({ state: 'loading', text: '正在读取正式验收结果…' })
  })
})
