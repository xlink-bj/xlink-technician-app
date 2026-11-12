import { appointmentBusinessKeys, appointmentNullBusinessKey } from '@shared/form/appointment-replacement-context'
import { hasNonStringAppointmentNeed, appointmentNeedReselectionMessage } from '@shared/form/appointment-need'
import type {
  AcceptOrderInput,
  AcceptOrderInspection,
  AppointmentFormRead,
  CompleteWorkflowNodeInput,
  DynamicFormRead,
  FormDefinitionRead,
  FormFieldRead,
  CodeOptionRead,
  ReadPage,
  ReadDynamicFormInput,
  SaveDynamicFormInput,
  SubmitAppointmentInput,
  FormMutationCheckpoints,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
} from '@shared/ports'
import type { FormDataId, FormDefinitionId, OperationSnapshot } from '@shared/types'
import { requiresR1SpecialWorkflowWire } from '@shared/types'

import { appointmentFormDefinitionWireId } from './appointment-contract'
import type { ApiRequestMethod, ApiRequestValue } from './technician-api'
import { AdapterMappingError, adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, nestedValue, optionalRecord, optionalString, requiredString, type AdapterRecord } from '../common/records'
import { createSurveyReadValueCodec } from './survey-form-codec'
import { formDataUpsertCommand, workflowCompleteCommand, workflowAcceptCommand } from './action-command-wires'

export interface ApiCommandRequest {
  readonly method: Extract<ApiRequestMethod, 'POST'>
  readonly path: string
  readonly body?: Readonly<Record<string, ApiRequestValue>>
  /** Full-fidelity R1 node Exts uses JSON, never form-urlencoded. */
  readonly jsonBody?: Readonly<Record<string, unknown>>
  /** All R1 special mutations additionally require a dedicated opt-in fence. */
  readonly r1Special?: true
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
  // R1's WorkflowController returns ReturnStatus(status=1, entity=Workflow)
  // without a `data` property. Preserve this proven success envelope while
  // still rejecting empty/unmarked command responses.
  const verifiedEntitySuccess = envelope.status === 1
    && typeof envelope.entity === 'object'
    && envelope.entity !== null
    && !Array.isArray(envelope.entity)
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data') && envelope.success !== true && !verifiedEntitySuccess) {
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
    type ProviderSource = { readonly kind: 'code' | 'cascade' | 'businessRecord'; readonly valueOption: string }
    type ProviderResult = OperationSnapshot<ReadPage<CodeOptionRead>>
    const sourceFor = (field: FormFieldRead): ProviderSource | undefined => {
      if (!field.valueOption) return undefined
      if (
        (field.type === 'select' || field.type === 'radio' || field.type === 'checkbox')
        && this.readPort.getDynamicCodeOptions
      ) return { kind: 'code', valueOption: field.valueOption }
      if (field.type === 'cascade') {
        return { kind: 'cascade', valueOption: field.valueOption }
      }
      // R1 has a distinct business-record provider; no CodeService fallback.
      // projPackage remains disabled on live adapters until its response is verified.
      if (field.type === 'bizSelect' && field.valueOption === 'projPackage'
        && this.readPort.getBusinessRecordOptions) {
        return { kind: 'businessRecord', valueOption: field.valueOption }
      }
      return undefined
    }

    const fields = definition.fields ?? []
    const sourceKey = (source: ProviderSource): string => JSON.stringify([source.kind, source.valueOption])
    const uniqueSources = new Map<string, ProviderSource>()
    for (const field of fields) {
      const source = sourceFor(field)
      if (source) uniqueSources.set(sourceKey(source), source)
    }

