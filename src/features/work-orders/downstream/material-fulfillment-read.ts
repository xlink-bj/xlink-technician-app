import { onScopeDispose, ref, watch } from 'vue'

// Presentation data for the offline review. The purchase and logistics wire contracts are pending.
export interface MaterialRequestRead {
  readonly id: string
  readonly workOrderId: string
  readonly materials: readonly {
    readonly name: string
    readonly quantity: number
    readonly unit: string
  }[]
}

export interface DeliveryBatchRead {
  readonly id: string
  readonly workOrderId: string
  readonly requestId: string
  readonly arrival?: 'in_transit' | 'arrived'
  readonly updatedAt?: string
}

export interface MaterialFulfillmentSnapshot {
  readonly workOrderId: string
  readonly requests: readonly MaterialRequestRead[]
  readonly batches: readonly DeliveryBatchRead[]
}

type MaterialRequestWithBatches = MaterialRequestRead & {
  readonly batches: readonly DeliveryBatchRead[]
}

export interface MaterialFulfillmentScope {
  readonly workOrderId: string
  readonly actorScope: string
}

export type MaterialFulfillmentReadPort = (
  workOrderId: string,
  mode: 'initial' | 'recheck',
) => Promise<MaterialFulfillmentSnapshot>

export type MaterialFulfillmentState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' | 'failed'; readonly recheck: boolean }
  | { readonly phase: 'ready'; readonly requests: readonly MaterialRequestWithBatches[] }

function scopedRequests(snapshot: MaterialFulfillmentSnapshot, workOrderId: string): MaterialRequestWithBatches[] {
  if (snapshot.workOrderId !== workOrderId) throw new Error('Material record scope mismatch')

  const byRequest = new Map<string, DeliveryBatchRead[]>()
  for (const request of snapshot.requests) {
    if (!request.id || request.workOrderId !== workOrderId || byRequest.has(request.id)) {
      throw new Error('Material request identity mismatch')
    }
    byRequest.set(request.id, [])
  }
  const batchIds = new Set<string>()
  for (const batch of snapshot.batches) {
    const batches = byRequest.get(batch.requestId)
    if (!batch.id || batch.workOrderId !== workOrderId || !batches || batchIds.has(batch.id)) {
      throw new Error('Delivery batch identity mismatch')
    }
    batchIds.add(batch.id)
    batches.push(batch)
  }
  return snapshot.requests.map(request => ({ ...request, batches: byRequest.get(request.id)! }))
}

export function materialArrivalLabel(arrival: DeliveryBatchRead['arrival']): string {
  switch (arrival) {
    case 'in_transit': return '配送中'
    case 'arrived': return '已到货'
    default: return '到货待核实'
  }
}

export function useMaterialFulfillmentRead(
  currentScope: () => MaterialFulfillmentScope | null,
  readSnapshot: MaterialFulfillmentReadPort,
) {
  const state = ref<MaterialFulfillmentState>({ phase: 'idle' })
  let generation = 0
  function clear() {
    generation += 1
    state.value = { phase: 'idle' }
  }
  watch([
    () => currentScope()?.workOrderId,
    () => currentScope()?.actorScope,
  ], clear, { flush: 'sync' })
  onScopeDispose(clear)

  async function read(): Promise<void> {
    const scope = currentScope()
    const phase = state.value
    if (!scope || phase.phase === 'loading') return
    const recheck = phase.phase === 'ready' || (phase.phase === 'failed' && phase.recheck)
    const ticket = ++generation
    const isCurrent = () => {
      if (ticket !== generation) return false
      const latest = currentScope()
      if (latest?.workOrderId === scope.workOrderId && latest.actorScope === scope.actorScope) return true
      clear()
      return false
    }
    state.value = { phase: 'loading', recheck }
    try {
      const result = await readSnapshot(scope.workOrderId, recheck ? 'recheck' : 'initial')
      if (isCurrent()) state.value = { phase: 'ready', requests: scopedRequests(result, scope.workOrderId) }
    } catch {
      if (isCurrent()) state.value = { phase: 'failed', recheck }
    }
  }

  return { state, read }
}
