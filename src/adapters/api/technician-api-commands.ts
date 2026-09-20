import type {
  AcceptOrderInput,
  AcceptOrderInspection,
  AppointmentFormRead,
  CompleteWorkflowNodeInput,
  DynamicFormRead,
  FormDefinitionRead,
  FormFieldRead,
  ReadDynamicFormInput,
  SaveDynamicFormInput,
  SubmitAppointmentInput,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
} from '@shared/ports'
import { isSurveyMediaRef } from '@shared/types'
import type { FormDataId, FormDefinitionId, OperationSnapshot, SurveyMediaRef } from '@shared/types'

import { appointmentFormDefinitionWireId } from './appointment-contract'
import type { ApiRequestMethod, ApiRequestValue } from './technician-api'
import { AdapterMappingError, adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, nestedValue, optionalRecord, optionalString, requiredString, type AdapterRecord } from '../common/records'

export interface ApiCommandRequest {
  readonly method: Extract<ApiRequestMethod, 'POST'>
  readonly path: string
  readonly body?: Readonly<Record<string, ApiRequestValue>>
  /** Internal safety metadata; never serialized into the backend request. */
  readonly safety?: 'deferred_appointment_datetime_encoding_unknown'
}

export interface ApiCommandTransport {
  execute(request: ApiCommandRequest): Promise<unknown>
}

export class ApiCommandTransportError extends Error {
  constructor(
    message: string,
    readonly category:
      | 'session_invalid'
      | 'authorization_denied'
      | 'unsupported_capability'
      | 'network_retryable'
      | 'server_terminal',
  ) {
    super(message)
    this.name = 'ApiCommandTransportError'
  }
}

type CommandFailureCategory = ConstructorParameters<typeof ApiCommandTransportError>[1]

function commandResponseRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ApiCommandTransportError('Command response is malformed', 'server_terminal')
  }
  return raw as Record<string, unknown>
}

function responseText(record: Record<string, unknown>): string {
  return [record.code, record.errorCode, record.status, record.message, record.error]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .join(' ')
    .toLocaleLowerCase()
}

function commandFailureCategory(record: Record<string, unknown>): CommandFailureCategory {
  const text = responseText(record)
  const numericCode = Number(record.code ?? record.errorCode ?? record.status)
  if (numericCode === 401) return 'session_invalid'
  if (numericCode === 403) return 'authorization_denied'
  if (numericCode === 408 || numericCode === 429 || numericCode >= 500) return 'network_retryable'
  if (
    /session|token|login|auth|unauthor|expired|未登录|登录|会话|令牌/.test(text) &&
    !/retryable|temporary|timeout|超时|稍后/.test(text)
  ) {
    return 'session_invalid'
  }
  if (/forbidden|permission|denied|无权限|禁止/.test(text)) return 'authorization_denied'
  if (/retryable|temporary|timeout|temporarily|network|重试|稍后|超时/.test(text)) return 'network_retryable'
  return 'server_terminal'
}

/**
 * Normalizes the common command envelope before Mock and Real responses reach
 * the command Adapter. R1 treats HTTP 200 + success:false as a failure; the
 * transport must preserve that meaning instead of handing it to a success
 * mapper.
 */
export function normalizeCommandResponse(raw: unknown): unknown {
  if (typeof raw === 'string' && raw.trim() === 'restart') {
    throw new ApiCommandTransportError('Command session is invalid', 'session_invalid')
  }
  const envelope = commandResponseRecord(raw)
  const nestedData = typeof envelope.data === 'object' && envelope.data !== null && !Array.isArray(envelope.data)
    ? envelope.data as Record<string, unknown>
    : undefined
  const failureRecord = envelope.success === false
    ? envelope
    : nestedData?.success === false
      ? nestedData
      : undefined

  if (failureRecord) {
    throw new ApiCommandTransportError('Command was rejected by the server', commandFailureCategory(failureRecord))
  }

  if (envelope.success !== undefined && envelope.success !== true && envelope.success !== false) {
    throw new ApiCommandTransportError('Command response success marker is malformed', 'server_terminal')
  }
  if (nestedData?.success !== undefined && nestedData.success !== true && nestedData.success !== false) {
    throw new ApiCommandTransportError('Command response success marker is malformed', 'server_terminal')
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data') && envelope.success !== true) {
    throw new ApiCommandTransportError('Command response payload is malformed', 'server_terminal')
  }

  return raw
}

function commandFailure<T>(error: unknown): OperationSnapshot<T> {
  if (error instanceof AdapterMappingError) return adapterFailure('server_terminal', error.message)
  if (error instanceof ApiCommandTransportError) return adapterFailure(error.category, error.message)
  return adapterFailure('network_retryable', unknownErrorMessage(error, 'API command transport failed'))
}

function responseItems(raw: unknown): readonly unknown[] {
  const envelope = asRecord(raw, 'command response')
  const data = nestedValue(envelope, ['data'])
  if (Array.isArray(data)) return data
  throw new AdapterMappingError('command response data is malformed')
}

