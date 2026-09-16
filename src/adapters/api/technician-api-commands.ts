import type {
  AcceptOrderInput,
  AcceptOrderInspection,
  AppointmentFormRead,
  SubmitAppointmentInput,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
} from '@shared/ports'
import type { FormDataId, FormDefinitionId, OperationSnapshot } from '@shared/types'

import { appointmentFormDefinitionWireId } from './appointment-contract'
import type { ApiRequestMethod, ApiRequestValue } from './technician-api'
import { AdapterMappingError, adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, nestedValue, optionalRecord, optionalString, requiredString, type AdapterRecord } from '../common/records'

export interface ApiCommandRequest {
  readonly method: Extract<ApiRequestMethod, 'POST'>
  readonly path: string
  readonly body?: Readonly<Record<string, ApiRequestValue>>
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
    const definition = await this.readPort.getFormDefinition(
      appointmentFormDefinitionWireId as FormDefinitionId,
    )
    if (definition.state !== 'succeeded' || !definition.data) {
      return failureFrom(definition)
    }

    if (!input.formDataId) {
      return succeeded({
        fields: definition.data.fields ?? [],
        values: {},
      })
    }

    const data = await this.readPort.getFormData({
      definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
      dataId: input.formDataId,
    })
    if (data.state !== 'succeeded' || !data.data) return failureFrom(data)

    const first = data.data.items[0]
    if (
      data.data.items.length !== 1 ||
      !first ||
      first.id !== input.formDataId ||
      first.definitionId !== definition.data.id
    ) {
      return adapterFailure('server_terminal', 'Appointment form data did not match the requested record')
    }

    return succeeded({
      fields: definition.data.fields ?? [],
      values: first?.values ?? {},
      ...(first?.id ? { dataId: first.id } : {}),
    })
  }

  async submitAppointment(input: SubmitAppointmentInput): Promise<OperationSnapshot<void>> {
    const formData: Record<string, unknown> = {
      ...mapSubmitValues(input.values),
      sid: input.workOrderId,
      smodule: 'serviceAppointment',
      nodeId: input.workflowNodeId,
      ...(input.workflowRunId ? { workflowId: input.workflowRunId } : {}),
      ...(input.formDataId ? { _id: input.formDataId } : {}),
      state: 1,
    }

    const saved = await this.command<FormDataId>(
      {
        method: 'POST',
        path: `biz/extForm/upsert/${appointmentFormDefinitionWireId}`,
        body: { dataStr: JSON.stringify(formData) },
      },
      formDataIdFromResponse,
    )
    if (saved.state !== 'succeeded') return failureFrom<FormDataId, void>(saved)
    if (!saved.data) return adapterFailure('server_terminal', 'Saved appointment form data id is missing')

    const processed = await this.command<void>(
      {
        method: 'POST',
        path: 'workflow/process',
        body: {
          workflowNodeId: input.workflowNodeId,
          nodeFormDefId: appointmentFormDefinitionWireId,
          nodeFormDataId: saved.data,
          smodule: 'serviceAppointment',
          sid: input.workOrderId,
        },
      },
      () => undefined,
    )
    return processed
  }
}

export function createTechnicianApiCommandAdapter(
  transport: ApiCommandTransport,
  readPort: TechnicianApiReadPort,
): TechnicianApiCommandPort {
  return new TechnicianApiCommandAdapter(transport, readPort)
}
