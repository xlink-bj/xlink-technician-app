import { describe, expect, it, vi } from 'vitest'
import { isUnapprovedR1QuotationStageMutationPath } from '@adapters/api/uni-api-command-transport'
import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'
import type { ApiCommandTransport } from '@adapters/api/technician-api-commands'

describe('quotation versus official Order runtime boundary',()=>{
  it('runtime-fences type0 quotation mutation and type1 Order confusion',async()=>{
    expect(isUnapprovedR1QuotationStageMutationPath('basic/order/creatQuotation')).toBe(true)
    expect(isUnapprovedR1QuotationStageMutationPath('basic/order/upsert')).toBe(false)
    const execute=vi.fn()
    const adapter=createQuotationOrderCommandAdapter({execute} as ApiCommandTransport)
    const blocked=await adapter.upsertOfficialOrder({
      order:{type:0,serviceAppointmentId:'synthetic-work-order',productIds:'[]'}
    })
    expect(blocked.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })
})