function formDataIdFromResponse(value: unknown): FormDataId {
  const envelope = asRecord(value, 'saved appointment form response')
  const data = optionalRecord(envelope.data) ?? envelope
  return data
    ? (requiredString(data, ['id', '_id', 'dataId'], 'saved appointment form data id') as FormDataId)
    : (() => { throw new AdapterMappingError('saved appointment form data id is missing') })()
}

function failureFrom<T, U>(result: OperationSnapshot<T>): OperationSnapshot<U> {
  return result.state === 'succeeded'
    ? adapterFailure('server_terminal', 'Command response was incomplete')
    : { state: result.state, ...(result.error ? { error: result.error } : {}) }
}

function mapSubmitValues(values: Readonly<Record<string, string | number | boolean | null>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null))
}

function mapDynamicValues(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, mapDynamicValue(value)]))
}

function mapSurveyMediaRef(value: SurveyMediaRef): Record<string, string> {
  return {
    url: value.url,
    ...(value.objectKey ? { name: value.objectKey } : {}),
    ...(value.fileName ? { fileName: value.fileName } : {}),
    ...(value.extension ? { extname: value.extension } : {}),
  }
}

function mapDynamicValue(value: unknown): unknown {
  if (isSurveyMediaRef(value)) return mapSurveyMediaRef(value)
  if (Array.isArray(value) && value.every((item) => isSurveyMediaRef(item))) {
    return value.map((item) => mapSurveyMediaRef(item))
  }
  return value
}

export class TechnicianApiCommandAdapter implements TechnicianApiCommandPort {
  constructor(
    private readonly transport: ApiCommandTransport,
    private readonly readPort: TechnicianApiReadPort,
  ) {}

  private async command<T>(request: ApiCommandRequest, map: (raw: unknown) => T): Promise<OperationSnapshot<T>> {
    try {
      return succeeded(map(await this.transport.execute(request)))
    } catch (error) {
      return commandFailure(error)
    }
  }

  private async resolveDynamicDefinition(
    definition: FormDefinitionRead,
  ): Promise<OperationSnapshot<FormDefinitionRead>> {
    const fields: FormFieldRead[] = []
    for (const field of definition.fields ?? []) {
      const codeLookup =
        field.valueOption && (field.type === 'select' || field.type === 'radio' || field.type === 'checkbox')
          ? this.readPort.getDynamicCodeOptions
          : undefined
      const cascadeLookup = field.valueOption && field.type === 'cascade'
        ? this.readPort.getCascadeCodeOptions
        : undefined

      if (!codeLookup && !cascadeLookup) {
        fields.push(field)
        continue
      }

      // A test/application composition that does not provide the optional
      // dynamic provider remains conservative; Runtime will mark the field
      // unsupported instead of inventing an option set.
      if (!field.valueOption) {
        fields.push(field)
        continue
      }

      const options = codeLookup
        ? await codeLookup.call(this.readPort, { valueOption: field.valueOption })
        : await cascadeLookup!.call(this.readPort, { codeType: field.valueOption })
      if (options.state !== 'succeeded' || !options.data) {
        return failureFrom(options)
      }
      fields.push({
        ...field,
        ...(options.data.items.length > 0
          ? { options: options.data.items }
          : { unsupportedReason: `${field.type} option provider returned no options` }),
      })
    }

    return succeeded({ ...definition, fields })
  }

  inspectAcceptOrder(input: AcceptOrderInput) {
    return this.command<AcceptOrderInspection>(
      {
        method: 'POST',
        path: 'basic/serviceAppointment/selfExamination',
        body: { saId: input.workOrderId },
      },
      (raw) => ({ requiresConfirmation: responseItems(raw).length > 0 }),
    )
  }

  acceptOrder(input: AcceptOrderInput) {
    return this.command<void>(
      {
        method: 'POST',
        path: 'workflow/process',
        body: {
          sid: input.workOrderId,
          workflowNodeId: input.workflowNodeId,
          smodule: 'serviceAppointment',
        },
      },
      () => undefined,
    )
  }