    // A provider response belongs to THIS FormDef read, not to a global cache.
    // Deduplicate repeated valueOption identities within the read, but never
    // reuse tenant/role-scoped choices across a later action or session.
    // At most three concurrent R1 code reads prevents a many-field FormDef
    // from multiplying latency or bursting unbounded requests.
    const pending = [...uniqueSources.entries()]
    const resolved = new Map<string, ProviderResult>()
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < pending.length) {
        const entry = pending[cursor++]
        if (!entry) break
        const [key, source] = entry
        try {
          const result = source.kind === 'code'
            ? await this.readPort.getDynamicCodeOptions!.call(this.readPort, { valueOption: source.valueOption })
            : source.kind === 'businessRecord'
              ? await this.readPort.getBusinessRecordOptions!.call(this.readPort, { valueOption: source.valueOption })
              : await this.readPort.getCascadeCodeOptions!.call(this.readPort, { codeType: source.valueOption })
          resolved.set(key, result)
        } catch (error) {
          // A mapped/invalid R1 option tree cannot be repaired by a blind
          // retry. Only unknown transport failures remain retryable.
          resolved.set(key, adapterFailure(
            error instanceof AdapterMappingError ? 'server_terminal' : 'network_retryable',
            unknownErrorMessage(error, 'Dynamic option provider failed'),
          ))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()))

    const hydrated: FormFieldRead[] = []
    for (const field of fields) {
      const source = sourceFor(field)
      if (!source) {
        // Absent providers remain subject to the shared Runtime's
        // unsupported-capability gate; no inferred or synthetic options.
        hydrated.push(field)
        continue
      }
      const options = resolved.get(sourceKey(source))
      if (!options || options.state !== 'succeeded' || !options.data) {
        return options ? failureFrom(options) : adapterFailure('server_terminal', 'Option source was not resolved')
      }
      if (!Array.isArray(options.data.items)) {
        return adapterFailure('server_terminal', 'Option provider response is malformed')
      }
      // A business-record set is tenant/role scoped and must be complete.
      // Reject duplicate identities and malformed labels before rendering.
      if (source.kind === 'businessRecord' && (options.data.items.length > 100
        || options.data.items.some(item => typeof item.value !== 'string'
          || !item.value.trim() || typeof item.label !== 'string' || !item.label.trim())
        || new Set(options.data.items.map(item => item.value)).size !== options.data.items.length)) {
        return adapterFailure('server_terminal', 'Business record options are malformed or ambiguous')
      }
      hydrated.push({
        ...field,
        ...(options.data.items.length > 0
          ? { options: options.data.items }
          : { unsupportedReason: `${field.type} option provider returned no options` }),
      })
    }
    return succeeded({ ...definition, fields: hydrated })
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
    return this.command<void>(workflowAcceptCommand(input), () => undefined)
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
      ...(generic.data.appointmentReplacement ? { appointmentReplacement: generic.data.appointmentReplacement } : {}),
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

    let valueCodec
    try {
      valueCodec = resolvedDefinition.data.purpose === 'survey'
        ? createSurveyReadValueCodec(resolvedDefinition.data) : undefined
    } catch (error) {
      return adapterFailure('unsupported_capability', unknownErrorMessage(error, '勘查字段配置尚未完整核实。'))
    }
    const data = await this.readPort.getFormData({
      definitionId: input.definitionId,
      dataId: input.formDataId,
      ...(valueCodec ? { valueCodec } : {}),
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
      ...(first.appointmentReplacement ? { appointmentReplacement: first.appointmentReplacement } : {}),
      values: resolvedDefinition.data.purpose === 'appointment'
        ? Object.fromEntries(Object.entries(first.values ?? {}).filter(([key]) => appointmentBusinessKeys.some(candidate => candidate === key)))
        : first.values ?? {},
      ...(first?.id ? { dataId: first.id } : {}),
      ...(first?.workflowRunId ? { workflowRunId: first.workflowRunId } : {}),
      ...(input.workflowReadOnlyFieldIds ? { workflowReadOnlyFieldIds: input.workflowReadOnlyFieldIds } : {}),
    })
  }

  /** Purely persists FormData; NEVER completes a workflow node.
   * All appointment branches share one payload serializer. */
  private async saveDynamicFormRecord(
    input: SaveDynamicFormInput,
  ): Promise<OperationSnapshot<FormDataId>> {
    try {
      if (requiresR1SpecialWorkflowWire(input.sourceNodeType))
        return adapterFailure('unsupported_capability', 'R1 multi-form/repeat/subflow requires its own source-backed write contract')
      if (!input.mutation) return adapterFailure('unsupported_capability', 'Durable FormData checkpoint is required')
      const request = formDataUpsertCommand(input)
      const reserved = await input.mutation.beforeFormDispatch()
      if (reserved.state !== 'succeeded') return failureFrom(reserved)
      const saved = await this.command<FormDataId>(
        request,
        formDataIdFromResponse,
      )
      if (saved.state !== 'succeeded' || !saved.data) return saved
      const recorded = await input.mutation.afterFormSaved(saved.data)
      return recorded.state === 'succeeded' ? saved : failureFrom(recorded)
    } catch (error) {
      return commandFailure(error)
    }
  }

  /** saveOnly semantics: saving a draft never runs workflow/process. */
  saveDynamicForm(input: SaveDynamicFormInput): Promise<OperationSnapshot<FormDataId>> {
    return this.saveDynamicFormRecord(input)
  }

  async completeWorkflowNode(input: CompleteWorkflowNodeInput): Promise<OperationSnapshot<void>> {
    try {
      if (requiresR1SpecialWorkflowWire(input.sourceNodeType))
        return adapterFailure('unsupported_capability', 'R1 special node cannot complete with one FormData ID')
      if (!input.mutation) return adapterFailure('unsupported_capability', 'Durable Workflow checkpoint is required')
      const request = workflowCompleteCommand(input)
      const reserved = await input.mutation.beforeWorkflowDispatch(input.formDataId)
      if (reserved.state !== 'succeeded') return failureFrom(reserved)
      const completed = await this.command<void>(request, () => undefined)
      if (completed.state !== 'succeeded') return completed
      const recorded = await input.mutation.afterWorkflowCompleted()
      return recorded.state === 'succeeded' ? completed : failureFrom(recorded)
    } catch (error) {
      return commandFailure(error)
    }
  }

  async submitAppointment(input: SubmitAppointmentInput): Promise<OperationSnapshot<void>> {
    if (requiresR1SpecialWorkflowWire(input.sourceNodeType))
      return adapterFailure('unsupported_capability', 'R1 special Appointment node requires a verified multi-form/child workflow contract')
    if (appointmentNullBusinessKey(input.values)) return adapterFailure('validation', 'Null appointment business values are not a supported clear operation')
    if (hasNonStringAppointmentNeed(input.values.need)) return adapterFailure('validation', appointmentNeedReselectionMessage)
    const need = input.values.need
    if ((input.visitIntent === 'visit_required' && need !== '1')
      || (input.visitIntent === 'visit_deferred' && need !== '2' && need !== '0')
      || input.visitIntent === 'unknown') {
      return adapterFailure('unsupported_capability', 'Appointment intent does not match the selected R1 need value')
    }
    if (!input.mutation) return adapterFailure('unsupported_capability', 'Durable Appointment checkpoints are required')
    const mutation: FormMutationCheckpoints = input.mutation
    const saved = await this.saveDynamicFormRecord({
      workOrderId: input.workOrderId,
      workflowNodeId: input.workflowNodeId,
      ...(input.sourceNodeType ? { sourceNodeType: input.sourceNodeType } : {}),
      ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
      definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
      purpose: 'appointment',
      ...(input.appointmentReplacement ? { appointmentReplacement: input.appointmentReplacement } : {}),
      ...(input.formDataId ? { formDataId: input.formDataId } : {}),
      values: input.values,
      mutation,
    })
    if (saved.state !== 'succeeded') return failureFrom<FormDataId, void>(saved)
    if (!saved.data) return adapterFailure('server_terminal', 'Saved appointment form data id is missing')

    return this.completeWorkflowNode({
      workOrderId: input.workOrderId,
      workflowNodeId: input.workflowNodeId,
      ...(input.sourceNodeType ? { sourceNodeType: input.sourceNodeType } : {}),
      ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
      definitionId: appointmentFormDefinitionWireId as FormDefinitionId,
      formDataId: saved.data,
      mutation,
    })
  }
}

export function createTechnicianApiCommandAdapter(
  transport: ApiCommandTransport,
  readPort: TechnicianApiReadPort,
): TechnicianApiCommandPort {
  return new TechnicianApiCommandAdapter(transport, readPort)
}
