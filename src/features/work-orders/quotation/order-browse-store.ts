import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { QuotationOrderBrowseGroup, QuotationOrderBrowseItem, QuotationOrderBrowseLine, QuotationOrderReadPort, SessionSnapshot } from '@shared/ports'
import type { OperationSnapshot, OperationState } from '@shared/types'
import { createOperationError } from '@shared/types'
import type { ReadPage } from '@shared/ports'

type BrowseState = Extract<OperationState, 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'>

function failure<T>(category: 'session_invalid' | 'server_terminal', message: string): OperationSnapshot<T> {
  return { state: 'failed_terminal', error: createOperationError(category, message) }
}

export const useQuotationOrderBrowseStore = defineStore('quotationOrderBrowse', () => {
  const state = ref<BrowseState>('idle')
  const items = ref<readonly QuotationOrderBrowseItem[]>([])
  const errorMessage = ref('')
  const fetchedSessionRef = ref<string | null>(null)
  const fetchedWorkOrderId = ref<string | null>(null)
  let port: QuotationOrderReadPort | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let requestVersion = 0
  let inFlight: { readonly workOrderId: string; readonly promise: Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>> } | null = null

  function configure(nextPort: QuotationOrderReadPort, sessionProvider: () => SessionSnapshot | null): void {
    clear()
    port = nextPort
    getSession = sessionProvider
  }

  function clear(): void {
    requestVersion += 1
    inFlight = null
    state.value = 'idle'
    items.value = []
    errorMessage.value = ''
    fetchedSessionRef.value = null
    fetchedWorkOrderId.value = null
  }

  async function load(workOrderId: string, pageSize: 1 | 3 = 3): Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>> {
    const sessionAtStart = getSession()
    if (!sessionAtStart) return failure<ReadPage<QuotationOrderBrowseItem>>('session_invalid', '请先登录后查看当前账号可见的报价。')
    if (!port) return failure<ReadPage<QuotationOrderBrowseItem>>('server_terminal', '报价只读服务尚未配置。')
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(workOrderId)) {
      return failure<ReadPage<QuotationOrderBrowseItem>>('server_terminal', '请从当前账号可见的工单详情进入报价记录。')
    }
    if (state.value === 'succeeded' && fetchedSessionRef.value === sessionAtStart.sessionRef && fetchedWorkOrderId.value === workOrderId) {
      return { state: 'succeeded', data: { items: items.value, pageSize: items.value.length } }
    }
    if (inFlight?.workOrderId === workOrderId) return inFlight.promise

    const currentRequest = ++requestVersion
    items.value = []
    state.value = 'loading'
    errorMessage.value = ''
    const readPort = port
    const pending = readPort.listTypeOneOrdersForWorkOrder(workOrderId, pageSize).then((result) => {
      if (currentRequest !== requestVersion) return result
      const currentSession = getSession()
      if (!currentSession || currentSession.sessionRef !== sessionAtStart.sessionRef) {
        clear()
        return failure<ReadPage<QuotationOrderBrowseItem>>('session_invalid', '登录状态已变化，请重新加载报价记录。')
      }
      if (result.state === 'succeeded' && result.data) {
        items.value = [...result.data.items].slice(0, 3)
        fetchedSessionRef.value = currentSession.sessionRef
        fetchedWorkOrderId.value = workOrderId
        state.value = 'succeeded'
        errorMessage.value = ''
        return { ...result, data: { ...result.data, items: items.value } }
      }
      state.value = result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
      errorMessage.value = result.error?.category === 'authorization_denied'
        ? '当前账号没有读取报价记录的权限。'
        : result.error?.category === 'session_invalid'
          ? '登录状态已失效，请重新登录。'
          : '暂时无法读取报价记录，请稍后重试。'
      return result
    }).finally(() => {
      if (currentRequest === requestVersion) inFlight = null
    })
    inFlight = { workOrderId, promise: pending }
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
