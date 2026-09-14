import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { detailTabs } from '@features/work-orders/detail-tabs'

const detailPage = readFileSync(new URL('../../src/pages/work-orders/detail.vue', import.meta.url), 'utf8')
const detailTabsSource = readFileSync(new URL('../../src/features/work-orders/detail-tabs.ts', import.meta.url), 'utf8')

describe('G4-UX detail D3 semantic boundary', () => {
  it('keeps the accepted summary, quick-action shell, and read-only tabs', () => {
    expect(detailPage).toContain('class="summary-card"')
    expect(detailPage).toContain('class="summary-actions"')
    expect(detailPage).toContain('class="part-badge"')
    expect(detailPage).not.toContain('class="summary-mark"')
    expect(detailPage).not.toContain('class="summary-status"')
    expect(detailPage).not.toContain('class="location-icon"')
    expect(detailPage).toContain('class="information-card"')
    expect(detailPage.indexOf('class="summary-actions"')).toBeLessThan(
      detailPage.indexOf('class="information-card"'),
    )
    expect(detailPage).toContain("label: '联系'")
    expect(detailPage).toContain("label: '资料'")
    expect(detailPage).toContain("label: '跟进'")
    expect(detailPage).toContain('导航')
    expect(detailPage).toContain('detailTabs')
    expect(detailTabs).toEqual([
      { key: 'follow-up', label: '跟进记录' },
      { key: 'customer', label: '客户信息' },
      { key: 'order', label: '订单信息' },
      { key: 'files', label: '资料' },
    ])
    expect(detailTabsSource).toContain('Read-only tabs are navigation structure')
  })

  it('renders optional normalized fields without inventing a customer value', () => {
    expect(detailPage).toContain('v-if="detail.customerName || detail.servicePartLabel"')
    expect(detailPage).toContain('v-if="detail.customerName" class="summary-customer"')
    expect(detailPage).not.toContain("|| '工单客户'")
    expect(detailPage).not.toContain('工单客户')
    expect(detailPage).toContain('v-if="detail.serviceDistrict || detail.serviceAddress || detail.distanceText"')
  })

  it('renders only a valid read-only current-task projection and keeps deferred blocks collapsed', () => {
    expect(detailPage).not.toContain('class="progress-card"')
    expect(detailPage).toContain('class="current-task-card"')
    expect(detailPage).toContain('detailWorkflowUiProjectionFor')
    expect(detailPage).toContain('workflowProjection.currentTask')
    expect(detailPage).toContain('current-task-card--${workflowProjection.currentTask.tone}')
    expect(detailPage).toContain('workflowProjection.currentTask.actionLabel')
    expect(detailPage).not.toContain('detail.currentTask')
    expect(detailPage).not.toContain('class="follow-up-list"')
    expect(detailPage).not.toContain('TECHNICIAN_WORKFLOW_TEMPLATE')
    expect(detailPage).not.toContain('detailLayoutFor')
    expect(detailPage).not.toContain('任务上下文')
    expect(detailPage).not.toContain('taskContext')
    expect(detailPage).toContain('activities.length > 0')
    expect(detailPage).toContain('class="activity-item"')
    expect(detailPage).toContain("activity.badge !== '系统'")
    expect(detailPage).toContain('暂无跟进记录')
  })

  it('keeps loading/error states normalized and workflow execution out of D2', () => {
    expect(detailPage).toContain("workOrder.loadState === 'loading'")
    expect(detailPage).toContain('v-if="showLoadingSkeleton"')
    expect(detailPage).toContain('const loadingSkeletonDelayMs = 240')
    expect(detailPage).toContain('detail-loading-state')
    expect(detailPage).toContain('skeleton-summary')
    expect(detailPage).toContain('skeleton-task')
    expect(detailPage).toContain('skeleton-information')
    expect(detailPage).not.toContain('skeleton-progress')
    expect(detailPage).not.toContain('<text class="state-title">正在加载工单详情</text>')
    expect(detailPage).toContain("workOrder.loadState === 'failed_retryable'")
    expect(detailPage).toContain("workOrder.loadState === 'failed_terminal'")
    expect(detailPage).not.toContain('workOrder.error?.message')
    expect(detailPage).not.toContain('nodeDef')
    expect(detailPage).not.toContain('workflowNode')
    expect(detailPage).not.toContain('appointment')
    expect(detailPage).not.toContain('完成当前任务')
    expect(detailPage).not.toContain('提交预约')
    expect(detailPage).toContain('disabled')
  })

  it('contains no mock-id business branch in the page or feature layer', () => {
    expect(detailPage).not.toContain('mock-work-order-')
    expect(detailPage).not.toContain('mockLayoutById')
    expect(detailPage).not.toContain('progressPosition')
  })
})
