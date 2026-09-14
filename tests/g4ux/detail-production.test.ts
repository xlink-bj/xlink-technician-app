import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { buildDetailProgressWindow, detailLayoutFor } from '@features/work-orders/detail-layout'
import type { WorkOrderDetail } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const detailPage = readFileSync(new URL('../../src/pages/work-orders/detail.vue', import.meta.url), 'utf8')
const detailLayout = readFileSync(new URL('../../src/features/work-orders/detail-layout.ts', import.meta.url), 'utf8')

describe('G4-C production detail baseline', () => {
  it('uses the R2-shaped summary and keeps quick actions outside read-only tabs', () => {
    expect(detailPage).toContain('class="summary-card"')
    expect(detailPage).toContain('class="summary-actions"')
    expect(detailPage).toContain('class="part-badge"')
    expect(detailPage).not.toContain('class="summary-mark"')
    expect(detailPage).not.toContain('class="summary-status"')
    expect(detailPage).not.toContain('class="location-icon"')
    expect(detailPage).toContain('流程状态')
    expect(detailPage).toContain('当前任务')
    expect(detailPage).toContain('任务上下文')
    expect(detailPage).toContain('class="information-card"')
    expect(detailPage.indexOf('class="summary-actions"')).toBeLessThan(
      detailPage.indexOf('class="information-card"'),
    )
    expect(detailPage).toContain('class="information-card"')
    expect(detailPage).toContain("label: '联系'")
    expect(detailPage).toContain("label: '资料'")
    expect(detailPage).toContain("label: '跟进'")
    expect(detailPage).toContain('导航')
    expect(detailPage).toContain('detailTabs')
    expect(detailLayout).toContain("{ key: 'follow-up', label: '跟进记录' }")
    expect(detailLayout).toContain("{ key: 'customer', label: '客户信息' }")
    expect(detailLayout).toContain("{ key: 'order', label: '订单信息' }")
    expect(detailLayout).toContain("{ key: 'files', label: '资料' }")
  })

  it('renders only normalized detail states and does not expose raw adapter errors', () => {
    expect(detailPage).toContain("workOrder.loadState === 'loading'")
    expect(detailPage).toContain('v-if="showLoadingSkeleton"')
    expect(detailPage).toContain('const loadingSkeletonDelayMs = 240')
    expect(detailPage).toContain('detail-loading-state')
    expect(detailPage).toContain('skeleton-summary')
    expect(detailPage).toContain('skeleton-progress')
    expect(detailPage).toContain('skeleton-information')
    expect(detailPage).not.toContain('<text class="state-title">正在加载工单详情</text>')
    expect(detailPage).toContain("workOrder.loadState === 'failed_retryable'")
    expect(detailPage).toContain("workOrder.loadState === 'failed_terminal'")
    expect(detailPage).toContain("workOrder.loadState === 'succeeded' && detail")
    expect(detailPage).not.toContain('workOrder.error?.message')
    expect(detailPage).not.toContain('nodeDef')
    expect(detailPage).not.toContain('workflowNode')
    expect(detailPage).not.toContain('appointment')
  })

  it('keeps workflow and appointment execution outside the D1 page', () => {
    expect(detailPage).toContain('当前动作将在对应业务能力核验后开放')
    expect(detailPage).toContain('查看能力将在对应业务数据接入后开放')
    expect(detailPage).not.toContain('完成当前任务')
    expect(detailPage).not.toContain('提交预约')
  })

  it('provides deterministic mock layout data for each visual detail block', () => {
    const detail: WorkOrderDetail = {
      id: asOpaqueId<'WorkOrderId'>('mock-work-order-001'),
      displayNumber: '09077',
      customerName: '演示客户甲',
    }
    const layout = detailLayoutFor(detail)

    expect(layout.progressSteps.map((step) => step.label)).toEqual(['勘察完成', '下单中', '分派工队'])
    expect(layout.progressPosition).toBe('第 6 / 10 步')
    expect(layout.currentTask?.label).toBe('待签约')
    expect(layout.taskContext?.title).toBe('报价已确认')
    expect(layout.followUps).toHaveLength(2)

    const realDetail: WorkOrderDetail = {
      id: asOpaqueId<'WorkOrderId'>('real-work-order-001'),
      displayNumber: '12345',
    }
    expect(detailLayoutFor(realDetail)).toEqual({
      progressSteps: [],
      progressPosition: '',
      currentTask: null,
      taskContext: null,
      followUps: [],
    })
  })

  it('keeps only the immediate workflow neighbours at the first and last steps', () => {
    expect(buildDetailProgressWindow(1).progressSteps.map((step) => step.label)).toEqual([
      '建单中',
      '分派技术工程师',
    ])
    expect(buildDetailProgressWindow(10).progressSteps.map((step) => step.label)).toEqual([
      '服务完成',
      '评价中',
    ])
  })
})
