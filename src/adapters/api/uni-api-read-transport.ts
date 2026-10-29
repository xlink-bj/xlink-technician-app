import type { SessionRef } from '@shared/types'
import {
  isProductionReadOnlyReadAllowed,
  isProductionReadOnlyTarget,
  isProductionRoleMutationPath,
} from '@shared/config'

import {
  ApiReadTransportError,
  type ApiReadRequest,
  type ApiReadTransport,
} from './technician-api'
import { isMockOwnedRead, tryMockRead, type MockReadActor } from './mock'

export type UniApiRequestExecutor = (options: UniNamespace.RequestOptions) => unknown

export interface UniApiReadTransportOptions {
  readonly apiBaseUrl: string
  readonly getSessionRef: () => SessionRef | null
  readonly request?: UniApiRequestExecutor
  readonly timeoutMs?: number
  readonly mockLatencyMs?: number
  /** When Production was used for local authentication, no business network fallback is allowed. */
  readonly blockRealRequests?: boolean
  /** Supplies the real authenticated actor for bounded mock visibility markers. */
  readonly getMockActor?: () => MockReadActor | null
  /**
   * Defense-in-depth for Production basic/order/query only. A valid WorkOrder ID
   * is not proof of role authorization; absent callbacks must DENY, not skip.
   */
  readonly isOrderWorkOrderListedForCurrentSession?: (workOrderId: string) => boolean
  /** Current session, user, role and roleVersion fingerprint, never persisted. */
  readonly getOrderReadAuthorizationIdentity?: () => string | null
  /** Verified from a role-listed Work Order detail, never from a caller's node ID. */
  readonly isChildWorkflowParentListedForCurrentSession?: (nodeId: string) => boolean
  /** Identity must change on session, user, role or roleVersion changes. */
  readonly getChildWorkflowReadAuthorizationIdentity?: () => string | null
  /** Exact repeat FormDefinition + child/main Workflow run proven by the current role-scoped detail. */
  readonly isRepeatFormContextAuthorizedForCurrentSession?: (definitionId: string, runId: string) => boolean
  readonly getRepeatFormReadAuthorizationIdentity?: () => string | null
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function formEncode(body: Readonly<Record<string, string | number | boolean>>): string {
  return Object.entries(body)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function queryEncode(query: Readonly<Record<string, string>> | undefined): string {
  if (!query) return ''
  const encoded = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return encoded.length > 0 ? `?${encoded}` : ''
}

function defaultRequest(options: UniNamespace.RequestOptions): unknown {
  return uni.request(options)
}

function requestResponse(
  request: UniApiRequestExecutor,
  options: UniNamespace.RequestOptions,
): Promise<UniNamespace.RequestSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    try {
      request({
        ...options,
        success: resolve,
        fail: reject,
      })
    } catch (error) {
      reject(error)
    }
  })
}

function isSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300
}

function errorCategoryForStatus(
  statusCode: number,
): 'session_invalid' | 'authorization_denied' | 'network_retryable' | 'server_terminal' {
  if (statusCode === 401) return 'session_invalid'
  if (statusCode === 403) return 'authorization_denied'
  if (statusCode === 0 || statusCode >= 500) return 'network_retryable'
  return 'server_terminal'
}

