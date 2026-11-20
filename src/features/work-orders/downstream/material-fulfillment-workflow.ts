import type { DeliveryBatchRead, MaterialFulfillmentScope, MaterialRequestRead } from './material-fulfillment-read'

export type MaterialDemoGrant = 'read' | 'order' | 'receive' | 'both'
export type MaterialDemoTarget = Readonly<{ workOrderId: string; requestId: string; batchId: string }>
export type MaterialDemoReceipt = Readonly<MaterialDemoTarget & { id: string }>

export interface MaterialDemoOrder {
  readonly request: MaterialRequestRead
  readonly batch: DeliveryBatchRead
  readonly receiptState: 'none' | 'unknown' | 'recorded'
}

export function hasMaterialDemoOrderGrant(grant: MaterialDemoGrant): boolean {
  return grant === 'order' || grant === 'both'
}

export function hasMaterialDemoReceiveGrant(grant: MaterialDemoGrant): boolean {
  return grant === 'receive' || grant === 'both'
}

interface LocalMaterialDemoRecord {
  readonly request: MaterialRequestRead
  readonly batch: DeliveryBatchRead
  receipt: {
    readonly original: MaterialDemoReceipt
    skipFirstLookup: boolean
    visible: boolean
  } | null
}

/** One in-memory transaction for the exact synthetic work order. The grant
 * choices apply only to this fixture. They carry no server role semantics. */
export function createMaterialFulfillmentWorkflow(workOrderId: string, enabled: () => boolean) {
  let actorScope: string | null = null
  let record: LocalMaterialDemoRecord | null = null

  return function bind(
    currentScope: () => MaterialFulfillmentScope | null,
    currentGrant: () => MaterialDemoGrant,
  ) {
    function authorized(): boolean {
      const scope = currentScope()
      if (!enabled() || !scope?.actorScope || scope.workOrderId !== workOrderId) return false
      if (actorScope !== scope.actorScope) {
        actorScope = scope.actorScope
        record = null
      }
      return true
    }

    function readOrder(targetWorkOrderId: string): MaterialDemoOrder | null {
      if (targetWorkOrderId !== workOrderId || !authorized() || !record) return null
      const receiptState = !record.receipt ? 'none' : record.receipt.visible ? 'recorded' : 'unknown'
      const arrival = receiptState === 'none' ? 'in_transit' : receiptState === 'recorded' ? 'arrived' : undefined
      return { request: record.request, batch: { ...record.batch, arrival }, receiptState }
    }

    function submitOrder(targetWorkOrderId: string, quantity: number) {
      if (targetWorkOrderId !== workOrderId || !authorized() || !hasMaterialDemoOrderGrant(currentGrant())) return 'denied' as const
      if (record) return 'already-submitted' as const
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return 'invalid-quantity' as const

      const request: MaterialRequestRead = Object.freeze({
        id: 'CL-DEMO-001',
        workOrderId,
        materials: Object.freeze([Object.freeze({ name: '高分子防水卷材', quantity, unit: '卷' })]),
      })
      record = {
        request,
        batch: Object.freeze({ id: 'PS-DEMO-001', workOrderId, requestId: request.id }),
        receipt: null,
      }
      return 'submitted' as const
    }

    function matchingRecord(target: MaterialDemoTarget): LocalMaterialDemoRecord | null {
      return target.workOrderId === workOrderId && authorized() && record?.request.id === target.requestId
        && record.batch.id === target.batchId ? record : null
    }

    function confirmReceipt(target: MaterialDemoTarget, delayed: boolean) {
      const current = matchingRecord(target)
      if (!current || !hasMaterialDemoReceiveGrant(currentGrant())) return 'denied' as const
      if (current.receipt) return 'already-recorded' as const
      current.receipt = {
        original: Object.freeze({ id: 'SH-DEMO-001', workOrderId, requestId: current.request.id, batchId: current.batch.id }),
        skipFirstLookup: delayed,
        visible: !delayed,
      }
      return delayed ? 'unknown' as const : 'recorded' as const
    }

    function readReceipt(target: MaterialDemoTarget): MaterialDemoReceipt | 'unknown' | null {
      const receipt = matchingRecord(target)?.receipt
      if (!receipt) return null
      if (receipt.skipFirstLookup) {
        receipt.skipFirstLookup = false
        return 'unknown'
      }
      receipt.visible = true
      return receipt.original
    }

    return { readOrder, submitOrder, confirmReceipt, readReceipt }
  }
}

export type BindMaterialFulfillmentWorkflow = ReturnType<typeof createMaterialFulfillmentWorkflow>
