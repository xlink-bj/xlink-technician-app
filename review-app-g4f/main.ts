import { createSSRApp } from 'vue'

import { createApplication } from '@app/bootstrap'
import { setBusinessMockMode } from '@app/business-mock'
import type { AuthSessionPort, QuotationCatalogReadPort, QuotationOrderCommandPort, QuotationOrderRead, QuotationOrderReadPort, SessionSnapshot, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'
import { createDefaultQuotationCatalogReadPort, createDefaultTechnicianApiReadPort } from '@app/composition'
import App from './App.vue'
import { mockQuotationWorkflowNodeId } from '@adapters/api/mock'
import { createG4fReviewStorage, reviewScenarioFromLocation, seedG4fReviewDraft } from './quotation-scenarios'

const reviewSession: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('g4f-mock-review-session'),
  user: { id: asOpaqueId<'UserId'>('g4f-mock-review-user'), displayName: '演示技师' },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: '技术员' },
  capabilityNames: ['work-order.read', 'work-order.action'],
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

const authSession: AuthSessionPort = {
  startSession: async () => succeeded(reviewSession),
  restoreSession: async () => succeeded(reviewSession),
  getCurrentSession: () => reviewSession,
  endSession: async () => succeeded(undefined),
}

export function createApp() {
  // This root is development-only and hard-selects the existing bounded Mock
  // runtime. The synthetic session is local; it contains no credentials.
  setBusinessMockMode('data')
  const storage = createG4fReviewStorage()
  const scenario = reviewScenarioFromLocation()
  seedG4fReviewDraft(storage, scenario)
  const needsOrderReview = ['submit-ready', 'readback-pending', 'edit', 'unsupported-edit'].includes(scenario)
  const baseApiRead = createDefaultTechnicianApiReadPort(authSession)
  const apiRead: TechnicianApiReadPort = needsOrderReview ? new Proxy(baseApiRead, {
    get(target, property) {
      if (property === 'getWorkOrderDetail') {
        return async (id: Parameters<TechnicianApiReadPort['getWorkOrderDetail']>[0]) => {
          const result = await target.getWorkOrderDetail(id)
          if (result.state !== 'succeeded' || !result.data || !['submit-ready', 'readback-pending'].includes(scenario)) return result
          return {
            ...result,
            data: {
              ...result.data,
              workflowNodes: result.data.workflowNodes?.map((node) => node.id === mockQuotationWorkflowNodeId
                ? { ...node, childWorkflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>('synthetic-order-child-definition') }
                : node),
            },
          }
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) : baseApiRead
  const baseCatalog = createDefaultQuotationCatalogReadPort(authSession)
  const catalog: QuotationCatalogReadPort = needsOrderReview ? {
    listPackages: async (context) => baseCatalog.listPackages(context),
    getPackageDetail: async (packageId) => baseCatalog.getPackageDetail(packageId),
    listProcedures: async (context) => {
      const result = await baseCatalog.listProcedures(context)
      return result.state === 'succeeded' && result.data
        ? { ...result, data: { ...result.data, items: result.data.items.map((item) => ({ ...item, guideUnitPrice: 80, minimumGuideTotalPrice: 0 })) } }
        : result
    },
    listMaterials: async (context) => {
      const result = await baseCatalog.listMaterials(context)
      return result.state === 'succeeded' && result.data
        ? { ...result, data: { ...result.data, items: result.data.items.map((item) => ({ ...item, price: 35, servicePrice: 35, specification: '1kg' })) } }
        : result
    },
    listMeasures: async (context) => {
      const result = await baseCatalog.listMeasures(context)
      return result.state === 'succeeded' && result.data
        ? { ...result, data: { ...result.data, items: result.data.items.map((item) => ({ ...item, guideUnitPrice: 20, cost: 0 })) } }
        : result
    },
  } : baseCatalog
  const syntheticOrder = (unsupported = false): QuotationOrderRead => ({
    id: 'order-synthetic-review', type: 1, serviceAppointmentId: 'mock-work-order-018-quotation-foundation',
    state: 1, processState: 0, discount: 1, preferentialAmount: 0, coupons: unsupported ? 'synthetic-coupon' : '',
    bjProducts: { orderList: [{
      repairParts: ['repair-part-code-001'], partDescription: '合成屋面区域', maintainAreaNum: '12',
      projPackages: { data: [] },
      procedures: { data: [{ _id: 'mock-catalog-procedure-seal', name: 'Mock 施工工序 A', unit: '处', number: 1 }] },
      materials: { data: [{ _id: 'mock-catalog-material-sealant', name: 'Mock 材料 A', unit: '支', number: 2 }] },
      measures: { data: [{ _id: 'mock-catalog-measure-inspection', name: 'Mock 机措 A', unit: '次', number: 1 }] },
    }], addItems: { data: [] }, deleteItems: { data: [] } },
    replaceSnapshot: { _id: 'order-synthetic-review', type: 1, serviceAppointmentId: 'mock-work-order-018-quotation-foundation', productIds: '[]', exts: {}, otherAmount: 0 },
  })
  const quotationOrderRead: QuotationOrderReadPort = {
    getQuotationOrderById: async (id) => {
      if (id !== 'order-synthetic-review') return { state: 'failed_terminal' }
      return succeeded(syntheticOrder(scenario === 'unsupported-edit'))
    },
    listTypeOneOrdersForWorkOrder: async () => succeeded({ items: [], page: 1, pageSize: 3, totalCount: 0 }),
  }
  const counters = { dispatches: 0, workflowStarts: 0 }
  const quotationOrderCommand: QuotationOrderCommandPort = {
    startOrderWorkflow: async () => { counters.workflowStarts += 1; await new Promise((resolve) => setTimeout(resolve, 180)); return succeeded('workflow-synthetic-review') },
    upsertOfficialOrder: async () => { counters.dispatches += 1; await new Promise((resolve) => setTimeout(resolve, 650)); return succeeded('order-synthetic-review') },
  }
  if (typeof window !== 'undefined') Object.assign(window, { __G4F_REVIEW_ORDER_MUTATIONS__: counters })
  const application = createApplication({ authSession, apiRead, storage, quotationCatalogRead: catalog, quotationOrderCommand, quotationOrderRead })
  const app = createSSRApp(App)
  app.use(application.pinia)
  return { app }
}
