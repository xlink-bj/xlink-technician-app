import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { tryMockCommand } from '@adapters/api/mock/router'
import { mockJourneyNodes, mockJourneyStage, mockJourneyWorkOrderId, mockJourneyWorkflowRunId } from '@adapters/api/mock/journey'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/survey-contract'

/** Exercise the actual synthetic upsert/Process pair in tests that need an
 * advanced stage as setup. No direct storage stage manipulation. */
export async function advanceMockJourneyForTest(stage: 'appointment' | 'survey'): Promise<string> {
  const definitionId = stage === 'appointment' ? appointmentFormDefinitionWireId : mockSurveyFormDefinitionId
  const workflowNodeId = mockJourneyNodes[stage]
  const result = await tryMockCommand(`biz/extForm/upsert/${definitionId}`, {
    dataStr: JSON.stringify({
      sid: mockJourneyWorkOrderId, smodule: 'serviceAppointment', nodeId: workflowNodeId,
      workflowId: mockJourneyWorkflowRunId, state: 1,
      ...(stage === 'appointment' ? { note: '合成预约已核对' } : { squareMeter: '18.5' }),
    }),
  }) as { data?: { _id?: string } } | null
  const id = result?.data?._id
  if (!id) throw new Error(`DEV Mock ${stage} FormData was not saved`)
  const processed = await tryMockCommand('workflow/process', {
    sid: mockJourneyWorkOrderId, smodule: 'serviceAppointment', workflowNodeId,
    nodeFormDefId: definitionId, nodeFormDataId: id,
  }) as { success?: boolean } | null
  if (processed?.success !== true) throw new Error(`DEV Mock ${stage} Workflow rejected`)
  return mockJourneyStage()
}

export async function reachMockQuotationForTest(): Promise<void> {
  if (await advanceMockJourneyForTest('appointment') !== 'survey'
    || await advanceMockJourneyForTest('survey') !== 'quotation') {
    throw new Error('Synthetic quotation is not reachable')
  }
}
