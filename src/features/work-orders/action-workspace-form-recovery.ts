import type { ActionDescriptor } from '@runtimes/action'
import type {
  AppointmentFormRead,
  DynamicFormRead,
  StoragePort,
  TechnicianApiCommandPort,
} from '@shared/ports'
import {
  createOperationError,
  type FormDataId,
  type FormDefinitionId,
  type OperationError,
  type WorkflowRunId,
} from '@shared/types'
import { loadActionMutationReceipt, mutationReceiptDenial } from './action-mutation-receipt'

type ActionForm = AppointmentFormRead | DynamicFormRead

export type FormRecoveryResult =
  | { readonly kind: 'ready'; readonly form: ActionForm }
  | { readonly kind: 'stale' }
  | {
      readonly kind: 'blocked'
      readonly error: OperationError | null
      readonly message: string
      /** Original receipt-read failure preserves the Work Order detail on screen. */
      readonly keepDetail: boolean
    }

/**
 * Bounded read-side recovery of a previously dispatched form mutation.
 * This is not a submit or retry path; the Store still owns lifecycle, UI,
 * draft identity and session switching. An unknown receipt stays blocked.
 */
export async function recoverActionFormFromReceipt(input: {
  readonly storage: StoragePort
  readonly descriptor: ActionDescriptor
  readonly initialForm: ActionForm
  readonly commandApi: TechnicianApiCommandPort
  readonly appointment: boolean
  readonly existingFormDataId?: FormDataId
  readonly formDefinitionId?: FormDefinitionId
  readonly workflowRunId?: WorkflowRunId
  readonly workflowReadOnlyFieldIds?: readonly string[]
  readonly authorizationScope: string
  readonly stillCurrent: () => boolean
}): Promise<FormRecoveryResult> {
  if (!input.descriptor.contentIdentity) {
    return { kind: 'ready', form: input.initialForm }
  }
  const blocked = (message: string, keepDetail = false, error?: OperationError | null): FormRecoveryResult => ({
    kind: 'blocked',
    error: error === undefined ? createOperationError('unsupported_capability', message) : error,
    message,
    keepDetail,
  })
  const receipt = await loadActionMutationReceipt(input.storage, {
    userId: String(input.descriptor.userId),
    workOrderId: String(input.descriptor.workOrderId),
    workflowNodeId: String(input.descriptor.workflowNodeId),
    formDefinitionId: String(input.descriptor.contentIdentity),
    authorizationScope: input.authorizationScope,
  })
  if (!input.stillCurrent()) return { kind: 'stale' }
  if (receipt.state !== 'succeeded' || (receipt.data && receipt.data.phase !== 'form_saved')) {
    const error = receipt.error ?? mutationReceiptDenial().error ?? null
    return blocked(error?.message ?? '写入结果待核查，禁止再次提交。', true, error)
  }
  if (!receipt.data?.formDataId) return { kind: 'ready', form: input.initialForm }
  const savedId = receipt.data.formDataId as FormDataId
  if (input.existingFormDataId && String(input.existingFormDataId) !== String(savedId)) {
    return blocked('服务器表单 ID 与本地防重回执不一致，请人工核对。')
  }
  const recovered = input.appointment
    ? await input.commandApi.readAppointmentForm({ formDataId: savedId })
    : input.commandApi.readDynamicForm
      ? await input.commandApi.readDynamicForm({
          definitionId: input.formDefinitionId!,
          formDataId: savedId,
          ...(input.workflowRunId ? { expectedWorkflowRunId: input.workflowRunId } : {}),
          ...(input.workflowReadOnlyFieldIds ? { workflowReadOnlyFieldIds: input.workflowReadOnlyFieldIds } : {}),
        })
      : null
  if (!input.stillCurrent()) return { kind: 'stale' }
  if (!recovered || recovered.state !== 'succeeded' || !recovered.data
    || String(recovered.data.dataId) !== String(savedId)
    || String(recovered.data.definitionId) !== String(input.descriptor.contentIdentity)) {
    return blocked('无法按防重回执确认服务器表单，禁止继续工作流。')
  }
  return { kind: 'ready', form: recovered.data }
}
