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
import { normalizeDynamicFieldValue } from './dynamic-form-action'

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

  const values: Record<string, FormFieldValue> = {}
  for (const [key, rawValue] of Object.entries(rawValues)) {
    const fields = form.fields.filter((candidate) => candidate.valueKey === key)
    const normalizedRaw = formFieldValue(rawValue)
    if (fields.length === 0 || normalizedRaw === undefined) return null
    for (const field of fields) {
      if (field.readOnly) {
        if (form.values[key] !== normalizedRaw) return null
        continue
      }
      const normalized = normalizeDynamicFieldValue(form, field, normalizedRaw)
      if (normalized.state !== 'succeeded' || normalized.data === undefined) return null
      values[key] = normalized.data
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

