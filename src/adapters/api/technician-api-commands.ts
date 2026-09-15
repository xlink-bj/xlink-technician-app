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
    readonly category: 'session_invalid' | 'authorization_denied' | 'network_retryable' | 'server_terminal',
  ) {
    super(message)
    this.name = 'ApiCommandTransportError'
  }
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
  if (data === undefined || data === null) return []
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

    const data = await this.readPort.getFormData({
      definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
      ...(input.formDataId ? { dataId: input.formDataId } : {}),
    })
    if (data.state !== 'succeeded' || !data.data) return failureFrom(data)

    const first = data.data.items[0]
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
