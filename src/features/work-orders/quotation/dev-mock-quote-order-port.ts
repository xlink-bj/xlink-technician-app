import type { OrderFieldSession } from './order-field-session'
import type { QuotationEngineResult } from './engine'
export interface DevMockQuoteActor {
  readonly userId: string
  readonly roleId: string
  readonly identity: string
}
export interface DevMockQuoteOrderController {
  readonly fields?: OrderFieldSession
  readStatus(engine: QuotationEngineResult): Promise<'ready' | 'quote_created' | 'blocked' | 'uncertain' | 'succeeded'>
  createQuote(engine: QuotationEngineResult): Promise<{
    readonly state: 'quote_created' | 'succeeded' | 'blocked' | 'uncertain'
    readonly message: string
  }>
  convertQuoteToOrder(engine: QuotationEngineResult): Promise<{
    readonly state: 'quote_created' | 'succeeded' | 'blocked' | 'uncertain'
    readonly message: string
  }>
  verifyPending(engine: QuotationEngineResult): Promise<{
    readonly state: 'confirmed' | 'not_found' | 'blocked' | 'unknown'
    readonly message: string
  }>
}
export type DevMockQuoteOrderControllerFactory =
  (getActor: () => DevMockQuoteActor | null) => DevMockQuoteOrderController
