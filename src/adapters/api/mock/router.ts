import { isBusinessMockMode, type BusinessMockMode } from './config'
import {
  isSyntheticWorkOrderId,
  mockOrdinaryListResponse,
  mockRoleFunctionResponse,
  mockSanodeListResponse,
  mockWorkOrderDetailResponseFor,
} from './fixtures'

export interface MockReadOptions {
  readonly latencyMs?: number
}

function normalizedPath(path: string): string {
  return path.replace(/^\/+/, '').split('?')[0]
}

/** Synthetic detail paths remain locally owned even when mock mode is off. */
export function isMockOwnedRead(path: string): boolean {
  const route = normalizedPath(path)
  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (!route.startsWith(detailPrefix)) return false
  try {
    return isSyntheticWorkOrderId(decodeURIComponent(route.slice(detailPrefix.length)))
  } catch {
    return false
  }
}

function clonedResponse<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emptyPageResponse(): unknown {
  return { data: [], page: 1, rows: 20, total: 0 }
}

function listResponse(mode: BusinessMockMode, response: unknown): unknown {
  return mode === 'empty' ? emptyPageResponse() : response
}

function matchedResponse(path: string, mode: BusinessMockMode): unknown | null {
  const route = normalizedPath(path)
  if (route === 'function/changeRole') return mockRoleFunctionResponse
  if (route === 'basic/serviceAppointment/querySAWorkflowNode') {
    return listResponse(mode, mockSanodeListResponse)
  }
  if (route === 'basic/serviceAppointment/query') return listResponse(mode, mockOrdinaryListResponse)

  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    const requestedId = decodeURIComponent(route.slice(detailPrefix.length))
    if (isMockOwnedRead(route)) return mockWorkOrderDetailResponseFor(requestedId)
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
  const mode = isBusinessMockMode()
  if (mode === 'off') return null
  const response = matchedResponse(path, mode)
  if (response === null) return null
  await delay(options.latencyMs ?? 300)
  return clonedResponse(response)
}
