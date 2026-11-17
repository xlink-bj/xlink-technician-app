<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备通知" />
  <view v-else class="main-page notice-detail-page">
    <view v-if="!canAccess" class="main-state"><text class="main-state-title">登录状态已失效</text>
      <button class="main-secondary-action" @tap="openMainRoute('home')">返回登录</button></view>
    <view v-else-if="!notice" class="main-state"><text class="main-state-title">无法查看这条通知</text>
      <text class="main-state-copy">通知不存在或当前环境未提供通知数据。</text></view>
    <template v-else><view class="main-page-intro"><text class="main-eyebrow">{{ notice.day }} {{ notice.time }}</text>
      <text class="main-title">{{ notice.title }}</text><text class="main-subtitle">{{ notice.body }}</text></view>
      <view v-if="notice.workOrderId" class="main-state notice-action">
        <text class="main-state-title">关联工单</text>
        <text class="main-state-copy">进入前会核对当前账号的工单可见性。</text>
        <button class="main-primary-action" :disabled="opening" @tap="openWorkOrder">
          {{ opening ? '正在核对…' : '查看工单' }}</button>
        <text v-if="feedback" class="main-error" role="alert">{{ feedback }}</text>
      </view></template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { openMainRoute } from '@app/main-navigation'
import { hasAuthenticatedSession } from '@features/home/access'
import { workOrderListActionFor } from '@features/work-orders/list-actions'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { workOrderDetailRouteFor } from '@features/work-orders/detail'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import { localNotices, localNoticesAvailable, useLocalNoticeStore } from '@app/notices/local-notices'
import { useSessionStore } from '@shared/state'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
const session = useSessionStore()
const notices = useLocalNoticeStore()
const workOrders = useWorkOrderListStore()
const id = ref('')
const opening = ref(false)
const feedback = ref('')
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const notice = computed(() => canAccess.value && localNoticesAvailable()
  ? localNotices.find(item => item.id === id.value) : undefined)
onLoad(query => { id.value = typeof query?.id === 'string' ? query.id : '' })
watch([notice, () => session.session], ([item]) => {
  notices.ensureScope(session.session)
  if (item) notices.markRead(item.id, session.session)
}, { immediate: true })

async function openWorkOrder(): Promise<void> {
  if (opening.value || !notice.value?.workOrderId || !canAccess.value) return
  opening.value = true
  feedback.value = ''
  const scope = workOrderReadScopeKey(session.session)
  const target = notice.value.workOrderId
  try {
    if (workOrders.loadState === 'loading') {
      await new Promise<void>(resolve => {
        let done = false
        const stop = watch(() => workOrders.loadState, state => {
          if (state !== 'loading' && !done) { done = true; stop(); resolve() }
        })
        setTimeout(() => { if (!done) { done = true; stop(); resolve() } }, 8000)
      })
    }
    if (workOrders.loadState === 'loading') {
      feedback.value = '工单仍在加载，请稍后重试。'; return
    }
    // A fresh scoped list establishes membership; never trust the notification's ID.
    if (workOrders.category !== 'all') await workOrders.selectCategory('all')
    else await workOrders.refresh()
    if (!scope || scope !== workOrderReadScopeKey(session.session)
      || workOrders.loadState !== 'succeeded') {
      feedback.value = '暂时无法核对工单权限，请稍后重试。'; return
    }
    const row = workOrders.items.find(item => String(item.id) === target)
    if (!row || !workOrderListActionFor(row, session.session).detailAccessible) {
      feedback.value = '当前账号无法查看关联工单。'; return
    }
    await workOrders.navigateTo(workOrderDetailRouteFor(row.id))
  } catch {
    if (scope === workOrderReadScopeKey(session.session)) feedback.value = '工单暂时无法打开，请稍后重试。'
  } finally { opening.value = false }
}
</script>
<style lang="scss">@import '@brand-ui/main-pages.scss';</style>
