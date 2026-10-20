/**
 * Pure, source-backed R1 business command wire encoders.
 *
 * No network I/O, no workflow orchestration, no permission decisions.
 * The Adapter owns dispatch/response normalization; the Action Workspace
 * owns form state, saved FormData eligibility and Workflow Complete timing.
 *
 * Distinct stages must remain distinct: FormData upsert/saveOnly != workflow/process.
 * Never silently grant deferred visit write authorization.
 */
import type {
  AcceptOrderInput,
  CompleteWorkflowNodeInput,
  FormFieldValue,
  FormPurpose,
  SaveDynamicFormInput,
} from '@shared/ports'
import { isMediaValueRef } from '@shared/types'
import { AdapterMappingError } from '../common/operations'
import { surveyMediaValueCodec } from './survey-form-codec'
import type { ApiCommandRequest } from './technician-api-commands'

function mapDynamicValue(value: unknown, valueKey: string, purpose?: FormPurpose): unknown {
  if (purpose === 'survey') {
    return surveyMediaValueCodec.encode(value as FormFieldValue, { valueKey })
  }
  if (isMediaValueRef(value) || (Array.isArray(value) && value.some(isMediaValueRef))) {
    throw new AdapterMappingError(`A verified form media codec is required for ${valueKey}`)
  }
  return value
}

function mapDynamicValues(
  values: Readonly<Record<string, unknown>>,
  purpose?: FormPurpose,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, mapDynamicValue(value, key, purpose)]))
}

export function formDataUpsertCommand(
  input: SaveDynamicFormInput,
  safety?: ApiCommandRequest['safety'],
): ApiCommandRequest {
  const data = {
    ...mapDynamicValues(input.values, input.purpose),
    sid: input.workOrderId,
    smodule: 'serviceAppointment',
    nodeId: input.workflowNodeId,
    ...(input.workflowRunId ? { workflowId: input.workflowRunId } : {}),
    ...(input.formDataId ? { _id: input.formDataId } : {}),
    state: 1,
  }
  return {
    method: 'POST',
    path: `biz/extForm/upsert/${encodeURIComponent(String(input.definitionId))}`,
    body: { dataStr: JSON.stringify(data) },
    ...(safety ? { safety } : {}),
  }
}

export function workflowCompleteCommand(input: CompleteWorkflowNodeInput): ApiCommandRequest {
  return {
    method: 'POST',
    path: 'workflow/process',
    body: {
      workflowNodeId: input.workflowNodeId,
      nodeFormDefId: input.definitionId,
      nodeFormDataId: input.formDataId,
      smodule: 'serviceAppointment',
      sid: input.workOrderId,
    },
  }
}

export function workflowAcceptCommand(input: AcceptOrderInput): ApiCommandRequest {
  return {
    method: 'POST',
    path: 'workflow/process',
    body: {
      sid: input.workOrderId,
      workflowNodeId: input.workflowNodeId,
      smodule: 'serviceAppointment',
    },
  }
}
