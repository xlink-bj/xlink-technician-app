import { isBusinessMockEnabled } from './config'
import {
  mockOrdinaryListResponse,
  mockRoleFunctionResponse,
  mockSanodeListResponse,
  mockWorkOrderDetailResponse,
  mockWorkOrderIds,
} from './fixtures'

export interface MockReadOptions {
  readonly latencyMs?: number
}

function normalizedPath(path: string): string {
  return path.replace(/^\/+/, '').split('?')[0]
}

function clonedResponse<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function matchedResponse(path: string): unknown | null {
  const route = normalizedPath(path)
  if (route === 'function/changeRole') return mockRoleFunctionResponse
  if (route === 'basic/serviceAppointment/querySAWorkflowNode') return mockSanodeListResponse
  if (route === 'basic/serviceAppointment/query') return mockOrdinaryListResponse

  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    const requestedId = decodeURIComponent(route.slice(detailPrefix.length))
    return requestedId === mockWorkOrderIds[0] ? mockWorkOrderDetailResponse : null
  }

  return null
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Returns a raw backend-shaped read response only for approved read routes.
 * A null result is an explicit fall-through to the real transport.
 */
export async function tryMockRead(
  path: string,
  _requestData: Readonly<Record<string, unknown>> = {},
  options: MockReadOptions = {},
): Promise<unknown | null> {
  if (!isBusinessMockEnabled()) return null
  const response = matchedResponse(path)
  if (response === null) return null
  await delay(options.latencyMs ?? 300)
  return clonedResponse(response)
}
