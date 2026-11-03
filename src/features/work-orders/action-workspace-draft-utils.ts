/**
 * Pure draft value/identity reconciliation and media task correspondence.
 * No Pinia store, HTTP, file IO or business command behavior in this module.
 * Extraction preserves the exact old implementation and its fail-closed rules.
 */
import { actionDraftIdentityMatches, type ActionDescriptor, type ActionDraftIdentity, type ActionDraftRecord } from '@runtimes/action'
import type { AppointmentFieldValue, AppointmentFormRead, DynamicFormRead, FormFieldValue } from '@shared/ports'
import {
  isMediaValueRef,
  type UserId,
  type WorkOrderId,
  type WorkflowNodeRuntimeId,
  type MediaValueRef,
  type UploadedMediaRef,
  type MediaUploadTask,
} from '@shared/types'
import { normalizeAppointmentFieldValue } from './appointment-form-runtime'
import { dynamicActionFieldsFor, normalizeDynamicFieldValue } from './dynamic-form-action'
import { ACTION_FORM_SURFACE } from './action-form-schema'
import { isFieldApplicable, evaluateVisibility } from '@runtimes/dynamic-form'

export function appointmentValue(value: unknown): AppointmentFieldValue | undefined {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined
}

function formFieldValue(value: unknown): FormFieldValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value) && value.every((item) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
  )) {
    return value as readonly (string | number | boolean)[]
  }
  if (isMediaValueRef(value)) return value
  if (Array.isArray(value) && value.every((item) => isMediaValueRef(item))) {
    return value as readonly MediaValueRef[]
  }
  return undefined
}

function mediaUrlFromFormValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const url = (value as Record<string, unknown>).url
    return typeof url === 'string' && url.trim().length > 0 ? url : undefined
  }
  return undefined
}

export function formValueContainsUploadedRef(value: unknown, uploadedRef: UploadedMediaRef): boolean {
  const values = Array.isArray(value) ? value : [value]
  return values.some((candidate) => mediaUrlFromFormValue(candidate) === uploadedRef.url)
}

export function mediaTaskMatchesDynamicForm(
  task: MediaUploadTask,
  descriptor: ActionDescriptor,
  form: DynamicFormRead,
): boolean {
  if (String(task.scope.userId) !== String(descriptor.userId)
    || String(task.scope.workOrderId) !== String(descriptor.workOrderId)
    || String(task.scope.workflowNodeId) !== String(descriptor.workflowNodeId)) return false
  const taskDefinitionId = task.scope.formDefinitionId
  const currentDefinitionId = descriptor.contentIdentity ?? form.definitionId
  if (!taskDefinitionId || !currentDefinitionId) return false
  if (String(taskDefinitionId) !== String(currentDefinitionId)) return false
  if (form.definitionId && String(taskDefinitionId) !== String(form.definitionId)) return false

  const field = form.fields.find((candidate) => String(candidate.fieldId) === String(task.scope.fieldId))
  if (!field || field.valueKey !== task.scope.valueKey) return false

  const currentFormDataId = form.dataId === undefined || form.dataId === null ? undefined : String(form.dataId)
  const taskFormDataId = task.scope.formDataId === undefined || task.scope.formDataId === null
    ? undefined
    : String(task.scope.formDataId)
  if (!currentFormDataId && taskFormDataId) return false
  if (currentFormDataId && taskFormDataId && currentFormDataId !== taskFormDataId) return false
  return true
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function draftRecordFor(
  value: unknown,
  identity: ActionDraftIdentity,
  form: AppointmentFormRead,
): ActionDraftRecord<Readonly<Record<string, AppointmentFieldValue>>> | null {
  const input = record(value)
  const rawIdentity = record(input?.identity)
  const rawValues = record(input?.values)
  if (
    input?.version !== 1 ||
    input.status !== 'unfinished' ||
    typeof input.updatedAt !== 'string' ||
    !rawIdentity ||
    !rawValues
  ) return null

  const storedIdentity: ActionDraftIdentity = {
    version: 1,
    userId: rawIdentity.userId as UserId,
    workOrderId: rawIdentity.workOrderId as WorkOrderId,
    workflowNodeId: rawIdentity.workflowNodeId as WorkflowNodeRuntimeId,
    actionIntent: rawIdentity.actionIntent as ActionDraftIdentity['actionIntent'],
    contentKind: rawIdentity.contentKind as ActionDraftIdentity['contentKind'],
    ...(typeof rawIdentity.contentIdentity === 'string' ? { contentIdentity: rawIdentity.contentIdentity } : {}),
    ...(typeof rawIdentity.roleId === 'string' ? { roleId: rawIdentity.roleId as ActionDraftIdentity['roleId'] } : {}),
  }
  if (!actionDraftIdentityMatches(storedIdentity, identity)) return null

  const values: Record<string, AppointmentFieldValue> = {}
  for (const [key, rawValue] of Object.entries(rawValues)) {
    const fields = form.fields.filter((candidate) => candidate.valueKey === key)
    const normalized = appointmentValue(rawValue)
    if (fields.length === 0 || normalized === undefined) return null
    for (const field of fields) {
      if (field.readOnly) {
        if (form.values[key] !== normalized) return null
        continue
      }
      const result = normalizeAppointmentFieldValue(field, normalized, { ...form.values, ...values })
      if (result.state !== 'succeeded' || result.data === undefined) return null
      values[key] = result.data
    }
  }

  return {
    version: 1,
    identity,
    values,
    updatedAt: input.updatedAt,
    status: 'unfinished',
  }
}

/**
 * Drafts are JSON snapshots; server and restored media refs have different
 * object identities. Compare normalized values structurally, without turning
 * read-only data into a draft write. The codec accepts primitives and bounded
 * media references only; arbitrary objects have already been rejected.
 */
function samePersistedFormValue(a: FormFieldValue | undefined, b: FormFieldValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length && a.every((item, i) => samePersistedFormValue(item, b[i]!))
  }
  if (isMediaValueRef(a) || isMediaValueRef(b)) {
    return isMediaValueRef(a) && isMediaValueRef(b)
      && a.url === b.url && a.objectKey === b.objectKey
      && a.fileName === b.fileName && a.extension === b.extension
  }
  return a === b
}

