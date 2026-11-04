import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import {
  mockJourneyNodes, mockJourneyOfficialOrderId, mockJourneyOrderWorkflowDefinitionId,
  mockJourneyQuotationId, mockJourneyWorkOrderId, resetMockJourney,
} from '@adapters/api/mock/journey'
import { mockQuotationCatalogServiceType, mockQuotationCatalogSourceType } from '@adapters/api/mock/quotation-catalog'
import { tryMockRead } from '@adapters/api/mock/router'
import * as mockRouter from '@adapters/api/mock/router'
import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createAStageMockQuoteOrderController, isAStageMockOrderEnabled } from '@app/a-stage-quotation-mock-ui'
import { evaluateQuotationDraft } from '@features/work-orders/quotation/engine'
import {
  appendQuotationGroup, appendQuotationSelection, createEmptyQuotationDraft,
  createQuotationGroup, upsertLocalQuotationMaterialSkuChoice,
} from '@features/work-orders/quotation/model'
import { reachMockQuotationForTest } from '../g4ux/mock-journey-test-fixture'
import type { StoragePort, StorageKey } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const local = new Map<string, unknown>()
const receipt = new Map<string, unknown>()
const actor = { userId: 'synthetic-user', roleId: 'synthetic-role', identity: 'actor:role:mock-order' }
const catalogScope = { sessionRef: 'synthetic-session', userId: actor.userId,
  roleId: actor.roleId, roleVersion: '1' }
const workflowPath = `workflow/startWorkflow/order/${mockJourneyQuotationId}/${mockJourneyOrderWorkflowDefinitionId}`
const receiptStorageKey = `quotation-to-order:v1:${mockJourneyWorkOrderId}:${mockJourneyNodes.quotation}`

function storage(): StoragePort {
  return {
    read: async (key: StorageKey) => ({ state: 'succeeded', data: receipt.get(key.key) ?? null }),
    write: async (key: StorageKey, value: unknown) => { receipt.set(key.key, value); return { state: 'succeeded' } },
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
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks()
})

async function evaluateMockQuote(input: { readonly sku?: 'black' | 'both' | 'none'; readonly includeMaterial?: boolean } = {}) {
  let draft = createEmptyQuotationDraft(mockJourneyWorkOrderId, mockJourneyNodes.quotation)
  draft = appendQuotationGroup(draft, createQuotationGroup('mock-flat-roof', {
    repairParts: ['repair-part-code-001'], partDescription: '平屋顶防水局部修缮', maintainAreaNum: '12',
  }))
  if (input.includeMaterial !== false) {
    draft = appendQuotationSelection(draft, 'mock-flat-roof', { kind: 'material',
      catalogId: input.sku ? 'mock-catalog-material-sealant' : 'mock-catalog-material-ordinary-1',
      label: '合成维修材料', unit: '支' }, 'mock-material-choice')
  }
  draft = appendQuotationSelection(draft, 'mock-flat-roof', { kind: 'procedure',
    catalogId: 'mock-catalog-procedure-seal', label: '檐口密封处理', unit: '处' }, 'mock-procedure-choice')
  if (input.sku === 'black' || input.sku === 'both') {
    draft = upsertLocalQuotationMaterialSkuChoice(draft, 'mock-flat-roof', 'mock-catalog-material-sealant', {
      skuId: 'mock-material-sku-black-2', quantity: input.sku === 'both' ? 2 : 2,
      attributes: { thickness: '2', color: 'black' },
    })
  }
  if (input.sku === 'both') {
    draft = upsertLocalQuotationMaterialSkuChoice(draft, 'mock-flat-roof', 'mock-catalog-material-sealant', {
      skuId: 'mock-material-sku-grey-3', quantity: 1,
      attributes: { thickness: '3', color: 'grey' },
    })
  }
  const catalog = createQuotationCatalogReadAdapter({
    async execute(request) {
      const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
      if (raw === null) throw new Error(`Mock catalog not owned: ${request.path}`)
      return raw
    },
  }, () => catalogScope, '1340835581184723420')
  return evaluateQuotationDraft({ draft, catalogRead: catalog, catalogContext: {
    workOrderId: asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
    serviceType: mockQuotationCatalogServiceType, sourceType: mockQuotationCatalogSourceType,
  } })
}

