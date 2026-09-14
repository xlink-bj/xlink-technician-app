import type { WorkOrderDetail } from '@shared/ports'

export type DetailProgressState = 'completed' | 'current' | 'pending'

export interface DetailProgressStep {
  readonly id: string
  readonly label: string
  readonly state: DetailProgressState
}

export interface DetailCurrentTask {
  readonly label: string
  readonly description: string
  readonly actionLabel: string
}

export interface DetailTaskContext {
  readonly statusLabel: string
  readonly title: string
  readonly description: string
  readonly mediaCount: number
  readonly actionLabel: string
}

export interface DetailFollowUpRecord {
  readonly id: string
  readonly tone: 'orange' | 'blue' | 'green'
  readonly label: string
  readonly title: string
  readonly timestamp: string
}

export type DetailTabKey = 'follow-up' | 'customer' | 'order' | 'files'

export interface DetailTab {
  readonly key: DetailTabKey
  readonly label: string
}

export interface WorkOrderDetailLayout {
  readonly progressSteps: readonly DetailProgressStep[]
  readonly progressPosition: string
  readonly currentTask: DetailCurrentTask | null
  readonly taskContext: DetailTaskContext | null
  readonly followUps: readonly DetailFollowUpRecord[]
}

const TECHNICIAN_WORKFLOW_TEMPLATE = [
  '建单',
  '分派技术工程师',
  '技术工程师接单',
  '预约',
  '勘察',
  '下单',
  '分派工队',
  '工队接单',
  '服务',
  '评价',
] as const

function displayStepLabel(label: string, state: DetailProgressState): string {
  if (state === 'completed') return label.endsWith('完成') ? label : `${label}完成`
  if (state === 'current') return label.endsWith('中') ? label : `${label}中`
  return label
}

function progressStep(
  label: string,
  index: number,
  state: DetailProgressState,
): DetailProgressStep {
  return {
    id: `mock-progress-${index + 1}`,
    label: displayStepLabel(label, state),
    state,
  }
}

/** R2 detail rule: render only the current node and its immediate neighbours. */
export function buildDetailProgressWindow(currentStep: number): Pick<
  WorkOrderDetailLayout,
  'progressSteps' | 'progressPosition'
> {
  if (!Number.isInteger(currentStep) || currentStep < 1 || currentStep > TECHNICIAN_WORKFLOW_TEMPLATE.length) {
    return { progressSteps: [], progressPosition: '' }
  }

  const currentIndex = currentStep - 1
  const progressSteps: DetailProgressStep[] = []
  if (currentIndex > 0) {
    progressSteps.push(progressStep(TECHNICIAN_WORKFLOW_TEMPLATE[currentIndex - 1], currentIndex - 1, 'completed'))
  }
  progressSteps.push(progressStep(TECHNICIAN_WORKFLOW_TEMPLATE[currentIndex], currentIndex, 'current'))
  if (currentIndex < TECHNICIAN_WORKFLOW_TEMPLATE.length - 1) {
    progressSteps.push(progressStep(TECHNICIAN_WORKFLOW_TEMPLATE[currentIndex + 1], currentIndex + 1, 'pending'))
  }

  return {
    progressSteps,
    progressPosition: `第 ${currentStep} / ${TECHNICIAN_WORKFLOW_TEMPLATE.length} 步`,
  }
}

export const detailTabs: readonly DetailTab[] = [
  { key: 'follow-up', label: '跟进记录' },
  { key: 'customer', label: '客户信息' },
  { key: 'order', label: '订单信息' },
  { key: 'files', label: '资料' },
]

const mockLayoutById: Readonly<Record<string, WorkOrderDetailLayout>> = {
  'mock-work-order-001': {
    ...buildDetailProgressWindow(6),
    currentTask: {
      label: '待签约',
      description: '客户已确认方案，请尽快推进签约。',
      actionLabel: '跟进签约',
    },
    taskContext: {
      statusLabel: '待签约',
      title: '报价已确认',
      description: '请推进正式签约与下单。',
      mediaCount: 2,
      actionLabel: '查看报价',
    },
    followUps: [
      {
        id: 'mock-follow-up-001',
        tone: 'orange',
        label: '勘察处理',
        title: '已完成现场勘察',
        timestamp: '2026-04-13 14:51',
      },
      {
        id: 'mock-follow-up-002',
        tone: 'blue',
        label: '预约处理',
        title: '已确认上门时间',
        timestamp: '2026-04-13 14:32',
      },
    ],
  },
  'mock-work-order-002': {
    ...buildDetailProgressWindow(8),
    currentTask: {
      label: '验收回款',
      description: '请确认服务结果并推进回款。',
      actionLabel: '处理验收',
    },
    taskContext: {
      statusLabel: '验收回款',
      title: '服务已完成',
      description: '请查看验收信息与订单资料。',
      mediaCount: 1,
      actionLabel: '查看订单',
    },
    followUps: [
      {
        id: 'mock-follow-up-003',
        tone: 'green',
        label: '服务完成',
        title: '已完成现场服务',
        timestamp: '2026-04-13 15:20',
      },
    ],
  },
  'mock-work-order-003': {
    ...buildDetailProgressWindow(2),
    currentTask: {
      label: '待接单',
      description: '当前工单等待技术人员接单。',
      actionLabel: '查看任务',
    },
    taskContext: null,
    followUps: [],
  },
}

const emptyDetailLayout: WorkOrderDetailLayout = {
  progressSteps: [],
  progressPosition: '',
  currentTask: null,
  taskContext: null,
  followUps: [],
}

/**
 * Visual-only detail layout fixture. It is intentionally keyed to synthetic
 * ids and never replaces the normalized API detail model for real reads.
 */
export function detailLayoutFor(detail: WorkOrderDetail): WorkOrderDetailLayout {
  return mockLayoutById[String(detail.id)] ?? emptyDetailLayout
}
