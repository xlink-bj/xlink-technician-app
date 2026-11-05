import type { MediaUploadTask, MediaUploadTaskId } from '@shared/types'
import type { OrderFieldRuntimeInput } from './order-extfield-runtime'
export interface OrderFieldDraft {
  readonly input: OrderFieldRuntimeInput
  readonly labels: Readonly<Record<string, string>>
  readonly readOnly?: boolean
  readonly revision: number
}
export interface OrderMediaSession {
  list(): Promise<readonly MediaUploadTask[]>
  pick(fieldId: string, valueKey: string): Promise<void>
  retry(taskId: MediaUploadTaskId): Promise<void>
  discard(taskId: MediaUploadTaskId): Promise<void>
  finalize(): Promise<boolean>
  verify(values: Readonly<Record<string, unknown>>): Promise<boolean>
}
export interface OrderFieldSession {
  readonly media?: OrderMediaSession
  freeze?(): void
  load(serviceType: string, stage?: 'placeOrder' | 'submitOrder'): Promise<OrderFieldDraft | null>
  save(values: Readonly<Record<string, unknown>>, expectedRevision: number): Promise<number | null>
  verifyCurrent(): Promise<boolean>
  current(): OrderFieldDraft | null
}