function controller(getActor: () => typeof actor | null = () => actor) {
  return createAStageMockQuoteOrderController({ storage: storage(), getActor })
}

describe('R1 type=0 quotation → type=1 Order DEV Mock flow', () => {
  it('blocks writes outside the exact quotation stage and synthetic role', async () => {
    const engine = await evaluateMockQuote()
    expect(isAStageMockOrderEnabled({ workOrderId: mockJourneyWorkOrderId,
      userId: actor.userId, roleId: actor.roleId })).toBe(false)
    expect((await controller().createQuote(engine)).state).toBe('blocked')
    await reachMockQuotationForTest()
    expect((await controller(() => ({ ...actor, roleId: 'foreign-role' })).createQuote(engine)).state).toBe('blocked')
    expect(local.has('xlink.dev.mock.journey.019.quotation.v1')).toBe(false)
  })

  it('uses R1 SKU unit prices, quantities and detail rows; catalog price is not treated as the quote total', async () => {
    await reachMockQuotationForTest()
    expect((await evaluateMockQuote({ sku: 'none' })).state).toBe('blocked')
    const engine = await evaluateMockQuote({ sku: 'black' })
    expect(engine).toMatchObject({ state: 'ready', pricing: { calcTotalPrice: {
      originPrice: 76.9, totalPrice: 76.9,
    } }, payload: { type: 1, totalPrice: 76.9 } })
    const details = JSON.parse(engine.payload!.bjProducts) as { orderList: Array<{ materials: { data: Array<Record<string, unknown>> } }> }
    expect(details.orderList[0]!.materials.data).toMatchObject([{
      _id: 'mock-material-sku-black-2', spuid: 'mock-catalog-material-sealant',
      price: 4.25, amount: 4.25, number: 2, totalAmount: 8.5,
    }])
    expect(details.orderList[0]!.materials.data[0]!.totalAmount).not.toBe(engine.pricing!.calcTotalPrice.totalPrice)
  })

  it('sums multiple selected SKU rows by each exact unit price and quantity', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote({ sku: 'both' })
    expect(engine).toMatchObject({ state: 'ready', pricing: { calcTotalPrice: {
      originPrice: 83.65, totalPrice: 83.65,
    }, fillOrder: { groups: [{ categoryTotals: { material: 15.25 } }] } } })
    const details = JSON.parse(engine.payload!.bjProducts) as {
      orderList: Array<{ materials: { data: Array<Record<string, unknown>> } }>
    }
    expect(details.orderList[0]!.materials.data.map(row => [row._id, row.price, row.number, row.totalAmount]))
      .toEqual([
        ['mock-material-sku-black-2', 4.25, 2, 8.5],
        ['mock-material-sku-grey-3', 6.75, 1, 6.75],
      ])
  })

  it('rejects unsupported discounts and totals that do not match the R1 pricing projection', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const send = vi.spyOn(mockRouter, 'tryMockCommand')
    const discounted = { ...engine, payload: { ...engine.payload!, discount: 0.9 } } as unknown as typeof engine
    expect((await controller().createQuote(discounted)).state).toBe('blocked')
    const changedTotal = { ...engine, payload: { ...engine.payload!, totalPrice: 1 } } as unknown as typeof engine
    expect((await controller().createQuote(changedTotal)).state).toBe('blocked')
    expect(send).not.toHaveBeenCalled()
    expect(local.has('xlink.dev.mock.journey.019.quotation.v1')).toBe(false)
  })

  it('persists type=0 quote, starts its workflow with the quote ID, then reads the distinct returned Order ID', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    expect(engine).toMatchObject({ state: 'ready', pricing: { calcTotalPrice: { originPrice: 107, totalPrice: 107 } } })
    const ui = controller()
    expect(await ui.readStatus(engine)).toBe('ready')
    expect((await ui.readMockOrder()).state).toBe('unavailable')

    const commands: Array<{ path: string; body?: Readonly<Record<string, unknown>> }> = []
    const actual = mockRouter.tryMockCommand
    vi.spyOn(mockRouter, 'tryMockCommand').mockImplementation(async (path, body) => {
      commands.push({ path, body })
      return actual(path, body)
    })
    expect(await ui.createQuote(engine)).toMatchObject({ state: 'quote_created' })
    const quoteResponse = await tryMockRead('basic/order/queryById', { id: mockJourneyQuotationId }, { latencyMs: 0 })
    expect(quoteResponse).toMatchObject({ data: {
      _id: mockJourneyQuotationId, type: 0, serviceAppointmentId: mockJourneyWorkOrderId,
      originPrice: 107, totalPrice: 107,
    } })
    expect(await ui.readStatus(engine)).toBe('quote_created')

    expect(await ui.convertQuoteToOrder(engine)).toMatchObject({ state: 'succeeded' })
    expect(await ui.readStatus(engine)).toBe('succeeded')
    expect(await ui.readMockOrder()).toMatchObject({ state: 'confirmed', order: {
      id: mockJourneyOfficialOrderId, type: 1, serviceAppointmentId: mockJourneyWorkOrderId,
      originPrice: 107, totalPrice: 107,
    } })
    expect(mockJourneyQuotationId).not.toBe(mockJourneyOfficialOrderId)
    expect(commands.map(row => row.path)).toEqual([
      'basic/order/creatQuotation', workflowPath, 'basic/order/upsert',
    ])
    const converted = JSON.parse(commands[2]!.body!.order as string) as Record<string, unknown>
    expect(converted).toMatchObject({ _id: mockJourneyQuotationId, type: 1,
      serviceAppointmentId: mockJourneyWorkOrderId, workflowId: 'mock-workflow-run-019-order' })
    expect(commands.some(row => row.path === 'workflow/process')).toBe(false)
    const orderList = await tryMockRead('basic/order/query', {
      'is:serviceAppointmentId|string#and': mockJourneyWorkOrderId,
      'is:type|integer#and': 1, page: 1, rows: 3,
    }, { latencyMs: 0 })
    expect(orderList).toMatchObject({ total: 1, data: [{ _id: mockJourneyOfficialOrderId }] })
    const contractList = await tryMockRead('basic/contract/query.do', {
      'is:serviceAppointmentId|string#and': mockJourneyWorkOrderId,
      'is:state|integer#or': '1', 'is:exts.contractStatus|string#or': '-2',
      sortField: 'createTime', sortOrder: 'desc', page: 1, rows: 3,
    }, { latencyMs: 0 })
    expect(contractList).toMatchObject({ total: 0, data: [] })

    resetMockCommandState()
    const reopened = controller()
    expect(await reopened.readStatus(engine)).toBe('succeeded')
    expect((await reopened.readMockOrder()).state).toBe('confirmed')
    expect((await reopened.convertQuoteToOrder(engine)).state).toBe('succeeded')
  })

  it('recovers a lost quote acknowledgement through exact readback without repeating creatQuotation', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const actual = mockRouter.tryMockCommand
    const calls: string[] = []
    vi.spyOn(mockRouter, 'tryMockCommand').mockImplementation(async (path, body) => {
      calls.push(path)
      const response = await actual(path, body)
      if (path === 'basic/order/creatQuotation') throw new Error('ACK lost after Mock persistence')
      return response
    })
    const ui = controller()
    expect((await ui.createQuote(engine)).state).toBe('uncertain')
    expect(await ui.readStatus(engine)).toBe('uncertain')
    expect(await ui.verifyPending(engine)).toMatchObject({ state: 'confirmed' })
    expect(await ui.readStatus(engine)).toBe('quote_created')
    expect((await ui.createQuote(engine)).state).toBe('quote_created')
    expect(calls.filter(path => path === 'basic/order/creatQuotation')).toHaveLength(1)
  })

  it('manually confirms a lost workflow acknowledgement before continuing; does not restart it', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const ui = controller()
    await ui.createQuote(engine)
    const actual = mockRouter.tryMockCommand
    const calls: string[] = []
    vi.spyOn(mockRouter, 'tryMockCommand').mockImplementation(async (path, body) => {
      calls.push(path)
      const response = await actual(path, body)
      if (path === workflowPath) throw new Error('workflow ACK lost')
      return response
    })
    expect((await ui.convertQuoteToOrder(engine)).state).toBe('uncertain')
    expect(await ui.verifyPending(engine)).toMatchObject({ state: 'confirmed' })
    expect(await ui.readStatus(engine)).toBe('quote_created')
    expect((await ui.convertQuoteToOrder(engine)).state).toBe('succeeded')
    expect(calls.filter(path => path === workflowPath)).toHaveLength(1)
    expect(calls.filter(path => path === 'basic/order/upsert')).toHaveLength(1)
  })

  it('keeps a lost Order acknowledgement ambiguous until exact Order identity/price readback confirms it', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const ui = controller()
    await ui.createQuote(engine)
    const actual = mockRouter.tryMockCommand
    const calls: string[] = []
    vi.spyOn(mockRouter, 'tryMockCommand').mockImplementation(async (path, body) => {
      calls.push(path)
      const response = await actual(path, body)
      if (path === 'basic/order/upsert') throw new Error('Order ACK lost after Mock persistence')
      return response
    })
    expect((await ui.convertQuoteToOrder(engine)).state).toBe('uncertain')
    expect(await ui.readStatus(engine)).toBe('uncertain')
    expect(await ui.verifyPending(engine)).toMatchObject({ state: 'confirmed' })
    expect(await ui.readStatus(engine)).toBe('succeeded')
    expect((await ui.convertQuoteToOrder(engine)).state).toBe('succeeded')
    expect(calls.filter(path => path === 'basic/order/upsert')).toHaveLength(1)
  })

  it('blocks a changed draft and a corrupt receipt instead of attaching them to an existing quote', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const ui = controller()
    await ui.createQuote(engine)
    const changed = await evaluateMockQuote({ includeMaterial: false })
    expect(await ui.readStatus(changed)).toBe('blocked')
    receipt.set(receiptStorageKey, { version: 1, state: 'succeeded', fingerprint: 'bad' })
    const reopened = controller()
    expect(await reopened.readStatus(engine)).toBe('blocked')
    expect((await reopened.convertQuoteToOrder(engine)).state).toBe('blocked')
  })

  it('keeps changed discount readbacks unverified and prevents another workflow or Order command', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const ui = controller()
    await ui.createQuote(engine)
    const quote = JSON.parse(String(local.get('xlink.dev.mock.journey.019.quotation.v1'))) as {
      exts: Record<string, unknown>
    }
    quote.exts.couponsVal = 12
    local.set('xlink.dev.mock.journey.019.quotation.v1', JSON.stringify(quote))
    const send = vi.spyOn(mockRouter, 'tryMockCommand')
    expect((await ui.convertQuoteToOrder(engine)).state).toBe('blocked')
    expect(send).not.toHaveBeenCalled()
    expect(local.has('xlink.dev.mock.journey.019.quote-workflow.v1')).toBe(false)
  })

  it('keeps a formerly confirmed Order uncertain when discount or exact readback identity changes', async () => {
    await reachMockQuotationForTest()
    const engine = await evaluateMockQuote()
    const ui = controller()
    await ui.createQuote(engine)
    await ui.convertQuoteToOrder(engine)
    const order = JSON.parse(String(local.get('xlink.dev.mock.journey.019.official-order.v1'))) as {
      exts: Record<string, unknown>
    }
    order.exts.couponsVal = 12
    local.set('xlink.dev.mock.journey.019.official-order.v1', JSON.stringify(order))
    const send = vi.spyOn(mockRouter, 'tryMockCommand')
    expect(await ui.readStatus(engine)).toBe('uncertain')
    expect((await ui.convertQuoteToOrder(engine)).state).toBe('uncertain')
    expect(send).not.toHaveBeenCalled()
  })
})
