import { projectR1PresetStorage } from './r1-field-storage'
import { hasNonStringAppointmentNeed, appointmentNeedReselectionMessage } from '@shared/form/appointment-need'
import { appointmentBusinessKeys, appointmentReplacementProblem, appointmentNullBusinessKey } from '@shared/form/appointment-replacement-context'
/**
 * Pure, source-backed R1 business command wire encoders.
 *
 * No network I/O, no workflow orchestration, no permission decisions.
 * The Adapter owns dispatch/response normalization; the Action Workspace
 * owns form state, saved FormData eligibility and Workflow Complete timing.
 *
 * Distinct stages must remain distinct: FormData upsert/saveOnly != workflow/process.
 * Availability and permission decisions remain in the Workspace and transport.
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
import { isMockOwnedCommand } from './mock/ownership'
import type { ApiCommandRequest } from './technician-api-commands'

const surveyReservedValueKeys = new Set([
  '_id', 'id', 'dataId', 'formDataId', 'extId', 'formDefId', 'definitionId',
  'sid', 'smodule', 'nodeId', 'workflowId', 'workflowNodeId', 'workflowRunId', 'runId',
  'tenantId', 'userId', 'roleId', 'state', 'externalSid',
  'createTime', 'createDateTime', 'createUser', 'createUserName',
  'updateTime', 'updateDateTime', 'updateUser', 'updateUserName',
  'orgId', 'orgName', 'optId', 'optName', 'belongTo', 'etags', 'isSettle',
  '_version', 'version', 'revision', '_class',
  'exts', 'dataStr', 'raw', 'rawData', 'rawBody', 'body', 'jsonBody',
  '__proto__', 'prototype', 'constructor', 'toJSON',
])

interface SurveyCreateIntent {
  readonly hasFormDataId: boolean
  readonly reservedKey?: string
  readonly hasValueAccessors: boolean
}

function assertSurveyCreateOnly(
  intent: SurveyCreateIntent | undefined,
  scope: Readonly<Record<string, unknown>>,
  request: ApiCommandRequest,
  generatedExtsJson?: string,
): void {
  if (!intent) return
  // The existing synthetic route policy never permits real-network fall-through,
  // even with Mock disabled. Its Map-backed edit regression is not typed R1 proof.
  if (isMockOwnedCommand(request.path, request.body)) return
  // R1 reconstructs and saves a fresh typed Survey, without a preservation/CAS
  // contract. Even a full API snapshot loses BSON Date precision. Never strip an
  // existing ID to turn a rejected replacement into a duplicate create.
  if (intent.hasFormDataId) {
    throw new AdapterMappingError('Typed Survey replacement is unsupported; only a new record without formDataId can be saved')
  }
  if (intent.reservedKey) throw new AdapterMappingError(`Survey create values cannot include reserved metadata: ${intent.reservedKey}`)
  if (intent.hasValueAccessors) throw new AdapterMappingError('Survey create values cannot use runtime accessors')
  // Check the immutable serialized body too: runtime getters/toJSON may change
  // the caller object after the original identity/key presence was captured.
  const serialized = request.body?.dataStr
  const data = typeof serialized === 'string' ? JSON.parse(serialized) : undefined
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).some(key => surveyReservedValueKeys.has(key) && !Object.hasOwn(scope, key)
      && !(key === 'exts' && generatedExtsJson !== undefined))
    || (generatedExtsJson !== undefined && JSON.stringify(data.exts) !== generatedExtsJson)
    || Object.entries(scope).some(([key, value]) => data[key] !== value)) {
    throw new AdapterMappingError('Serialized Survey create identity or metadata does not match its command scope')
  }
}

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
): ApiCommandRequest {
  // Snapshot intent before field getters or toJSON can delete an ID/key or
  // change purpose. No late check may reinterpret a Survey edit as a create.
  const hasFormDataId = 'formDataId' in input
  const purpose = input.purpose
  const values = input.values
  const descriptors = purpose === 'survey' ? Object.getOwnPropertyDescriptors(values) : undefined
  const surveyIntent: SurveyCreateIntent | undefined = descriptors ? {
    hasFormDataId,
    reservedKey: Object.keys(descriptors).find(key => surveyReservedValueKeys.has(key)),
    hasValueAccessors: Object.values(descriptors).some(descriptor => descriptor.get || descriptor.set),
  } : undefined
  const path = `biz/extForm/upsert/${encodeURIComponent(String(input.definitionId))}`
  if (purpose === 'appointment') {
    if (hasNonStringAppointmentNeed(input.values.need)) throw new AdapterMappingError(appointmentNeedReselectionMessage)
    const problem = appointmentReplacementProblem({ ...input, dataId: input.formDataId }, true)
      ?? (appointmentNullBusinessKey(input.values) ? 'Null appointment business values are unsupported' : undefined)
    if (problem) throw new AdapterMappingError(problem)
    if (Object.keys(input.values).some(key => !appointmentBusinessKeys.some(allowed => allowed === key))) throw new AdapterMappingError('Unknown appointment business value cannot enter replacement')
  }
  const workflowRunId = input.workflowRunId
  const scope = {
    sid: input.workOrderId,
    smodule: 'serviceAppointment',
    nodeId: input.workflowNodeId,
    ...(workflowRunId ? { workflowId: workflowRunId } : {}),
    state: 1,
  }
  const mappedValues = mapDynamicValues(values, purpose)
  const storedValues = purpose === 'survey' ? projectR1PresetStorage({}, mappedValues, input.fieldStorage) : mappedValues
  const generatedExtsJson = purpose === 'survey' && Object.hasOwn(storedValues, 'exts') ? JSON.stringify(storedValues.exts) : undefined
  const data = {
    ...storedValues,
    ...(purpose === 'appointment' ? input.appointmentReplacement?.metadata : {}),
    ...scope,
    ...(input.formDataId ? { _id: input.formDataId } : {}),
  }
  const request: ApiCommandRequest = {
    method: 'POST',
    path,
    body: { dataStr: JSON.stringify(data) },
  }
  assertSurveyCreateOnly(surveyIntent, scope, request, generatedExtsJson)
  return request
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
