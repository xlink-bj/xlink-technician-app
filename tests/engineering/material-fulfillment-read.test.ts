import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  materialArrivalLabel,
  useMaterialFulfillmentRead,
  type MaterialFulfillmentReadPort,
  type MaterialFulfillmentSnapshot,
} from '../../src/features/work-orders/downstream/material-fulfillment-read'

const workOrderId = 'mock-work-order-002'
const request = { id: 'request-001', workOrderId, materials: [{ name: '密封胶', quantity: 6, unit: '支' }] }
const batch = { id: 'batch-001', workOrderId, requestId: request.id, arrival: 'in_transit' } as const
const snapshot = { workOrderId, requests: [request], batches: [batch] }

function reader(read: MaterialFulfillmentReadPort) {
  const scope = ref<{ actorScope: string; workOrderId: string } | null>({ actorScope: 'local-scope', workOrderId })
  const effects = effectScope()
  const result = effects.run(() => useMaterialFulfillmentRead(() => scope.value, read))!
  return { ...result, scope, close: () => effects.stop() }
}

describe('same-work-order material and delivery read', () => {
  it('reads and rechecks the same batch, without accumulating records', async () => {
    const read = vi.fn<MaterialFulfillmentReadPort>()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, batches: [{ ...batch, arrival: 'arrived' }] })
    const view = reader(read)

    await view.read()
    expect(view.state.value).toEqual({ phase: 'ready', requests: [{ ...request, batches: [batch] }] })
    await view.read()
    expect(view.state.value).toEqual({
      phase: 'ready', requests: [{ ...request, batches: [{ ...batch, arrival: 'arrived' }] }],
    })
    expect(read.mock.calls).toEqual([[workOrderId, 'initial'], [workOrderId, 'recheck']])
    expect(materialArrivalLabel(undefined)).toBe('到货待核实')
    view.close()
  })

  it('distinguishes an empty read from a request without batches and a failed recheck', async () => {
    const read = vi.fn<MaterialFulfillmentReadPort>()
      .mockResolvedValueOnce({ workOrderId, requests: [], batches: [] })
      .mockRejectedValueOnce(new Error('Synthetic unavailable read'))
      .mockResolvedValueOnce({ ...snapshot, batches: [] })
    const view = reader(read)

    await view.read()
    expect(view.state.value).toEqual({ phase: 'ready', requests: [] })
    await view.read()
    expect(view.state.value).toEqual({ phase: 'failed', recheck: true })
    await view.read()
    expect(read.mock.calls.map(([, mode]) => mode)).toEqual(['initial', 'recheck', 'recheck'])
    expect(view.state.value).toEqual({ phase: 'ready', requests: [{ ...request, batches: [] }] })
    view.close()
  })

  it.each([
    { ...snapshot, workOrderId: 'another-work-order' },
    { ...snapshot, requests: [{ ...request, workOrderId: 'another-work-order' }] },
    { ...snapshot, requests: [request, request] },
    { ...snapshot, batches: [{ ...batch, requestId: 'unlisted-request' }] },
    { ...snapshot, batches: [{ ...batch, workOrderId: 'another-work-order' }] },
    { ...snapshot, batches: [batch, batch] },
  ])('fails closed on inconsistent work-order, request or batch identity %#', async (payload) => {
    const view = reader(async () => payload)
    await view.read()
    expect(view.state.value).toEqual({ phase: 'failed', recheck: false })
    view.close()
  })

  it.each(['role change', 'order change', 'lost membership', 'unmount'])(
    'drops an unresolved read after %s and suppresses duplicate reads', async (change) => {
      let release!: (snapshot: MaterialFulfillmentSnapshot) => void
      const read = vi.fn<MaterialFulfillmentReadPort>(() => new Promise(resolve => { release = resolve }))
      const view = reader(read)
      const pending = view.read()
      await view.read()
      expect(read).toHaveBeenCalledTimes(1)

      if (change === 'role change') view.scope.value = { workOrderId, actorScope: 'changed-scope' }
      else if (change === 'order change') view.scope.value = { workOrderId: 'another-work-order', actorScope: 'local-scope' }
      else if (change === 'lost membership') view.scope.value = null
      else view.close()

      release(snapshot)
      await pending
      expect(view.state.value).toEqual({ phase: 'idle' })
      view.close()
    },
  )
})
