import type { QuotationEngineResult } from './engine'
export interface AStageMockQuoteActor {
  readonly userId: string
  readonly roleId: string
  readonly identity: string
}
export interface AStageMockQuoteOrderController {
  readStatus(engine: QuotationEngineResult): Promise<'ready' | 'blocked' | 'uncertain' | 'succeeded'>
  submit(engine: QuotationEngineResult): Promise<{
    readonly state: 'succeeded' | 'blocked' | 'uncertain'
    readonly message: string
  }>
  verifyPending(engine: QuotationEngineResult): Promise<{
    readonly state: 'confirmed' | 'not_found' | 'blocked' | 'unknown'
    readonly message: string
  }>
}
export type AStageMockQuoteOrderControllerFactory =
  (getActor: () => AStageMockQuoteActor | null) => AStageMockQuoteOrderController
