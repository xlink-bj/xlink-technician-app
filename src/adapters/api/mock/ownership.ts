/**
 * Synthetic ownership is a route-policy contract, not a response fixture.
 * It MUST be evaluated even when Mock DATA is disabled, so synthetic IDs
 * never fall through into Beta/Production traffic.
 *
 * Extracted without changing route predicates from the legacy router.
 */
import {
  isSyntheticWorkOrderId,
  mockSyntheticDynamicFormDefinitionId,
  mockSurveyFormDefinitionId,
  mockR1AddFormCodeId,
  mockR1NoteFormDefinitionId,
} from './fixtures'
import { mockMaterialSkuSpuId } from './quotation-catalog'

/** Unknown mock-work-order IDs must fail locally. An absent fixture never
 * grants fall-through to an enabled real-write transport. */
function syntheticWorkOrderNamespace(value: unknown): boolean {
  return typeof value === 'string'
    && (isSyntheticWorkOrderId(value) || value.startsWith('mock-work-order-'))
}

export function normalizedPath(path: string): string {
  return path.replace(/^\/+/, '').split('?')[0]
}

export const quotationCatalogListRoutes = new Set([
  'biz/projPackage/queryWithRank',
  'biz/procedure/queryWithRank',
  'basic/material/queryWithRank',
  'biz/measure/queryWithRank',
])

/** Synthetic entity reads remain locally owned even when mock mode is off. */
export function isMockOwnedRead(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
): boolean {
  const route = normalizedPath(path)
  if (route === 'code/query' && requestData.parentId === mockR1AddFormCodeId) return true
  // This is an internal, synthetic-only route. It is always mock-owned so a
  // disabled Mock mode can never fall through to a real backend endpoint.
  if (route === '__mock/quotation/action-content') return true
  // A mock WorkOrder must never request a real Contract, even when the
  // independent R1 Contract read fixture has not been registered.
  if (route === 'basic/contract/query.do') {
    const primaryId = requestData['is:serviceAppointmentId|string#and']
    const alternativeId = requestData['is:workOrderId|string#and']
    if (syntheticWorkOrderNamespace(primaryId)
      || syntheticWorkOrderNamespace(alternativeId)) return true
  }
  // Synthetic SKU IDs must never fall through to a live backend if the
  // developer disables Mock after navigating to a saved local quotation.
  if (route === 'basic/material/query'
    && requestData.spuid === mockMaterialSkuSpuId) return true
  if (route === 'basic/material/query'
    && typeof requestData['in:spuid|array#and'] === 'string'
    && requestData['in:spuid|array#and'].split(',').includes(mockMaterialSkuSpuId)) return true
  // A synthetic Work Order must never become a real Order search, even when
  // this particular mock route has no safe fixture to return.
  if (
    route === 'basic/order/query'
    && typeof requestData['is:serviceAppointmentId|string#and'] === 'string'
    && syntheticWorkOrderNamespace(requestData['is:serviceAppointmentId|string#and'])
  ) return true
  if (
    route === 'basic/order/queryById'
    && typeof requestData.id === 'string'
    && (requestData.id.startsWith('mock-') || requestData.id.startsWith('order-synthetic-'))
  ) return true
  if (
    quotationCatalogListRoutes.has(route)
    && typeof requestData['in:serviceType|array#and'] === 'string'
    && requestData['in:serviceType|array#and'].startsWith('mock-')
  ) return true
  const packageDetailPrefix = 'biz/projPackage/findById/'
  if (route.startsWith(packageDetailPrefix)) {
    try {
      return decodeURIComponent(route.slice(packageDetailPrefix.length)).startsWith('mock-catalog-package-')
    } catch {
      return false
    }
  }
  if (
    route === 'biz/extField/query' &&
    typeof requestData.extId === 'string' &&
    (requestData.extId === mockSyntheticDynamicFormDefinitionId
      || requestData.extId === mockSurveyFormDefinitionId
      || requestData.extId === mockR1NoteFormDefinitionId)
  ) return true
  if (
    route.startsWith('biz/extForm/query/') &&
    (route.slice('biz/extForm/query/'.length) === mockSyntheticDynamicFormDefinitionId
      || route.slice('biz/extForm/query/'.length) === mockSurveyFormDefinitionId
      || route.slice('biz/extForm/query/'.length) === mockR1NoteFormDefinitionId)
  ) return true
  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    try {
      return syntheticWorkOrderNamespace(decodeURIComponent(route.slice(detailPrefix.length)))
    } catch {
      return false
    }
  }

  if (
    route === 'biz/action/query.do' &&
    requestData.bizType === 'serviceAppointment' &&
    typeof requestData.sid === 'string'
  ) {
    return syntheticWorkOrderNamespace(requestData.sid)
  }

  return false
}

export function isMockOwnedCommand(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
): boolean {
  const route = normalizedPath(path)
  // R1 special commands encode runtime/definition identity in the PATH;
  // their JSON EXTS body need not carry a WorkOrder sid. Never allow a mock
  // node or definition to escape into a configured real-write transport.
  if (/^workflowNode\/updateExts\/mock-workflow-node-/.test(route)
    || /^biz\/extForm\/remove\/mock-form-definition-/.test(route)
    || /^workflow\/startWorkflow\/order\/null\/mock-workflow-definition-/.test(route)) return true
  if (route === 'workflow/process'
    && typeof requestData.workflowNodeId === 'string'
    && requestData.workflowNodeId.startsWith('mock-workflow-node-')) return true
  // Official Order writes serialize their Work Order identity in the "order"
  // JSON field, not in sid/saId. A synthetic Order must never fall through to
  // the real command transport, including builds with real writes enabled.
  if (route === 'basic/order/upsert' && typeof requestData.order === 'string') {
    try {
      const order: unknown = JSON.parse(requestData.order)
      if (order && typeof order === 'object' && !Array.isArray(order)) {
        const workOrderId = (order as Record<string, unknown>).serviceAppointmentId
        if (syntheticWorkOrderNamespace(workOrderId)) return true
      }
    } catch {
      // Non-synthetic malformed payload handling remains with the adapter.
    }
  }
  const syntheticFormMutation =
    route === `biz/extForm/upsert/${mockSyntheticDynamicFormDefinitionId}`
    || route === `biz/extForm/upsert/${mockSurveyFormDefinitionId}`
  const values = [requestData.sid, requestData.saId]
  const serialized = requestData.dataStr
  if (typeof serialized === 'string') {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>
      values.push(parsed.sid)
    } catch {
      // A malformed command is still handled by the real adapter as a failure.
    }
  }
  return syntheticFormMutation || values.some(syntheticWorkOrderNamespace)
}

