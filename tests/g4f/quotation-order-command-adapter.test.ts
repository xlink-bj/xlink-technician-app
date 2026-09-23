import { describe, expect, it, vi } from 'vitest'

import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'
import type { ApiCommandTransport } from '@adapters/api/technician-api-commands'

describe('G4-F Phase 1I official Order command adapter', () => {
  it('uses only the source-verified child Order workflow and type=1 upsert wire requests', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ status: 1, entity: { _id: 'workflow-synthetic' } })
      .mockResolvedValueOnce({ success: true, status: 1, data: { _id: 'order-synthetic' } })
    const adapter = createQuotationOrderCommandAdapter({ execute } as ApiCommandTransport)

    const workflow = await adapter.startOrderWorkflow({
      workOrderId: 'work-order-synthetic' as never,
      workflowDefinitionId: 'child-definition-synthetic' as never,
    })
    const order = { type: 1, serviceAppointmentId: 'work-order-synthetic', productIds: '[]' }
    const saved = await adapter.upsertOfficialOrder({ order })

    expect(workflow).toMatchObject({ state: 'succeeded', data: 'workflow-synthetic' })
    expect(saved).toMatchObject({ state: 'succeeded', data: 'order-synthetic' })
    expect(execute).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: 'workflow/startWorkflow/order/null/child-definition-synthetic',
      body: { saId: 'work-order-synthetic' },
    })
    expect(execute).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: 'basic/order/upsert',
      body: { order: JSON.stringify(order) },
    })
    expect(execute.mock.calls.some(([request]) => String(request.path).includes('workflow/process'))).toBe(false)
  })

  it('rejects type=0 before any Order write dispatch', async () => {
    const execute = vi.fn()
    const adapter = createQuotationOrderCommandAdapter({ execute } as ApiCommandTransport)
    const result = await adapter.upsertOfficialOrder({
      order: { type: 0, serviceAppointmentId: 'work-order-synthetic' },
    })
    expect(result.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })
})
