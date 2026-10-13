import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import type { QuotationOrderBrowseGroup, QuotationOrderBrowseItem, QuotationOrderBrowseLine, QuotationOrderReadPort, SessionSnapshot } from '@shared/ports'
import type { OperationSnapshot, OperationState } from '@shared/types'
import { createOperationError } from '@shared/types'
import type { ReadPage } from '@shared/ports'

type BrowseState = Extract<OperationState, 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'>

function failure<T>(category: 'session_invalid' | 'server_terminal', message: string): OperationSnapshot<T> {
  return { state: 'failed_terminal', error: createOperationError(category, message) }
}

function authorizationIdentityKey(session: SessionSnapshot | null): string | null {
  if (!session) return null
  return JSON.stringify([
    session.sessionRef,
    session.user.id,
    session.currentRole?.id ?? null,
    session.roleVersion ?? null,
  ])
}

export const useQuotationOrderBrowseStore = defineStore('quotationOrderBrowse', () => {
  const state = ref<BrowseState>('idle')
  const items = ref<readonly QuotationOrderBrowseItem[]>([])
  const errorMessage = ref('')
  const fetchedSessionRef = ref<string | null>(null)
  const fetchedWorkOrderId = ref<string | null>(null)
  let fetchedAuthorizationIdentityKey: string | null = null
  let fetchedPageSize: 1 | 3 | null = null
  let fetchedPage: ReadPage<QuotationOrderBrowseItem> | null = null
  let port: QuotationOrderReadPort | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let stopWatchingAuthorizationIdentity: (() => void) | null = null
  let requestVersion = 0
  let inFlight: {
    readonly workOrderId: string
    readonly pageSize: 1 | 3
    readonly authorizationIdentityKey: string
    readonly promise: Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>
  } | null = null

  function configure(nextPort: QuotationOrderReadPort, sessionProvider: () => SessionSnapshot | null): void {
    stopWatchingAuthorizationIdentity?.()
    clear()
    port = nextPort
    getSession = sessionProvider
    stopWatchingAuthorizationIdentity = watch(
      () => authorizationIdentityKey(getSession()),
      (current, previous) => {
        if (current !== previous) clear()
      },
      { immediate: true },
    )
  }

  function clear(): void {
    requestVersion += 1
    inFlight = null
    state.value = 'idle'
    items.value = []
    errorMessage.value = ''
    fetchedSessionRef.value = null
    fetchedWorkOrderId.value = null
    fetchedAuthorizationIdentityKey = null
    fetchedPageSize = null
    fetchedPage = null
  }

  async function load(workOrderId: string, pageSize: 1 | 3 = 3): Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>> {
    const sessionAtStart = getSession()
    if (!sessionAtStart) return failure<ReadPage<QuotationOrderBrowseItem>>('session_invalid', '请先登录后查看当前账号可见的报价。')
    const authorizationIdentityAtStart = authorizationIdentityKey(sessionAtStart)
    if (!authorizationIdentityAtStart) return failure<ReadPage<QuotationOrderBrowseItem>>('session_invalid', '登录身份信息不完整，请重新加载报价记录。')
    if (!port) return failure<ReadPage<QuotationOrderBrowseItem>>('server_terminal', '报价只读服务尚未配置。')
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(workOrderId)) {
      return failure<ReadPage<QuotationOrderBrowseItem>>('server_terminal', '请从当前账号可见的工单详情进入报价记录。')
    }
    if (pageSize !== 1 && pageSize !== 3) {
      return failure<ReadPage<QuotationOrderBrowseItem>>('server_terminal', '仅允许限定长度的正式订单读取。')
    }
    if (state.value === 'succeeded'
      && fetchedPage
      && fetchedPageSize === pageSize
      && fetchedAuthorizationIdentityKey === authorizationIdentityAtStart
      && fetchedWorkOrderId.value === workOrderId) {
      return { state: 'succeeded', data: fetchedPage }
    }
    if (inFlight?.workOrderId === workOrderId
      && inFlight.pageSize === pageSize
      && inFlight.authorizationIdentityKey === authorizationIdentityAtStart) return inFlight.promise

    const currentRequest = ++requestVersion
    items.value = []
    state.value = 'loading'
    errorMessage.value = ''
    const readPort = port
    // Promise.resolve() also converts accidental synchronous port exceptions
    // into a sanitized retryable state, never leaving this store loading.
    const pending = Promise.resolve()
      .then(() => readPort.listTypeOneOrdersForWorkOrder(workOrderId, pageSize))
      .then((result): OperationSnapshot<ReadPage<QuotationOrderBrowseItem>> => {
        const currentSession = getSession()
        if (!currentSession || authorizationIdentityKey(currentSession) !== authorizationIdentityAtStart) {
          if (currentRequest === requestVersion) clear()
          return failure('session_invalid', '登录状态已变化，请重新加载报价记录。')
        }
        if (currentRequest !== requestVersion) {
          return failure('server_terminal', '报价读取已被新的请求替代，请重新加载。')
        }
        if (result.state === 'succeeded' && result.data) {
          const page = result.data
          const rows = page.items
          const seen = new Set<string>()
          const valid = Array.isArray(rows) && rows.length <= pageSize
            && rows.every((row) => {
              if (!row || row.type !== 1 || row.serviceAppointmentId !== workOrderId
                || typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id)) return false
              seen.add(row.id)
              return true
            })
          if (!valid) {
            state.value = 'failed_terminal'
            errorMessage.value = '报价记录的工单归属或数量异常，已停止展示。'
            return failure('server_terminal', '正式订单只读响应未通过工单归属、唯一性及分页校验。')
          }
          // Preserve the server's optional paging metadata; do NOT infer that
          // one page exhausts all Orders from the current ServiceAppointment.
          const accepted = { ...page, items: [...rows] }
          items.value = accepted.items
          fetchedSessionRef.value = currentSession.sessionRef
          fetchedWorkOrderId.value = workOrderId
          fetchedAuthorizationIdentityKey = authorizationIdentityAtStart
          fetchedPageSize = pageSize
          fetchedPage = accepted
          state.value = 'succeeded'
          errorMessage.value = ''
          return { state: 'succeeded', data: accepted }
        }
        state.value = result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
        errorMessage.value = result.error?.category === 'authorization_denied'
          ? '当前账号没有读取报价记录的权限。'
          : result.error?.category === 'session_invalid'
            ? '登录状态已失效，请重新登录。'
            : '暂时无法读取报价记录，请稍后重试。'
        return result.state === 'succeeded'
          ? failure('server_terminal', '正式订单读取缺少完整响应。')
          : result
      })
      .catch((): OperationSnapshot<ReadPage<QuotationOrderBrowseItem>> => {
        if (currentRequest !== requestVersion) {
          return failure('server_terminal', '报价读取已被新的请求替代，请重新加载。')
        }
        if (authorizationIdentityKey(getSession()) !== authorizationIdentityAtStart) {
          clear()
          return failure('session_invalid', '登录状态已变化，请重新加载报价记录。')
        }
        state.value = 'failed_retryable'
        errorMessage.value = '暂时无法读取报价记录，请稍后重试。'
        return {
          state: 'failed_retryable',
          error: createOperationError('network_retryable', '正式订单只读服务暂不可用。'),
        }
      })
      .finally(() => {
        if (currentRequest === requestVersion) inFlight = null
      })
    inFlight = { workOrderId, pageSize, authorizationIdentityKey: authorizationIdentityAtStart, promise: pending }
    return pending
  }

  return {
    state,
    items,
    errorMessage,
    fetchedSessionRef,
    fetchedWorkOrderId,
    configure,
    clear,
    load,
  }
})

export interface QuotationBrowseLineRow {
  readonly key: string
  readonly line: QuotationOrderBrowseLine
  readonly depth: number
}

export function quotationBrowseLineRows(group: QuotationOrderBrowseGroup): readonly QuotationBrowseLineRow[] {
  const rows: QuotationBrowseLineRow[] = []
  function visit(lines: readonly QuotationOrderBrowseLine[], depth: number, prefix: string): void {
    lines.forEach((line, index) => {
      const key = `${prefix}${index}:${line.kind}`
      rows.push({ key, line, depth })
      if (line.children.length > 0) visit(line.children, depth + 1, `${key}/`)
    })
  }
  visit(group.lines, 0, '')
  return rows
}
