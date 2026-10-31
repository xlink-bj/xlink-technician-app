import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { mockSurveyQuoteSuggestionFor, verifiedSurveyPartLabel } from './mock-journey-quote-suggestion'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/survey-contract'
import { isDevMockJourneyEnabled, mockJourneyNodes, mockJourneyStage, mockJourneyWorkOrderId, type MockJourneyStage } from '@adapters/api/mock/journey'
import type { ActionDraftIdentity, ActionDraftRecord } from '@runtimes/action'
import type { OperationSnapshot } from '@shared/types'
import { asOpaqueId } from '@shared/types'
import type { MockJourneyContextLine, MockJourneyContextSection, MockJourneyContextSummary } from '@shared/types/mock-journey'
export type { MockJourneyContextLine, MockJourneyContextSection, MockJourneyContextSummary } from '@shared/types/mock-journey'
/** Identity-matched read supplied by the active Workspace, not a raw storage bypass. */
export type ReadPriorDraft = (
  identity: Omit<ActionDraftIdentity, 'version' | 'userId'>,
) => Promise<OperationSnapshot<ActionDraftRecord<Readonly<Record<string, unknown>>> | null>>

const appointmentFields = [
  { key: 'datetime', label: '预约时间' },
  { key: 'note', label: '预约备注' },
] as const
const surveyFields = [
  { key: 'squareMeter', label: '防水施工面积（㎡）' },
  { key: 'gapLength', label: '缝隙长度' },
  { key: 'length', label: '长（m）' },
  { key: 'width', label: '宽（m）' },
  { key: 'planeArea', label: '平面面积（㎡）' },
  { key: 'perimeter', label: '周长（m）' },
  { key: 'height', label: '立面高（m）' },
] as const

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().length ? value.trim().slice(0, 160) : null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function summarise(stage: 'appointment' | 'survey', values: Readonly<Record<string, unknown>>): readonly MockJourneyContextLine[] {
  const lines: MockJourneyContextLine[] = []
  if (stage === 'appointment') {
    const need = scalar(values.need)
    if (need === '1' || need === '0') {
      lines.push({ label: '上门安排', value: need === '1' ? '需要上门' : '暂不上门' })
    }
  } else {
    const part = values.part
    if (Array.isArray(part) && part.length) {
      // Original cascade IDs are never presented as readable place names.
      lines.push({ label: '维修部位', value: verifiedSurveyPartLabel(part) ?? `已选 ${part.length} 级（名称待核验）` })
    } else if (scalar(part)) {
      lines.push({ label: '维修部位', value: '已填写（原始编码保存在草稿）' })
    }
    const cause = values.leakageCause
    if (Array.isArray(cause) && cause.length) {
      lines.push({ label: '渗漏原因', value: `已选 ${cause.length} 项` })
    }
  }
  const fields = stage === 'appointment' ? appointmentFields : surveyFields
  for (const field of fields) {
    const value = scalar(values[field.key])
    if (value !== null) lines.push({ label: field.label, value })
  }
  return lines
}

async function readSection(
  stage: 'appointment' | 'survey',
  read: ReadPriorDraft,
): Promise<MockJourneyContextSection> {
  const identity: Omit<ActionDraftIdentity, 'version' | 'userId'> = {
    workOrderId: asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockJourneyNodes[stage]),
    actionIntent: stage === 'appointment' ? 'set_appointment' : 'interact_with_form',
    contentKind: 'dynamic_form',
    contentIdentity: stage === 'appointment' ? appointmentFormDefinitionWireId : mockSurveyFormDefinitionId,
  }
  const result = await read(identity)
  if (result.state !== 'succeeded') {
    return { stage, title: stage === 'appointment' ? '预约信息' : '勘察记录', updatedAt: null, state: 'read_failed', lines: [] }
  }
  const record = result.data
  if (!record || record.status !== 'unfinished') {
    return { stage, title: stage === 'appointment' ? '预约信息' : '勘察记录', updatedAt: null, state: 'not_recorded', lines: [] }
  }
  return {
    stage,
    title: stage === 'appointment' ? '预约信息' : '勘察记录',
    updatedAt: record.updatedAt,
    state: 'saved_local',
    lines: summarise(stage, record.values),
    ...(stage === 'survey' && mockSurveyQuoteSuggestionFor(record.values.part)
      ? { suggestion: mockSurveyQuoteSuggestionFor(record.values.part)! } : {}),
  }
}

/** Read existing, identity-scoped Action drafts; never overwrite, submit,
 * auto-fill quote line items, or manufacture a successful form completion. */
export async function readMockJourneyContext(
  currentStage: MockJourneyStage,
  read: ReadPriorDraft,
): Promise<MockJourneyContextSummary | null> {
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== currentStage || currentStage === 'appointment') return null
  const previous = currentStage === 'survey' ? ['appointment'] as const : ['appointment', 'survey'] as const
  const sections: MockJourneyContextSection[] = []
  for (const stage of previous) sections.push(await readSection(stage, read))
  const survey = sections.find((section) => section.stage === 'survey')
  return {
    workOrderId: mockJourneyWorkOrderId,
    sections,
    ...(currentStage === 'quotation' && survey?.suggestion ? { suggestion: survey.suggestion } : {}),
  }
}
