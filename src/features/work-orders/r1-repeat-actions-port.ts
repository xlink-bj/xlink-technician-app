import type { R1LocalField, R1LocalFieldValue } from './r1-local-form-fields'
import type { InjectionKey } from 'vue'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1NormalFormFileSessionView } from './r1-normal-form-media-port'

export interface R1RepeatPageActions {
  /** Current controller-owned clear sentinels that must not enter durable recovery. */
  draftOmittedFieldIds?(snapshot: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>): readonly string[]
  readonly fileMedia?: R1NormalFormFileSessionView
  /** Selected ordinary scalar first-create transition; throw never means fallback. */
  updateCreateDraft?(values:Readonly<Record<string,R1LocalFieldValue>>,key:string,value:R1LocalFieldValue,recordId?:string):Record<string,R1LocalFieldValue>
  locked(): boolean
  saveOnly(values: Readonly<Record<string, unknown>>, recordId?: string): Promise<R1NodeFormsSnapshot>
  /** Optional forms capabilities; absent keeps the original Repeat contract. */
  canCreate?(): boolean
  canEdit?(recordId: string): boolean
  /** Business feedback from this record's existing capability/receipt only. */
  editProblem?(recordId: string): string | null
  canComplete?(): boolean
  canSaveAndComplete?(): boolean
  projectFields?(values: Readonly<Record<string, unknown>>, recordId?: string): readonly (R1LocalField & { readonly visible: boolean })[]
  initialValues?(recordId: string): Readonly<Record<string, unknown>> | null
  validateDraft?(values: Readonly<Record<string, unknown>>, recordId?: string): boolean
  saveAndComplete?(values: Readonly<Record<string, unknown>>, recordId?: string): Promise<{ readonly acknowledged: true; readonly transitionVerified: boolean }>
  complete(): Promise<{ readonly acknowledged: true; readonly transitionVerified: boolean }>
}
export interface R1RepeatActionProvider {
  forSnapshot(snapshot: R1NodeFormsSnapshot): R1RepeatPageActions | null
}
export const r1RepeatActionsKey: InjectionKey<R1RepeatActionProvider> = Symbol('r1-repeat-actions')
