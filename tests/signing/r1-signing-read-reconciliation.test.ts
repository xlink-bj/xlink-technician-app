import { describe, expect, it } from 'vitest'
import { reconcileR1SigningRead } from '@features/work-orders/signing/r1-signing-read-reconciliation'
import type { QuotationOrderBrowseItem, R1ScopedContractSummary } from '@shared/ports'

const order = (state: number | undefined): Pick<QuotationOrderBrowseItem, 'id' | 'type' | 'processState'> =>
  ({ id: 'order-001', type: 1, ...(state === undefined ? {} : { processState: state }) })
const contract = (status: string | undefined, extras: Partial<R1ScopedContractSummary> = {}): R1ScopedContractSummary => ({
  id: 'contract-001', orderId: 'order-001', serviceAppointmentId: 'workorder-001',
  state: 1, ...(status === undefined ? {} : { contractStatus: status }), ...extras,
})
const fetched = (items: readonly R1ScopedContractSummary[]) => ({ state: 'succeeded' as const, items })

describe('R1 sign/read side reconciliation (zero command authority)', () => {
  it('does not consider an unverified official Order a signable target', () => {
    expect(reconcileR1SigningRead(null, fetched([contract('10')])).stage).toBe('order_not_verified')
  })
  it.each(['idle','loading','failed_retryable','failed_terminal'] as const)(
    'does not infer contract absence from %s', state => {
      expect(reconcileR1SigningRead(order(0), { state, items: [] }).stage).toBe('contract_not_checked')
    })
  it('treats an empty bounded page as inconclusive', () => {
    expect(reconcileR1SigningRead(order(0), fetched([])).stage).toBe('contract_query_inconclusive')
  })
  it('shows a contract with status=2 only as pending', () => {
    expect(reconcileR1SigningRead(order(4), fetched([contract('2')])).stage).toBe('signing_in_progress')
  })
  it('shows -3 as an exception and forbids blind retry', () => {
    const result = reconcileR1SigningRead(order(4), fetched([contract('-3')]))
    expect(result.stage).toBe('signing_exception')
    expect(result.canRetrySignature).toBe(false)
    expect(result.detail).toContain('早退')
  })
  it('status=10 plus an unknown Order phase is a recorded fact, not a digital signature verification', () => {
    const result = reconcileR1SigningRead(order(undefined), fetched([contract('10', { signedDate: '2026-10-12' })]))
    expect(result.stage).toBe('record_signed')
    expect(result.detail).toContain('不是 PDF')
  })
  it.each([0, 4])('status=10 while processState=%s is a stage discrepancy', phase => {
    expect(reconcileR1SigningRead(order(phase), fetched([contract('10')])).stage).toBe('conflicting_records')
  })
  it.each(['0','5','-1','untrusted'] as const)('unknown status %s never becomes signed', status => {
    expect(reconcileR1SigningRead(order(0), fetched([contract(status)])).stage).toBe('contract_status_unknown')
  })
  it('a returned inactive contract record never claims signed', () => {
    expect(reconcileR1SigningRead(order(undefined), fetched([contract('10', { state: 0 })])).stage)
      .toBe('contract_status_unknown')
  })
  it('any two Contract versions for a single Order must be reviewed', () => {
    expect(reconcileR1SigningRead(order(undefined), fetched([
      contract('10'), contract('2', { id: 'contract-002' }),
    ])).stage).toBe('conflicting_records')
  })
  it('foreign Order rows invalidate summary even when one matching signed row exists', () => {
    expect(reconcileR1SigningRead(order(undefined), fetched([
      contract('10'), contract('10', { orderId: 'foreign-order' }),
    ])).stage).toBe('conflicting_records')
  })
  it('all stages keep all signing, SMS, cancellation and PDF-side commands disabled', () => {
    for (const m of [
      reconcileR1SigningRead(null, fetched([])),
      reconcileR1SigningRead(order(0), fetched([])),
      reconcileR1SigningRead(order(4), fetched([contract('2')])),
      reconcileR1SigningRead(order(4), fetched([contract('-3')])),
      reconcileR1SigningRead(order(undefined), fetched([contract('10')])),
    ]) {
      expect([m.canInitiateElectronicSignature, m.canInitiateOfflineSignature,
        m.canResendSms, m.canRetrySignature, m.canCancelContract]).toEqual([false,false,false,false,false])
    }
  })
})
