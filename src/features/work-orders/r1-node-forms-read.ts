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
export interface R1NodeFormsReader {
  enabled(): boolean
  load(workOrderId: string, runtimeNodeId: string): Promise<R1NodeFormsSnapshot>
  isCurrent(snapshot: R1NodeFormsSnapshot): boolean
  /** Transient complete EXTS for this reader's exact current forms snapshot.
   * A read credential only; never a command or edit permission. */
  currentFormsExts?(snapshot: R1NodeFormsSnapshot): Readonly<Record<string, unknown>> | null
  /** Exact current read provenance, not an ACK/cache-derived edit grant. */
  currentFormOriginal?(snapshot: R1NodeFormsSnapshot, recordId: string): Readonly<Record<string, unknown>> | null
  /** Independent post-Process read; performs no mutation. */
  confirmFormsCompletion?(snapshot: R1NodeFormsSnapshot): Promise<{ readonly transitionVerified: true }>
  clear(): void
}
export const r1NodeFormsReaderKey: InjectionKey<R1NodeFormsReader> = Symbol('r1-node-forms-reader')
