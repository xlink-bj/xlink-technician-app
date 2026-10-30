export type AStageSpecialKind = 'forms' | 'repeat'
export interface AStageMockActor { readonly userId: string; readonly roleId: string; readonly identity: string }
export type AStageSpecialAction =
  | { readonly kind: 'save'; readonly summary: string; readonly title?: string }
  | { readonly kind: 'edit'; readonly id: string; readonly summary: string; readonly title?: string }
  | { readonly kind: 'delete'; readonly id: string }
  | { readonly kind: 'finish' }
export interface AStageSpecialRecord {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly state: 'active' | 'deleted'
  readonly editable: boolean
}
export interface AStageSpecialView {
  readonly kind: AStageSpecialKind
  readonly nodeActive: boolean
  readonly entries: readonly AStageSpecialRecord[]
  readonly receiptPending: boolean
  readonly pendingRecoverable: boolean
  readonly pendingNeedsOriginalText: boolean
}
export type AStageSpecialOutcome =
  | { readonly state: 'succeeded'; readonly view: AStageSpecialView }
  | { readonly state: 'blocked' | 'uncertain'; readonly message: string }

/** Page-composed, synthetic-only controller contract. No App/transport imports. */
export interface AStageSpecialMockController {
  load(): Promise<AStageSpecialView>
  execute(action: AStageSpecialAction): Promise<AStageSpecialOutcome>
  recoverCompleted(originalSummary: string): Promise<AStageSpecialOutcome>
}
export type AStageSpecialMockControllerFactory = (options: {
  readonly kind: AStageSpecialKind
  readonly workOrderId: string
  readonly getActor: () => AStageMockActor | null
}) => AStageSpecialMockController
