/**
 * G4-F product review: strictly synthetic, no real request executor available.
 *
 * The ordinary dev Mock transport deliberately falls through to HTTP for
 * unmatched routes. The product UX preview must never do that.
 */
import {
  ApiReadTransportError,
  type ApiReadRequest,
  type ApiReadTransport,
} from '@adapters/api/technician-api'
import {
  isSyntheticWorkOrderId,
  mockCommandScenarioIds,
  mockQuotationWorkflowNodeId,
  mockWorkOrderDetailResponses,
  mockQuotationCatalogServiceType,
  mockQuotationCatalogSourceType,
  tryMockRead,
} from '@adapters/api/mock'

export interface ProductReviewActor {
  readonly userId: string
  readonly roleId: string
}

const packageListPaths = new Set([
  'biz/projPackage/queryWithRank',
  'biz/procedure/queryWithRank',
  'basic/material/queryWithRank',
  'biz/measure/queryWithRank',
])

/** Explicitly bounded to existing synthetic fixtures; never grant arbitrary reads. */
export function productReviewReadAllowed(request: ApiReadRequest, actor: ProductReviewActor): boolean {
  if (request.method !== 'POST') return false
  const path = request.path
  const body = request.body ?? {}
  if (path === 'function/changeRole') return body.roleIds === actor.roleId && actor.roleId.length > 0
  if (path === 'basic/serviceAppointment/querySAWorkflowNode' || path === 'basic/serviceAppointment/query') {
    return typeof body.page === 'number' && body.page >= 1
      && typeof body.rows === 'number' && body.rows >= 1 && body.rows <= 50
  }
  if (path === 'code/query') return body.valueOption === 'STATUS'
  if (path === 'i/code/selectMultistageCode.do') {
    return body.tenantId === 'synthetic-review-only'
      && (body.types === 'repairParts' || body.types === 'parts')
  }
  if (path.startsWith('basic/serviceAppointment/queryById/')) {
    const id = decodeSyntheticPathId(path, 'basic/serviceAppointment/queryById/')
    return id !== null && id === mockCommandScenarioIds.quotationFoundation && isSyntheticWorkOrderId(id)
  }
  if (path === 'biz/action/query.do') {
    return body.bizType === 'serviceAppointment'
      && body.sid === mockCommandScenarioIds.quotationFoundation
      && body.actionType === '1,2,3,4,5,6'
  }
  if (path === '__mock/quotation/action-content') {
    return body.workOrderId === mockCommandScenarioIds.quotationFoundation
      && typeof body.workflowNodeId === 'string'
      && body.workflowNodeId.startsWith('mock-')
  }
  if (packageListPaths.has(path)) {
    return body['in:serviceType|array#and'] === mockQuotationCatalogServiceType
      && (body.sourceType === undefined || body.sourceType === mockQuotationCatalogSourceType)
  }
  if (path.startsWith('biz/projPackage/findById/')) {
    const id = decodeSyntheticPathId(path, 'biz/projPackage/findById/')
    return id !== null && id.startsWith('mock-catalog-package-')
  }
  return false
}

function decodeSyntheticPathId(path: string, prefix: string): string | null {
  try {
    const id = decodeURIComponent(path.slice(prefix.length))
    return id && !id.includes('/') && !id.includes('?') && !id.includes('#') ? id : null
  } catch {
    return null
  }
}

export function createProductMockReadTransport(actor: ProductReviewActor): ApiReadTransport {
  return {
    async execute(request) {
      if (!productReviewReadAllowed(request, actor)) {
        throw new ApiReadTransportError(
          'This read is outside the isolated synthetic product-review allowlist',
          'authorization_denied',
        )
      }
      // Product review deliberately presents exactly one source-backed
      // synthetic quotation work order, mapped by the real API adapter.
      if (request.path === 'basic/serviceAppointment/querySAWorkflowNode') {
        const detail = mockWorkOrderDetailResponses[mockCommandScenarioIds.quotationFoundation]
        return {
          data: [{
            _id: mockQuotationWorkflowNodeId,
            state: 1,
            nodeDef: { nodeType: 'placeOrder', name: '报价', viewableRoleIds: [actor.roleId] },
            data: detail.data.serviceAppointment,
          }],
          page: 1,
          rows: 20,
          total: 1,
        }
      }
      const fixture = await tryMockRead(request.path, request.body ?? request.query ?? {}, {
        latencyMs: 0,
        actor: { userId: actor.userId, roleId: actor.roleId },
      })
      if (fixture === null) {
        // Crucially, no fallback to uni.request or createUniApiReadTransport.
        throw new ApiReadTransportError(
          'No synthetic response exists for the requested product-review read',
          'unsupported_capability',
        )
      }
      return fixture
    },
  }
}
