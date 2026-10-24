import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { mockJourneyNodes, mockJourneyWorkOrderId, resetMockJourney } from '@adapters/api/mock/journey'
import { mockQuotationCatalogServiceType, mockQuotationCatalogSourceType } from '@adapters/api/mock/quotation-catalog'
import { tryMockRead } from '@adapters/api/mock/router'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createAStageMockQuoteOrderController, isAStageMockOrderEnabled } from '@app/a-stage-quotation-mock-ui'
import { evaluateQuotationDraft } from '@features/work-orders/quotation/engine'
import { appendQuotationGroup, appendQuotationSelection, createEmptyQuotationDraft, createQuotationGroup } from '@features/work-orders/quotation/model'
import { reachMockQuotationForTest } from '../g4ux/mock-journey-test-fixture'
import type { StoragePort, StorageKey } from '@shared/ports'

const local = new Map<string, unknown>()
const receipt = new Map<string, unknown>()
const actor = { userId: 'synthetic-user', roleId: 'synthetic-role', identity: 'actor:role:mock-order' }
function storage(): StoragePort {
  return {
    read: async (key: StorageKey) => ({ state: 'succeeded', data: receipt.get(key.key) ?? null }),
    write: async (key: StorageKey, value: unknown) => {
      receipt.set(key.key, value)
      return { state: 'succeeded' }
    },
    remove: async (key: StorageKey) => { receipt.delete(key.key); return { state: 'succeeded' } },
  } as StoragePort
}
beforeEach(() => {
  local.clear(); receipt.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => local.get(key),
    setStorageSync: (key: string, value: unknown) => { local.set(key, value) },
    removeStorageSync: (key: string) => { local.delete(key) },
  })
  resetBusinessMockCache(); setBusinessMockMode('data')
  resetMockCommandState(); resetMockJourney()
})
afterEach(() => {
  resetBusinessMockCache(); resetMockCommandState()
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
})
async function evaluateMockQuote(catalogId = 'mock-catalog-material-ordinary-1') {
  let draft = createEmptyQuotationDraft(mockJourneyWorkOrderId, mockJourneyNodes.quotation)
  draft = appendQuotationGroup(draft, createQuotationGroup('mock-flat-roof', {
    repairParts: ['repair-part-code-001'], partDescription: '平屋顶防水局部修缮',
    maintainAreaNum: '12',
  }))
  draft = appendQuotationSelection(draft, 'mock-flat-roof', { kind: 'material',
    catalogId, label: '合成维修材料', unit: '件' }, 'mock-material-choice')
  draft = appendQuotationSelection(draft, 'mock-flat-roof', { kind: 'procedure',
    catalogId: 'mock-catalog-procedure-seal', label: '檐口密封处理', unit: '处' }, 'mock-procedure-choice')
  const catalog = createQuotationCatalogReadAdapter({
    async execute(request) {
      const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
      if (raw === null) throw new Error('Mock catalog not owned')
      return raw
    },
  })
  return evaluateQuotationDraft({ draft, catalogRead: catalog, catalogContext: {
    serviceType: mockQuotationCatalogServiceType, sourceType: mockQuotationCatalogSourceType,
  } })
}

describe('A priced Mock quotation → exact type=1 Order UI controller', () => {
  it('blocks all writes before quotation stage and for non-synthetic actor', async () => {
    expect(isAStageMockOrderEnabled({ workOrderId: mockJourneyWorkOrderId,
      userId: actor.userId, roleId: actor.roleId })).toBe(false)
    const ctx = createAStageMockQuoteOrderController({ storage: storage(), getActor: () => actor })
    expect((await ctx.submit(await evaluateMockQuote())).state).toBe('blocked')
    await reachMockQuotationForTest()
    const wrong = createAStageMockQuoteOrderController({ storage: storage(),
      getActor: () => ({ ...actor, roleId: 'foreign-role' }) })
    expect((await wrong.submit(await evaluateMockQuote())).state).toBe('blocked')
    expect(local.has('xlink.dev.mock.journey.019.official-order.v1')).toBe(false)
  })

  it('uses source catalog price and pricing/encoder to create exactly one persisted synthetic Order', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    expect(engine).toMatchObject({ state: 'ready', pricing: { calcTotalPrice: {
      originPrice: 107, totalPrice: 107,
    } }, payload: { type: 1, serviceAppointmentId: mockJourneyWorkOrderId, totalPrice: 107 } })
    const ui = createAStageMockQuoteOrderController({ storage: storage(), getActor: () => actor })
    expect(await ui.readStatus(engine)).toBe('ready')
    expect(await ui.submit(engine)).toMatchObject({ state: 'succeeded' })
    expect(await ui.readStatus(engine)).toBe('succeeded')
    resetMockCommandState()
    expect(await tryMockRead('basic/order/query', {
      'is:serviceAppointmentId|string#and': mockJourneyWorkOrderId,
      'is:type|integer#and': 1, page: 1, rows: 3,
    }, { latencyMs: 0 })).toMatchObject({ total: 1 })
    expect((await ui.submit(engine)).state).toBe('succeeded') // receipt reconciliation, no duplicate Order.
  })

  it('refuses SKU candidate without verified effective price; never supplies zero or a fabricated SKU amount', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote('mock-catalog-material-sealant')
    expect(engine.state).toBe('blocked')
    expect(engine.payload).toBeUndefined()
    const ui = createAStageMockQuoteOrderController({ storage: storage(), getActor: () => actor })
    expect(await ui.submit(engine)).toMatchObject({ state: 'blocked' })
    expect(local.has('xlink.dev.mock.journey.019.official-order.v1')).toBe(false)
  })

  it('fails closed on a corrupt pre-existing order receipt instead of offering a second create action', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    expect(engine.state).toBe('ready')
    receipt.set('quotation-order-receipt:v1:synthetic-user:mock-work-order-019-continuous-journey:mock-workflow-node-019-place-order',
      { version: 1, state: 'succeeded', fingerprint: 'corrupt' })
    const ui = createAStageMockQuoteOrderController({ storage: storage(), getActor: () => actor })
    expect(await ui.readStatus(engine)).toBe('blocked')
    expect((await ui.submit(engine)).state).not.toBe('succeeded')
    expect(local.has('xlink.dev.mock.journey.019.official-order.v1')).toBe(false)
  })
})
