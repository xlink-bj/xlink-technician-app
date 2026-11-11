import type { Ref } from 'vue'
import type { R1FileWireValue } from '@shared/types'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'

/** Create-only view. No persisted queue task is imported into a fresh session. */
export interface R1NormalFormFileSessionView {
  readonly revision: Ref<number>
  busy(): boolean
  message(): string
  values(fieldId: string): readonly R1FileWireValue[]
  canPick(fieldId: string, values: Readonly<Record<string, unknown>>): boolean
  /** Cached UI hint only. Saving still requires async queue verification. */
  ready(values: Readonly<Record<string, unknown>>): boolean
  /** Read-only queue inspection; never imports or deletes old session tasks. */
  inspect(): Promise<boolean>
  /** Explicit same-session cancellation and confirmed local-only cleanup. */
  cancel(): Promise<boolean>
  pick(fieldId: string, values: Readonly<Record<string, unknown>>): Promise<readonly R1FileWireValue[] | null>
  retry(fieldId: string, values: Readonly<Record<string, unknown>>): Promise<readonly R1FileWireValue[] | null>
  remove(fieldId: string, index: number, values: Readonly<Record<string, unknown>>): Promise<readonly R1FileWireValue[] | null>
  /** Explicit local cleanup; does not retry or delete any remote upload. */
  discardFailed(fieldId: string, values: Readonly<Record<string, unknown>>): Promise<readonly R1FileWireValue[] | null>
  dispose(): void
}

/** Trusted actions use this side only after independent exact-grant/reader
 * authorization. assertValues re-reads the queue; finalize follows verified save. */
export interface R1NormalFormFileSession extends R1NormalFormFileSessionView {
  assertValues(snapshot: R1NodeFormsSnapshot, normalizedValues: Readonly<Record<string, unknown>>): Promise<void>
  finalize(): Promise<void>
}
