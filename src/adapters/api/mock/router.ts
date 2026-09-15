import { isBusinessMockMode, type BusinessMockMode } from './config'
import {
  isSyntheticWorkOrderId,
  mockOrdinaryListResponse,
  mockRepairPartsCascadeResponse,
  mockRoleFunctionResponse,
  mockSanodeListResponse,
  mockStatusOptionsResponse,
  mockWorkOrderActivityResponseFor,
  mockWorkOrderDetailResponseFor,
} from './fixtures'

export interface MockReadOptions {
  readonly latencyMs?: number
  /** Authenticated actor values used only to bind bounded fixture markers. */
  readonly actor?: MockReadActor | null
}

export interface MockReadActor {
  readonly userId?: string
  readonly roleId?: string
}

function normalizedPath(path: string): string {
  return path.replace(/^\/+/, '').split('?')[0]
}

/** Synthetic entity reads remain locally owned even when mock mode is off. */
export function isMockOwnedRead(
  path: string,
  requestData: Readonly<Record<string, unknown>> = {},
): boolean {
  const route = normalizedPath(path)
  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (route.startsWith(detailPrefix)) {
    try {
      return isSyntheticWorkOrderId(decodeURIComponent(route.slice(detailPrefix.length)))
    } catch {
      return false
    }
  }

  if (
    route === 'biz/action/query.do' &&
    requestData.bizType === 'serviceAppointment' &&
    typeof requestData.sid === 'string'
  ) {
    return isSyntheticWorkOrderId(requestData.sid)
  }

  return false
}

function clonedResponse<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mutableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Positive Detail fixtures use explicit synthetic identity markers so their
 * raw workflow shapes stay deterministic. In the running app, bind those
 * markers to the already-authenticated actor before the normal Adapter path.
 * This does not create or alter a SessionRef and leaves mismatch/unknown
 * scenarios untouched.
 */
function bindMockActorMarkers(raw: unknown, actor: MockReadActor | null | undefined): unknown {
  if (!actor?.userId && !actor?.roleId) return raw

  const envelope = mutableRecord(raw)
  const payload = mutableRecord(envelope?.data)
  const workflowNodes = payload?.workflowNode
  if (!Array.isArray(workflowNodes)) return raw

  for (const value of workflowNodes) {
    const node = mutableRecord(value)
    if (!node) continue

    if (actor.roleId) {
      const nodeDef = mutableRecord(node.nodeDef)
      if (nodeDef) {
        for (const key of ['userChoose', 'viewableRoleIds']) {
          const values = nodeDef[key]
          if (!Array.isArray(values)) continue
          nodeDef[key] = values.map((item) => item === 'synthetic-role' ? actor.roleId : item)
        }
      }
    }

    if (actor.userId && Array.isArray(node.handlerIds)) {
      node.handlerIds = node.handlerIds.map((item) => item === 'synthetic-user' ? actor.userId : item)
    }
  }

  return envelope
}

function emptyPageResponse(): unknown {
  return { data: [], page: 1, rows: 20, total: 0 }
}

const workOrderSearchFields = ['title', 'name', 'phone', 'address', 'describe', 'orderNum'] as const

function searchTerm(requestData: Readonly<Record<string, unknown>>): string | undefined {
  for (const field of workOrderSearchFields) {
    const value = requestData[`regex:${field}|string#or`]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return undefined
}

function rawSearchValue(item: unknown, field: string): unknown {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
  const record = item as Record<string, unknown>
  const nested = record.data
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    return (nested as Record<string, unknown>)[field]
  }
  return record[field]
}

function listResponse(
  mode: BusinessMockMode,
  response: unknown,
  requestData: Readonly<Record<string, unknown>>,
): unknown {
  if (mode === 'empty') return emptyPageResponse()
  const term = searchTerm(requestData)
  if (!term) return response
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return response
  const envelope = response as Record<string, unknown>
  if (!Array.isArray(envelope.data)) return response
  const needle = term.toLocaleLowerCase()
  const data = envelope.data.filter((item) =>
    workOrderSearchFields.some((field) => {
      const value = rawSearchValue(item, field)
      return typeof value === 'string' && value.toLocaleLowerCase().includes(needle)
    }),
  )
  return { ...envelope, data, total: data.length }
}

function matchedResponse(
  path: string,
  mode: BusinessMockMode,
  requestData: Readonly<Record<string, unknown>>,
): unknown | null {
  const route = normalizedPath(path)
  if (route === 'function/changeRole') return mockRoleFunctionResponse
  if (route === 'code/query' && requestData.valueOption === 'STATUS') {
    return mockStatusOptionsResponse
  }
  if (route === 'i/code/selectMultistageCode.do' && requestData.types === 'repairParts') {
    return mockRepairPartsCascadeResponse
  }
  if (
    route === 'biz/action/query.do' &&
    requestData.bizType === 'serviceAppointment' &&
    requestData.actionType === '1,2,3,4,5,6'
  ) {
    const workOrderId = typeof requestData.sid === 'string' ? requestData.sid : ''
    if (!isSyntheticWorkOrderId(workOrderId)) return null
    if (mode === 'empty') return { status: 1, data: [] }
    return mockWorkOrderActivityResponseFor(workOrderId)
  }
  if (route === 'basic/serviceAppointment/querySAWorkflowNode') {
    return listResponse(mode, mockSanodeListResponse, requestData)
  }
  if (route === 'basic/serviceAppointment/query') {
    return listResponse(mode, mockOrdinaryListResponse, requestData)
  }

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
  requestData: Readonly<Record<string, unknown>> = {},
  options: MockReadOptions = {},
): Promise<unknown | null> {
  const mode = isBusinessMockMode()
  if (mode === 'off') return null
  const response = matchedResponse(path, mode, requestData)
  if (response === null) return null
  await delay(options.latencyMs ?? 300)
  return bindMockActorMarkers(clonedResponse(response), options.actor)
}
