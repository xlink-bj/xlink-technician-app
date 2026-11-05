import type { OrderFieldRuntimeInput } from './order-extfield-runtime'
export interface OrderFieldDraft {
  readonly input: OrderFieldRuntimeInput
  readonly labels: Readonly<Record<string, string>>
  readonly revision: number
}
export interface OrderFieldSession {
  load(serviceType: string): Promise<OrderFieldDraft | null>
  save(values: Readonly<Record<string, unknown>>, expectedRevision: number): Promise<number | null>
  verifyCurrent(): Promise<boolean>
  current(): OrderFieldDraft | null
}