  async readAppointmentForm(input: { readonly formDataId?: FormDataId }): Promise<OperationSnapshot<AppointmentFormRead>> {
    const generic = await this.readDynamicForm({
      definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
      ...(input.formDataId ? { formDataId: input.formDataId } : {}),
    })
    if (generic.state !== 'succeeded' || !generic.data) return generic as OperationSnapshot<AppointmentFormRead>
    const values: Record<string, AppointmentFormRead['values'][string]> = {}
    for (const [key, value] of Object.entries(generic.data.values)) {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        values[key] = value
      }
    }
    return succeeded({
      fields: generic.data.fields,
      values,
      ...(generic.data.definitionId ? { definitionId: generic.data.definitionId } : {}),
      ...(generic.data.dataId ? { dataId: generic.data.dataId } : {}),
      ...(generic.data.purpose ? { purpose: generic.data.purpose } : {}),
    })
  }

  async readDynamicForm(input: ReadDynamicFormInput): Promise<OperationSnapshot<DynamicFormRead>> {
    const definition = await this.readPort.getFormDefinition(input.definitionId)
    if (definition.state !== 'succeeded' || !definition.data) {
      return failureFrom(definition)
    }

    const resolvedDefinition = await this.resolveDynamicDefinition(definition.data)
    if (resolvedDefinition.state !== 'succeeded' || !resolvedDefinition.data) {
      return failureFrom(resolvedDefinition)
    }

    if (!input.formDataId) {
      return succeeded({
        definitionId: resolvedDefinition.data.id,
        ...(resolvedDefinition.data.purpose ? { purpose: resolvedDefinition.data.purpose } : {}),
        fields: resolvedDefinition.data.fields ?? [],
        values: {},
        ...(input.workflowReadOnlyFieldIds ? { workflowReadOnlyFieldIds: input.workflowReadOnlyFieldIds } : {}),
      })
    }

    const data = await this.readPort.getFormData({
      definitionId: input.definitionId,
      dataId: input.formDataId,
    })
    if (data.state !== 'succeeded' || !data.data) return failureFrom(data)

    const first = data.data.items[0]
    if (
      data.data.items.length !== 1 ||
      !first ||
      first.id !== input.formDataId ||
      first.definitionId !== resolvedDefinition.data.id ||
      (input.expectedWorkflowRunId && first.workflowRunId !== input.expectedWorkflowRunId)
    ) {
      return adapterFailure('server_terminal', 'Dynamic form data did not match the requested record')
    }

    return succeeded({
      definitionId: resolvedDefinition.data.id,
      ...(resolvedDefinition.data.purpose ? { purpose: resolvedDefinition.data.purpose } : {}),
      fields: resolvedDefinition.data.fields ?? [],
      values: first?.values ?? {},
      ...(first?.id ? { dataId: first.id } : {}),
      ...(first?.workflowRunId ? { workflowRunId: first.workflowRunId } : {}),
      ...(input.workflowReadOnlyFieldIds ? { workflowReadOnlyFieldIds: input.workflowReadOnlyFieldIds } : {}),
    })
  }

  async saveDynamicForm(input: SaveDynamicFormInput): Promise<OperationSnapshot<FormDataId>> {
    const formData: Record<string, unknown> = {
      ...mapDynamicValues(input.values),
      sid: input.workOrderId,
      smodule: 'serviceAppointment',
      nodeId: input.workflowNodeId,
      ...(input.workflowRunId ? { workflowId: input.workflowRunId } : {}),
      ...(input.formDataId ? { _id: input.formDataId } : {}),
      state: 1,
    }
    return this.command<FormDataId>(
      {
        method: 'POST',
        path: `biz/extForm/upsert/${encodeURIComponent(String(input.definitionId))}`,
        body: { dataStr: JSON.stringify(formData) },
      },
      formDataIdFromResponse,
    )
  }

  completeWorkflowNode(input: CompleteWorkflowNodeInput): Promise<OperationSnapshot<void>> {
    return this.command<void>(
      {
        method: 'POST',
        path: 'workflow/process',
        body: {
          workflowNodeId: input.workflowNodeId,
          nodeFormDefId: input.definitionId,
          nodeFormDataId: input.formDataId,
          smodule: 'serviceAppointment',
          sid: input.workOrderId,
        },
      },
      () => undefined,
    )
  }

  async submitAppointment(input: SubmitAppointmentInput): Promise<OperationSnapshot<void>> {
    const saved = input.visitIntent === 'visit_deferred'
      ? await this.command<FormDataId>(
          {
            method: 'POST',
            path: `biz/extForm/upsert/${appointmentFormDefinitionWireId}`,
            body: {
              dataStr: JSON.stringify({
                ...mapSubmitValues(input.values),
                sid: input.workOrderId,
                smodule: 'serviceAppointment',
                nodeId: input.workflowNodeId,
                ...(input.workflowRunId ? { workflowId: input.workflowRunId } : {}),
                ...(input.formDataId ? { _id: input.formDataId } : {}),
                state: 1,
              }),
            },
            safety: 'deferred_appointment_datetime_encoding_unknown',
          },
          formDataIdFromResponse,
        )
      : await this.saveDynamicForm({
          workOrderId: input.workOrderId,
          workflowNodeId: input.workflowNodeId,
          ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
          definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
          ...(input.formDataId ? { formDataId: input.formDataId } : {}),
          values: input.values,
        })
    if (saved.state !== 'succeeded') return failureFrom<FormDataId, void>(saved)
    if (!saved.data) return adapterFailure('server_terminal', 'Saved appointment form data id is missing')

    return this.completeWorkflowNode({
      workOrderId: input.workOrderId,
      workflowNodeId: input.workflowNodeId,
      ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
      definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
      formDataId: saved.data,
    })
  }
}

export function createTechnicianApiCommandAdapter(
  transport: ApiCommandTransport,
  readPort: TechnicianApiReadPort,
): TechnicianApiCommandPort {
  return new TechnicianApiCommandAdapter(transport, readPort)
}
