import { describe, expect, it } from 'vitest'
import { detailReadRoute, detailReadTitle, detailReadView, followUpReadMessage, orderArchiveSummary } from '@features/work-orders/detail-archive'
import { workOrderActivities } from '@adapters/api/read-models/work-order-activity'
import type { QuotationOrderBrowseItem, WorkOrderDetail } from '@shared/ports'

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
