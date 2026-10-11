import { describe, expect, it, vi } from 'vitest'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'

const owner = 'synthetic-workorder-019'
const id = 'synthetic-official-order-a'
const validOrder = (overrides: Record<string, unknown> = {}) => ({
  _id: id, type: 1, serviceAppointmentId: owner,
  orderNumber: 'SYN-019', totalPrice: 220,
  ownerPhone: 'SECRET-PHONE-NOT-LEAK',
  customerIdentity: 'SECRET-CUSTOMER-NOT-LEAK',
  qiniuList: ['https://synthetic.invalid/private.pdf'],
  exts: { bjdPDFurl: 'https://synthetic.invalid/contract-private.pdf' },
  bjProducts: { orderList: [{
    repairParts: ['synthetic-roof'], partDescription: '合成屋面',
    projPackages: { data: [] }, procedures: { data: [] },
    materials: { data: [] }, measures: { data: [] },
  }] },
  ...overrides,
})
const adapter = (
  read: (request: ApiReadRequest) => Promise<unknown>,
  listed: (workOrderId: string) => boolean = () => true,
  identity: () => string | null = () => 'current-session:user:role:v1',
) => createQuotationOrderReadAdapter({ execute: read } as ApiReadTransport, listed, identity)

describe('M1 signing Order detail: explicit WorkOrder scoped sanitized READ-ONLY gate', () => {
  it('is DENY BY DEFAULT when no current authorization identity provider is configured', async () => {
    const execute = vi.fn(async () => ({ data: validOrder() }))
    const port = createQuotationOrderReadAdapter({ execute }, () => true)
    const result = await port.readScopedTypeOneOrderForSigningReview!(owner, id)
    expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'authorization_denied' } })
    expect(execute).not.toHaveBeenCalled()
  })

  it('is DENY BY DEFAULT without a currently role-listed WorkOrder', async () => {
    const execute = vi.fn(async () => ({ data: validOrder() }))
    const port = adapter(execute, () => false)
    expect((await port.readScopedTypeOneOrderForSigningReview!(owner, id)).state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('requires syntactically bounded exact WorkOrder and Order IDs, never an arbitrary query', async () => {
    const execute = vi.fn(async () => ({ data: validOrder() }))
    const port = adapter(execute)
    for (const [wo, order] of [
      ['../foreign', id], [owner, ''], [owner, '../another-order'], [owner, 'a'.repeat(101)],
      ['work order with spaces', id],
    ]) {
      expect((await port.readScopedTypeOneOrderForSigningReview!(wo, order)).state).toBe('failed_terminal')
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns only a sanitized type1 Order display projection, never legal/signing authority', async () => {
    const requests: ApiReadRequest[] = []
    const port = adapter(async (request) => {
      requests.push(request)
      return { data: validOrder() }
    })
    const result = await port.readScopedTypeOneOrderForSigningReview!(owner, id)
    expect(requests).toEqual([{
      method: 'POST', path: 'basic/order/queryById', body: { id },
    }])
    expect(result).toMatchObject({
      state: 'succeeded',
      data: {
        contractReadAuthorized: false, signingAuthorized: false,
        order: {
          id, type: 1, serviceAppointmentId: owner,
          displayNumber: 'SYN-019', totalPrice: 220,
          groups: [{ repairParts: ['synthetic-roof'] }],
          pdfState: 'present_no_access',
        },
      },
    })
    const json = JSON.stringify(result)
    for (const secret of [
      'SECRET-PHONE-NOT-LEAK', 'SECRET-CUSTOMER-NOT-LEAK',
      'private.pdf', 'contract-private.pdf', 'replaceSnapshot', 'qiniuList',
      'bjProducts', 'ownerPhone', 'contractId',
    ]) expect(json).not.toContain(secret)
  })

  it('rejects a different returned Order ID, even with the same WorkOrder', async () => {
    const read = vi.fn(async () => ({ data: validOrder({ _id: 'other-official-order' }) }))
    const result = await adapter(read).readScopedTypeOneOrderForSigningReview!(owner, id)
    expect(result?.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toContain('other-official-order')
  })

  it('rejects foreign WorkOrder ownership and non-type1 Order without any row disclosure', async () => {
    for (const overrides of [
      { serviceAppointmentId: 'other-wo' },
      { type: 0 },
      { type: null },
    ]) {
      const port = adapter(async () => ({ data: validOrder(overrides) }))
      const result = await port.readScopedTypeOneOrderForSigningReview!(owner, id)
      expect(result.state).toBe('failed_terminal')
      expect(JSON.stringify(result)).not.toContain('SECRET')
      expect(JSON.stringify(result)).not.toContain('other-wo')
    }
  })

  it('blocks response after role/version or session changes, even when WorkOrder remains listed', async () => {
    for (const change of ['role', 'session'] as const) {
      let current = 'current-session:user:role:v1'
      let release!: (value: unknown) => void
      const read = vi.fn(() => new Promise<unknown>(resolve => { release = resolve }))
      const port = adapter(read, () => true, () => current)
      const pending = port.readScopedTypeOneOrderForSigningReview!(owner, id)
      await Promise.resolve()
      current = change === 'role' ? 'current-session:user:role:v2' : 'replacement-session:user:role:v1'
      release({ data: validOrder() })
      const result = await pending
      expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'authorization_denied' } })
      expect(JSON.stringify(result)).not.toContain('SYN-019')
    }
  })

  it('blocks response after WorkOrder authorization is revoked mid-flight', async () => {
    let listed = true
    let release!: (value: unknown) => void
    const execute = vi.fn(() => new Promise<unknown>(resolve => { release = resolve }))
    const port = adapter(execute, () => listed)
    const pending = port.readScopedTypeOneOrderForSigningReview!(owner, id)
    listed = false
    release({ data: validOrder() })
    expect(await pending).toMatchObject({
      state: 'failed_terminal', error: { category: 'authorization_denied' },
    })
  })

  it('does not expose raw provider errors, Authorization objects or network error text', async () => {
    const secret = 'PRIVATE_AUTH_TOKEN_NEVER_LOG'
    const port = adapter(async () => { throw new Error(secret) })
    const result = await port.readScopedTypeOneOrderForSigningReview!(owner, id)
    expect(result.state).toBe('failed_retryable')
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('never fetches Contract, PDF, CodeService, workflow or mutation endpoints', async () => {
    const paths: string[] = []
    const port = adapter(async req => {
      paths.push(req.path)
      return { data: validOrder() }
    })
    await port.readScopedTypeOneOrderForSigningReview!(owner, id)
    expect(paths).toEqual(['basic/order/queryById'])
  })

  it('does not change old Quotation edit/readback getById authority contracts or port methods', async () => {
    const execute = vi.fn(async () => ({ data: validOrder() }))
    const port = createQuotationOrderReadAdapter({ execute }, () => true)
    const result = await port.getQuotationOrderById(id)
    expect(result.state).toBe('succeeded')
    expect(execute).toHaveBeenCalledOnce()
    // Deliberately keep old Quotation editing/reconciliation API separate;
    // it is NOT a permitted source for signing preview.
    expect((await port.readScopedTypeOneOrderForSigningReview!(owner, id)).state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledOnce()
  })
})
