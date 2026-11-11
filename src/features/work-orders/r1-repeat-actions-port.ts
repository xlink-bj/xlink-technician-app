import type { R1LocalField } from './r1-local-form-fields'
import type { InjectionKey } from 'vue'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'

export interface R1RepeatPageActions {
  locked(): boolean
  saveOnly(values: Readonly<Record<string, unknown>>, recordId?: string): Promise<R1NodeFormsSnapshot>
  /** Optional forms capabilities; absent keeps the original Repeat contract. */
  canCreate?(): boolean
  canEdit?(recordId: string): boolean
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
