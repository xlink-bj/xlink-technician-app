import type { InjectionKey } from 'vue'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'

export interface R1RepeatPageActions {
  locked(): boolean
  saveOnly(values: Readonly<Record<string, unknown>>): Promise<R1NodeFormsSnapshot>
  complete(): Promise<{ readonly acknowledged: true; readonly transitionVerified: false }>
}
export interface R1RepeatActionProvider {
  forSnapshot(snapshot: R1NodeFormsSnapshot): R1RepeatPageActions | null
}
export const r1RepeatActionsKey: InjectionKey<R1RepeatActionProvider> = Symbol('r1-repeat-actions')
