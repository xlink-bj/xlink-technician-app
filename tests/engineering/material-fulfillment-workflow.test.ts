import { describe, expect, it } from 'vitest'
import type { MaterialFulfillmentScope } from '../../src/features/work-orders/downstream/material-fulfillment-read'
import {
  createMaterialFulfillmentWorkflow, type MaterialDemoGrant, type MaterialDemoTarget,
} from '../../src/features/work-orders/downstream/material-fulfillment-workflow'

const workOrderId = 'mock-work-order-002'
const target: MaterialDemoTarget = { workOrderId, requestId: 'CL-DEMO-001', batchId: 'PS-DEMO-001' }

function fixture() {
  const access: { active: boolean; scope: MaterialFulfillmentScope | null; grant: MaterialDemoGrant } = {
    active: true, scope: { workOrderId, actorScope: 'synthetic-actor-1' }, grant: 'both',
  }
  const bind = createMaterialFulfillmentWorkflow(workOrderId, () => access.active)
  const reopen = () => bind(() => access.scope, () => access.grant)
  return { access, workflow: reopen(), reopen }
}

describe('isolated material order and original delivery receipt', () => {
  it('checks separate order and receipt grants, while preserving authorized readback', () => {
    const { access, workflow } = fixture()
    access.grant = 'read'
    expect(workflow.submitOrder(workOrderId, 2)).toBe('denied')
    access.grant = 'receive'
    expect(workflow.submitOrder(workOrderId, 2)).toBe('denied')
    access.grant = 'order'
    expect(workflow.submitOrder(workOrderId, 2)).toBe('submitted')
    expect(workflow.confirmReceipt(target, false)).toBe('denied')
    expect(workflow.readOrder(workOrderId)?.batch.arrival).toBe('in_transit')
    access.grant = 'receive'
    expect(workflow.confirmReceipt(target, false)).toBe('recorded')
    access.grant = 'read'
    expect(workflow.readReceipt(target)).toEqual({ ...target, id: 'SH-DEMO-001' })
  })

  it('reads the original same-order submission and rejects a second submission', () => {
    const { workflow, reopen } = fixture()
    expect(workflow.submitOrder(workOrderId, 2)).toBe('submitted')
    expect(reopen().submitOrder(workOrderId, 5)).toBe('already-submitted')
    expect(reopen().readOrder(workOrderId)).toMatchObject({
      request: { id: target.requestId, workOrderId, materials: [{ quantity: 2 }] },
      batch: { id: target.batchId, workOrderId, requestId: target.requestId },
      receiptState: 'none',
    })
  })

  it('recovers an unknown receipt by lookup alone and reopens the same receipt', () => {
    const { workflow, reopen } = fixture()
    expect(workflow.submitOrder(workOrderId, 2)).toBe('submitted')
    expect(workflow.confirmReceipt(target, true)).toBe('unknown')
    expect(reopen().readOrder(workOrderId)).toMatchObject({ batch: { arrival: undefined }, receiptState: 'unknown' })
    expect(reopen().confirmReceipt(target, false)).toBe('already-recorded')
    expect(workflow.readReceipt(target)).toBe('unknown')
    expect(workflow.readOrder(workOrderId)?.receiptState).toBe('unknown')
    expect(reopen().readReceipt(target)).toEqual({ ...target, id: 'SH-DEMO-001' })
    expect(workflow.readOrder(workOrderId)).toMatchObject({ batch: { arrival: 'arrived' }, receiptState: 'recorded' })
    expect(workflow.readReceipt(target)).toEqual({ ...target, id: 'SH-DEMO-001' })
  })

  it.each([
    { ...target, workOrderId: 'another-work-order' },
    { ...target, requestId: 'CL-001' },
    { ...target, batchId: 'PS-002' },
  ])('rejects a mismatched order or batch before confirmation and receipt read %#', (wrongTarget) => {
    const { workflow } = fixture()
    expect(workflow.submitOrder(workOrderId, 2)).toBe('submitted')
    expect(workflow.confirmReceipt(wrongTarget, false)).toBe('denied')
    expect(workflow.readOrder(workOrderId)?.receiptState).toBe('none')
    expect(workflow.confirmReceipt(target, false)).toBe('recorded')
    expect(workflow.readReceipt(wrongTarget)).toBeNull()
    expect(workflow.readReceipt(target)).toMatchObject(target)
  })

  it('requires current work-order scope and a live DEV fixture before every operation', () => {
    const { access, workflow } = fixture()
    expect(workflow.submitOrder('other-work-order', 2)).toBe('denied')
    expect(workflow.submitOrder(workOrderId, 2)).toBe('submitted')
    access.active = false
    expect(workflow.readOrder(workOrderId)).toBeNull()
    expect(workflow.confirmReceipt(target, false)).toBe('denied')
    access.active = true
    access.scope = null
    expect(workflow.submitOrder(workOrderId, 2)).toBe('denied')
    expect(workflow.readReceipt(target)).toBeNull()
    access.scope = { workOrderId, actorScope: 'synthetic-actor-2' }
    expect(workflow.readOrder(workOrderId)).toBeNull()
    expect(workflow.confirmReceipt(target, false)).toBe('denied')
  })

  it.each([0, -1, 1.5, 100, Number.NaN])('rejects invalid quantity %s without creating an order', (quantity) => {
    const { workflow } = fixture()
    expect(workflow.submitOrder(workOrderId, quantity)).toBe('invalid-quantity')
    expect(workflow.readOrder(workOrderId)).toBeNull()
  })
})
