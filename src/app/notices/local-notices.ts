import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { isBusinessMockDeveloperModeAvailable, isBusinessMockMode } from '@app/business-mock'
import { mockJourneyWorkOrderId } from '@shared/mock-journey-identity'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import type { SessionSnapshot } from '@shared/ports'
import { useSessionStore } from '@shared/state'

export interface LocalNotice {
  readonly id: string
  readonly day: '今天' | '昨天'
  readonly kind: 'work' | 'schedule' | 'info'
  readonly title: string
  readonly summary: string
  readonly body: string
  readonly time: string
  readonly workOrderId?: string
}

/** UI-only synthetic events. No remote notification read or acknowledgement exists yet. */
export const localNotices: readonly LocalNotice[] = [
  { id: 'mock-notice-work-1', day: '今天', kind: 'work', title: '有工单等待查看', summary: '查看当前可处理的现场任务',
    body: '请进入工单详情，核对当前任务和可执行动作。阅读这条通知不会处理工单。',
    time: '09:30', workOrderId: mockJourneyWorkOrderId },
  { id: 'mock-notice-service-1', day: '今天', kind: 'schedule', title: '服务提醒', summary: '处理前请确认工单信息',
    body: '作业前请以工单详情中的最新信息为准。', time: '08:30' },
  { id: 'mock-notice-stale-1', day: '昨天', kind: 'info', title: '工单可见性已变化', summary: '关联工单需重新核对',
    body: '此前的工单提醒可能已经失效。打开工单前需要重新确认当前账号权限。',
    time: '17:15', workOrderId: 'mock-work-order-no-longer-visible' },
]

export function localNoticesAvailable(): boolean {
  return import.meta.env.DEV === true && isBusinessMockDeveloperModeAvailable()
    && isBusinessMockMode() === 'data'
}

export const useLocalNoticeStore = defineStore('localNotices', () => {
  const activeSession = useSessionStore()
  const readIds = ref<string[]>([])
  const scope = ref<string | null>(null)
  // Invalidate even while the notification page is not mounted. The same
  // account may log in again with an identical read-scope key.
  watch([() => activeSession.status, () => workOrderReadScopeKey(activeSession.session)],
    ([status, next]) => {
      if (status !== 'authenticated' || !next || scope.value !== next) {
        readIds.value = []
        scope.value = status === 'authenticated' ? next : null
      }
    }, { immediate: true, flush: 'sync' })
  function ensureScope(session: SessionSnapshot | null): boolean {
    const next = workOrderReadScopeKey(session)
    if (scope.value !== next) { scope.value = next; readIds.value = [] }
    return next !== null
  }
  function markRead(id: string, session: SessionSnapshot | null): void {
    if (ensureScope(session) && localNotices.some(item => item.id === id)
      && !readIds.value.includes(id)) readIds.value = [...readIds.value, id]
  }
  return { readIds, ensureScope, markRead }
})