export function createUniApiReadTransport(options: UniApiReadTransportOptions): ApiReadTransport {
  const request = options.request ?? defaultRequest

  return {
    async execute(input: ApiReadRequest): Promise<unknown> {
      const productionReadOnly = isProductionReadOnlyTarget(
        import.meta.env.VITE_XLINK_ENVIRONMENT,
        options.apiBaseUrl,
      )

      if (productionReadOnly && isProductionRoleMutationPath(input.path)) {
        // The backend persists Account.permissionRoleId when a single role is
        // selected. It is therefore not a read-only operation in Production.
        throw new ApiReadTransportError(
          'Production read-only mode blocks the persistent role-selection endpoint',
          'unsupported_capability',
        )
      }

      if (productionReadOnly && !isProductionReadOnlyReadAllowed(input)) {
        throw new ApiReadTransportError(
          'Production read-only mode blocks API reads without a verified safe route contract',
          'unsupported_capability',
        )
      }

      let orderReadGuard:
        | { readonly workOrderId: string; readonly sessionRef: SessionRef; readonly identity: string }
        | undefined
      // Even a syntactically bounded query must not be directly executable from
      // a generic transport without the real role-scoped WorkOrder membership.
      if (productionReadOnly && input.path === 'basic/order/query') {
        const workOrderId = input.body?.['is:serviceAppointmentId|string#and']
        let identity: string | null = null
        let listed = false
        try {
          identity = options.getOrderReadAuthorizationIdentity?.() ?? null
          listed = typeof workOrderId === 'string'
            && options.isOrderWorkOrderListedForCurrentSession?.(workOrderId) === true
        } catch {
          listed = false
        }
        if (typeof workOrderId !== 'string' || !identity || !identity.trim()
          || identity !== identity.trim() || !listed) {
          throw new ApiReadTransportError(
            'Production official Order read requires an active role-scoped WorkOrder authorization',
            'authorization_denied',
          )
        }
        const current = options.getSessionRef()
        if (!current) {
          throw new ApiReadTransportError('Authenticated session is required for API reads', 'session_invalid')
        }
        orderReadGuard = { workOrderId, sessionRef: current, identity }
      }

      let childWorkflowReadGuard:
        | { readonly parentNodeId: string; readonly sessionRef: SessionRef; readonly identity: string }
        | undefined
      const childPrefix = 'workflow/queryByParentWorkflowNodeId/'
      if (productionReadOnly && input.path.startsWith(childPrefix)) {
        const parentNodeId = input.path.slice(childPrefix.length)
        let identity: string | null = null
        let authorized = false
        try {
          identity = options.getChildWorkflowReadAuthorizationIdentity?.() ?? null
          authorized = options.isChildWorkflowParentListedForCurrentSession?.(parentNodeId) === true
        } catch {
          authorized = false
        }
        const current = options.getSessionRef()
        if (!current || !identity || !identity.trim() || identity !== identity.trim() || !authorized) {
          throw new ApiReadTransportError(
            'Production child Workflow read requires a role-listed Work Order and verified detail parent',
            'authorization_denied',
          )
        }
        childWorkflowReadGuard = { parentNodeId, sessionRef: current, identity }
      }

      let repeatReadGuard:
        | { readonly definitionId: string; readonly runId: string; readonly sessionRef: SessionRef; readonly identity: string }
        | undefined
      const repeatPrefix = 'biz/extForm/query/'
      if (productionReadOnly && input.path.startsWith(repeatPrefix)) {
        const definitionId = input.path.slice(repeatPrefix.length)
        const runId = input.body?.['is:workflowId|string#and']
        let identity: string | null = null
        let authorized = false
        try {
          identity = options.getRepeatFormReadAuthorizationIdentity?.() ?? null
          authorized = typeof runId === 'string'
            && options.isRepeatFormContextAuthorizedForCurrentSession?.(definitionId, runId) === true
        } catch { authorized = false }
        const current = options.getSessionRef()
        if (!current || !identity || !identity.trim() || identity !== identity.trim()
          || typeof runId !== 'string' || !authorized) {
          throw new ApiReadTransportError(
            'Production repeat FormData list requires a proven node and unchanged role-scoped session',
            'authorization_denied',
          )
        }
        repeatReadGuard = { definitionId, runId, sessionRef: current, identity }
      }

      const verifyChildWorkflowReadScope = (): void => {
        if (!childWorkflowReadGuard) return
        let identity: string | null = null
        let authorized = false
        try {
          identity = options.getChildWorkflowReadAuthorizationIdentity?.() ?? null
          authorized = options.isChildWorkflowParentListedForCurrentSession?.(childWorkflowReadGuard.parentNodeId) === true
        } catch {
          authorized = false
        }
        if (!authorized || identity !== childWorkflowReadGuard.identity
          || options.getSessionRef() !== childWorkflowReadGuard.sessionRef) {
          throw new ApiReadTransportError(
            'Production child Workflow authorization changed during read',
            'authorization_denied',
          )
        }
      }

      const verifyRepeatReadScope = (): void => {
        if (!repeatReadGuard) return
        let identity: string | null = null
        let authorized = false
        try {
          identity = options.getRepeatFormReadAuthorizationIdentity?.() ?? null
          authorized = options.isRepeatFormContextAuthorizedForCurrentSession?.(
            repeatReadGuard.definitionId, repeatReadGuard.runId,
          ) === true
        } catch { authorized = false }
        if (!authorized || identity !== repeatReadGuard.identity
          || options.getSessionRef() !== repeatReadGuard.sessionRef) {
          throw new ApiReadTransportError('Production repeat list authorization changed during read', 'authorization_denied')
        }
      }

      const sessionRef = options.getSessionRef()
      if (!sessionRef) {
        throw new ApiReadTransportError('Authenticated session is required for API reads', 'session_invalid')
      }

      const mockResponse = await tryMockRead(
        input.path,
        input.body ?? input.query ?? {},
        {
          ...(options.mockLatencyMs === undefined ? {} : { latencyMs: options.mockLatencyMs }),
          ...(options.getMockActor ? { actor: options.getMockActor() } : {}),
        },
      )
      if (mockResponse !== null) {
        verifyChildWorkflowReadScope()
        verifyRepeatReadScope()
        if (orderReadGuard) {
          let stillListed = false
          let identity: string | null = null
          try {
            stillListed = options.isOrderWorkOrderListedForCurrentSession?.(orderReadGuard.workOrderId) === true
            identity = options.getOrderReadAuthorizationIdentity?.() ?? null
          } catch { stillListed = false }
          if (!stillListed || identity !== orderReadGuard.identity
            || options.getSessionRef() !== orderReadGuard.sessionRef) {
            throw new ApiReadTransportError('Production Order authorization changed during read', 'authorization_denied')
          }
        }
        return mockResponse
      }
      if (isMockOwnedRead(input.path, input.body ?? input.query ?? {})) {
        throw new ApiReadTransportError('Synthetic mock read is disabled', 'server_terminal')
      }

      if (options.blockRealRequests === true) {
        throw new ApiReadTransportError(
          'Authenticated Mock-only development mode blocks all real business API reads',
          'unsupported_capability',
        )
      }

      const header: Record<string, string> = {
        Cookie: `JSESSIONID=${sessionRef}`,
      }
      if (input.method === 'POST') header['Content-Type'] = 'application/x-www-form-urlencoded'

      let response: UniNamespace.RequestSuccessCallbackResult
      try {
        response = await requestResponse(request, {
          url: `${endpointUrl(options.apiBaseUrl, input.path)}${queryEncode(input.query)}`,
          method: input.method,
          ...(input.method === 'POST' ? { data: formEncode(input.body ?? {}) } : {}),
          header,
          dataType: 'json',
          ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
        })
      } catch (error) {
        throw new ApiReadTransportError(
          error instanceof Error ? error.message : 'API read request failed',
          'network_retryable',
        )
      }

      if (orderReadGuard) {
        let stillListed = false
        let identity: string | null = null
        try {
          stillListed = options.isOrderWorkOrderListedForCurrentSession?.(orderReadGuard.workOrderId) === true
          identity = options.getOrderReadAuthorizationIdentity?.() ?? null
        } catch { stillListed = false }
        if (!stillListed || identity !== orderReadGuard.identity
          || options.getSessionRef() !== orderReadGuard.sessionRef) {
          throw new ApiReadTransportError('Production Order authorization changed during read', 'authorization_denied')
        }
      }

      verifyChildWorkflowReadScope()
      verifyRepeatReadScope()

      if (!isSuccessStatus(response.statusCode)) {
        throw new ApiReadTransportError(
          `API read request returned HTTP ${response.statusCode}`,
          errorCategoryForStatus(response.statusCode),
        )
      }

      return response.data
    },
  }
}
