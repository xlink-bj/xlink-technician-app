import { isBusinessMockMode } from './config'
import { mockCommandScenarioIds } from './fixtures'
import { mockCommandState } from './command-state'
import { normalSurveyMockAppointment, normalSurveyMockNode } from './normal-survey-read'

/** Product-preview calendar only, explicitly synthetic. No new R1 calendar fields/API. */
export function workbenchDemoEnabled(): boolean {
  return import.meta.env.DEV === true && import.meta.env.VITE_XLINK_ENVIRONMENT === 'dev'
    && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true' && isBusinessMockMode() === 'data'
}
export function workbenchDemo() {
  if (!workbenchDemoEnabled()) return null
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { date, appointments: [
    { id: mockCommandScenarioIds.surveySuccess, nodeId: 'mock-workflow-node-017-inspection', time: '10:00', title: '防水维修 · 现场勘察', instruction: '核对渗漏部位，补充现场勘察记录' },
    { id: 'mock-work-order-002', nodeId: 'mock-workflow-node-002-current', time: '14:00', title: '防水交付 · 验收回款', instruction: '查看施工日志，核对交付进度与当前事项' },
  ], completedIds: [] }
}
type DemoDetail = { serviceAppointment: Record<string, unknown>; workflowNode: Record<string, unknown>[] }
function currentDetail(id: string): DemoDetail | undefined {
  return (mockCommandState().detailResponses.get(id) as { data?: DemoDetail } | undefined)?.data
}
/** Keep the demo's ordinary list rows aligned with the existing mutable detail fixtures. */
export function withWorkbenchMockRows(response: unknown, sanode: boolean): unknown {
  if (!workbenchDemoEnabled() || !response || typeof response !== 'object') return response
  const envelope = response as Record<string, unknown>
  if (!Array.isArray(envelope.data)) return response
  const normalReader = import.meta.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true'
  const survey = normalReader ? { serviceAppointment: normalSurveyMockAppointment, workflowNode: [normalSurveyMockNode] }
    : currentDetail(mockCommandScenarioIds.surveySuccess)
  const delivery = currentDetail('mock-work-order-002')
  const data = envelope.data.filter(item => (sanode ? item?.data?._id : item?._id) !== mockCommandScenarioIds.surveySuccess)
    .map(item => sanode && item?.data?._id === 'mock-work-order-002' && delivery?.workflowNode[0]
      ? { ...delivery.workflowNode[0], data: delivery.serviceAppointment } : item)
  if (survey) {
    const node = survey.workflowNode[0]
    const appointment: Record<string, unknown> = { ...survey.serviceAppointment, ...(node?.state === 0 ? { status: '105' } : {}) }
    data.push(sanode ? { ...node, data: appointment } : appointment)
  }
  return { ...envelope, data, total: data.length }
}

/** Known category label for the C1 survey row; never guess a production Code value. */
export const workbenchStatusOption = { value: '105', name: '待上门', _id: 'mock-status-code-105', type: 'STATUS', parentId: 'mock-status-type', order: 10 }
