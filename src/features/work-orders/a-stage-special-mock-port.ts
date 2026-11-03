import type { NetworkStatusPort, FormDefinitionRead } from '@shared/ports'
import type { MediaUploadTask, MediaUploadTaskId } from '@shared/types'
import type { R1SpecialMockFields } from './r1-special-mock-form-fields'

export type AStageSpecialKind = 'forms' | 'repeat'
export interface AStageMockActor { readonly userId: string; readonly roleId: string; readonly identity: string }
export type AStageSpecialAction =
  | { readonly kind: 'save'; readonly fields: R1SpecialMockFields; readonly title?: string; readonly formDefinitionId?: string }
  /** R1 forms process(formDataId): Save → full EXTS → Process, as one fenced transaction. */
  | { readonly kind: 'save_finish'; readonly fields: R1SpecialMockFields; readonly title?: string; readonly formDefinitionId?: string }
  | { readonly kind: 'edit'; readonly id: string; readonly fields: R1SpecialMockFields; readonly title?: string; readonly formDefinitionId?: string; readonly expectedRevision?: string }
  | { readonly kind: 'delete'; readonly id: string; readonly expectedRevision?: string }
  | { readonly kind: 'finish' }
export interface AStageSpecialRecord {
  readonly id: string
  /** Exact, source-owned FormData revision for optimistic cross-editor checks. */
  readonly revision?: string
  readonly formDefinitionId: string
  readonly title: string
  readonly summary: string
  readonly values: R1SpecialMockFields
  readonly state: 'active' | 'deleted'
  readonly editable: boolean
}
export interface AStageSpecialView {
  readonly kind: AStageSpecialKind
  readonly definition: FormDefinitionRead
  readonly definitions: readonly { readonly id: string; readonly label: string; readonly definition: FormDefinitionRead }[]
  readonly pendingFormDefinitionId?: string
  readonly nodeActive: boolean
  readonly entries: readonly AStageSpecialRecord[]
  readonly receiptPending: boolean
  readonly pendingRecoverable: boolean
  readonly pendingNeedsOriginalFields: boolean
}
export type AStageSpecialOutcome =
  | { readonly state: 'succeeded'; readonly view: AStageSpecialView }
  | { readonly state: 'blocked' | 'uncertain'; readonly message: string }

/** Page-composed, synthetic-only controller contract. No App/transport imports. */
export interface AStageSpecialMockController {
  readonly network: NetworkStatusPort
  readDraft(formDefinitionId: string, recordId?: string): Promise<R1SpecialMockFields | null>
  writeDraft(formDefinitionId: string, values: R1SpecialMockFields, recordId?: string): Promise<boolean>
  removeDraft(formDefinitionId: string, recordId?: string): Promise<boolean>
  load(): Promise<AStageSpecialView>
  execute(action: AStageSpecialAction): Promise<AStageSpecialOutcome>
  recoverCompleted(originalFields: R1SpecialMockFields): Promise<AStageSpecialOutcome>
  listMediaTasks(formDefinitionId: string, recordId?: string): Promise<readonly MediaUploadTask[]>
  pickMedia(formDefinitionId: string, fieldId: string, recordId?: string): Promise<{ readonly state: 'succeeded' | 'cancelled' | 'failed'; readonly message?: string }>
  retryMedia(formDefinitionId: string, taskId: MediaUploadTaskId, recordId?: string): Promise<boolean>
  discardMedia(formDefinitionId: string, taskId: MediaUploadTaskId, recordId?: string): Promise<boolean>
  finalizeMedia(formDefinitionId: string, recordId?: string): Promise<boolean>
}
export type AStageSpecialMockControllerFactory = (options: {
  readonly kind: AStageSpecialKind
  readonly workOrderId: string
  readonly getActor: () => AStageMockActor | null
}) => AStageSpecialMockController
