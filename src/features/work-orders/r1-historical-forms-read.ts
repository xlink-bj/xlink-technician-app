import type { InjectionKey } from 'vue'
import type { FormDataRead, FormDefinitionRead } from '@shared/ports'

/** Derived from fresh node references, never a log ID, route or write lease. */
export interface HistoricalFormTarget {
  readonly kind: 'completed-forms-reference'
  readonly workOrderId: string
  readonly workflowRunId: string
  readonly runtimeNodeId: string
  readonly formDefinitionId: string
  readonly recordId: string
  readonly title: string
}
export interface HistoricalFormRead {
  readonly kind: 'historical-form-read'
  readonly target: HistoricalFormTarget
  readonly definition: FormDefinitionRead
  readonly record: Omit<FormDataRead, 'appointmentReplacement'>
}
export interface HistoricalFormsReader {
  enabled(): boolean
  discover(workOrderId: string): Promise<readonly HistoricalFormTarget[]>
  read(target: HistoricalFormTarget): Promise<HistoricalFormRead>
  isCurrent(value: HistoricalFormTarget | HistoricalFormRead): boolean
  clear(): void
}
export const historicalFormsReaderKey: InjectionKey<() => HistoricalFormsReader> = Symbol('historical-forms-reader')
