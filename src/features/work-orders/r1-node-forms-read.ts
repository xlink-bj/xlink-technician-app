import type { AppointmentReplacementContext } from '@shared/form/appointment-replacement-context'
import type { InjectionKey } from 'vue'
import type { FormDefinitionRead, FormDataRead, WorkflowNodeRead } from '@shared/ports'

/** A normal role-scoped read capability. No receipt, draft or mutation grant. */
export interface R1NodeFormsSnapshot {
  readonly workOrderId: string
  readonly node: WorkflowNodeRead
  readonly definition: FormDefinitionRead
  /** Raw runtime nodeDef fill list, independently read. Missing is not write permission. */
  readonly fillableFieldIds?: readonly string[]
  readonly records: readonly Omit<FormDataRead, 'appointmentReplacement'>[]
}
/** Existing-record query/Map-replacement route facts, not a write grant or
 * proof of BSON type/precision preservation. A copied object is not evidence. */
export interface R1GenericMapRouteRead {
  readonly tenantId: string
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly workflowRunId: string
  readonly formDefinitionId: string
  readonly recordId: string
  readonly type: '0'
  readonly colName: string
  readonly collectionName: string
  readonly original: Readonly<Record<string, unknown>>
}
/** Definition routing facts for the separately bounded generic file-create
 * path. This is neither an existing-record credential nor a write grant. */
export type R1NormalFileRouteRead = Omit<R1GenericMapRouteRead, 'recordId' | 'original'>
export interface R1RepeatAppointmentRead {
  readonly original: Readonly<Record<string, unknown>>
  readonly appointmentReplacement: AppointmentReplacementContext
}
export interface R1NodeFormsReader {
  enabled(): boolean
  load(workOrderId: string, runtimeNodeId: string): Promise<R1NodeFormsSnapshot>
  isCurrent(snapshot: R1NodeFormsSnapshot): boolean
  /** Transient complete EXTS for this reader's exact current forms snapshot.
   * A read credential only; never a command or edit permission. */
  currentFormsExts?(snapshot: R1NodeFormsSnapshot): Readonly<Record<string, unknown>> | null
  /** Exact current read provenance, not an ACK/cache-derived edit grant. */
  currentFormOriginal?(snapshot: R1NodeFormsSnapshot, recordId: string): Readonly<Record<string, unknown>> | null
  /** Private-reader issuance: exact string Ext.type=0, matching raw field
   * collection identities and exact selected original; never an ACK grant. */
  currentGenericMapRoute?(snapshot: R1NodeFormsSnapshot, recordId: string): R1GenericMapRouteRead | null
  isCurrentGenericMapRoute?(snapshot: R1NodeFormsSnapshot, recordId: string, evidence: unknown): boolean
  currentNormalFileRoute?(snapshot: R1NodeFormsSnapshot): R1NormalFileRouteRead | null
  isCurrentNormalFileRoute?(snapshot: R1NodeFormsSnapshot, evidence: unknown): boolean
  currentRepeatAppointment?(snapshot: R1NodeFormsSnapshot, recordId: string): R1RepeatAppointmentRead | null
  isCurrentRepeatAppointment?(snapshot: R1NodeFormsSnapshot, recordId: string, evidence: unknown): boolean
  /** Independent post-Process read; performs no mutation. */
  confirmFormsCompletion?(snapshot: R1NodeFormsSnapshot): Promise<{ readonly transitionVerified: true }>
  clear(): void
}
export const r1NodeFormsReaderKey: InjectionKey<R1NodeFormsReader> = Symbol('r1-node-forms-reader')