export function dynamicDraftRecordFor(
  value: unknown,
  identity: ActionDraftIdentity,
  form: DynamicFormRead,
): ActionDraftRecord<Readonly<Record<string, FormFieldValue>>> | null {
  const input = record(value)
  const rawIdentity = record(input?.identity)
  const rawValues = record(input?.values)
  if (
    input?.version !== 1 ||
    input.status !== 'unfinished' ||
    typeof input.updatedAt !== 'string' ||
    !rawIdentity ||
    !rawValues
  ) return null

  const storedIdentity: ActionDraftIdentity = {
    version: 1,
    userId: rawIdentity.userId as UserId,
    workOrderId: rawIdentity.workOrderId as WorkOrderId,
    workflowNodeId: rawIdentity.workflowNodeId as WorkflowNodeRuntimeId,
    actionIntent: rawIdentity.actionIntent as ActionDraftIdentity['actionIntent'],
    contentKind: rawIdentity.contentKind as ActionDraftIdentity['contentKind'],
    ...(typeof rawIdentity.contentIdentity === 'string' ? { contentIdentity: rawIdentity.contentIdentity } : {}),
    ...(typeof rawIdentity.roleId === 'string' ? { roleId: rawIdentity.roleId as ActionDraftIdentity['roleId'] } : {}),
  }
  if (!actionDraftIdentityMatches(storedIdentity, identity)) return null

  const sourceValues: Record<string, FormFieldValue> = {}
  for (const [key, rawValue] of Object.entries(rawValues)) {
    if (!form.fields.some(field => field.valueKey === key)) return null
    const parsed = formFieldValue(rawValue)
    if (parsed === undefined) return null
    sourceValues[key] = parsed
  }

  // Evaluate conditional fields against the ENTIRE proposed draft, not one
  // field at a time against the older server values. Otherwise a controlling
  // choice restored later in object iteration changes the visibility/required
  // policy retroactively. Hidden source-backed values may remain on disk but
  // must not be replayed into an editable field or the next FormData write.
  const proposed: DynamicFormRead = { ...form, values: { ...form.values, ...sourceValues } }
  const states = dynamicActionFieldsFor(proposed)
  const values: Record<string, FormFieldValue> = {}
  for (const [key, parsed] of Object.entries(sourceValues)) {
    const matching = states.filter(field => field.valueKey === key)
    let accepted: FormFieldValue | undefined
    for (const field of matching) {
      if (!isFieldApplicable(field, ACTION_FORM_SURFACE)) continue
      if (field.runtime.capability === 'PRESENTATION_ONLY') continue
      if (!field.runtime.visible) {
        // Unknown visibility/provider is not the same as verified hidden.
        if (field.runtime.capability === 'UNSUPPORTED'
          && evaluateVisibility(field.visibility, proposed.values).state !== 'hidden') return null
        continue
      }
      if (field.runtime.capability === 'UNSUPPORTED') return null
      if (field.runtime.readOnly) {
        // Field-row and Workflow readonly are monotonic. Local drafts are not
        // an authority to replace persisted values, including media arrays.
        if (!samePersistedFormValue(form.values[key], parsed)) return null
        continue
      }
      const checked = normalizeDynamicFieldValue(proposed, field, parsed)
      if (checked.state !== 'succeeded' || checked.data === undefined) return null
      if (accepted !== undefined
        && JSON.stringify(accepted) !== JSON.stringify(checked.data)) return null
      accepted = checked.data
    }
    if (accepted !== undefined) values[key] = accepted
  }

  return {
    version: 1,
    identity,
    values,
    updatedAt: input.updatedAt,
    status: 'unfinished',
  }
}

