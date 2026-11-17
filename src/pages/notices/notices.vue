<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备通知" />
  <view v-else-if="!canAccess" class="main-guard">
    <text>登录后查看通知</text><button @tap="openMainRoute('home')">返回登录</button>
  </view>
  <view v-else class="main-page notices-page">
    <view class="main-brandbar">
      <view><text class="main-brand">{{ homeBrand.name }}服务</text><text class="main-brand-title">通知</text></view>
      <AppIcon name="notification" :size="24" color="currentColor" aria-hidden="true" />
    </view>
    <view class="notice-content">
      <view class="notice-intro"><text class="notice-heading">工作消息，一目了然</text>
        <text class="notice-description">及时查看与您有关的工单动态</text></view>
      <text v-if="available" class="notice-demo">以下消息仅为本地开发演示</text>
      <text v-if="feedback" class="main-error" role="alert">{{ feedback }}</text>
      <view class="notice-filters" role="tablist" aria-label="通知筛选">
        <button v-for="option in filters" :key="option.key" class="notice-filter"
          :class="{ 'notice-filter--active': filter === option.key }"
          role="tab" :aria-selected="filter === option.key"
          :data-testid="`notice-filter-${option.key}`" @tap="filter = option.key">{{ option.label }}</button>
      </view>
      <template v-if="available && visibleNotices.length">
        <view v-for="group in groups" :key="group.day" class="notice-group">
          <text class="notice-day">{{ group.day }}</text>
          <button v-for="item in group.items" :key="item.id" class="main-list-row notice-card"
            :class="{ 'notice-card--read': notices.readIds.includes(item.id) }"
            :data-testid="`notice-${item.id}`" @tap="open(item.id)">
            <view class="notice-icon" :class="`notice-icon--${item.kind}`">
              <AppIcon :name="item.kind === 'schedule' ? 'appointment' : item.kind === 'info' ? 'order' : 'task'"
                :size="24" color="currentColor" aria-hidden="true" />
            </view>
            <view class="notice-card-copy">
              <view class="notice-card-heading"><text class="main-row-title">{{ item.title }}</text>
                <view v-if="!notices.readIds.includes(item.id)" class="notice-indicator" aria-label="未读" />
                <text class="main-row-time">{{ item.time }}</text></view>
              <text class="main-row-summary">{{ item.summary }}</text>
              <view v-if="item.workOrderId" class="notice-order"><text>{{ item.body }}</text></view>
              <text class="notice-link">查看详情 ›</text>
            </view>
          </button>
        </view>
      </template>
      <view v-else class="main-state notice-empty" role="status">
        <AppIcon name="unavailable" :size="28" color="currentColor" aria-hidden="true" />
        <text class="main-state-title">{{ available ? filter === 'all' ? '暂无通知' : filter === 'unread' ? '暂无未读通知' : '暂无已读通知' : '通知暂未接入' }}</text>
        <text class="main-state-copy">{{ available ? '可切换筛选查看其他消息' : '当前环境尚无通知读取服务，请通过工单查看任务。' }}</text>
        <button v-if="!available" class="main-secondary-action" @tap="openMainRoute('workOrders')">查看工单</button>
      </view>
    </view>
  </view>
  <AppMainNavigation v-if="canAccess" active="notices" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { hasAuthenticatedSession } from '@features/home/access'
import { openMainRoute } from '@app/main-navigation'
import { homeBrand } from '@brand-ui/home-brand'
import { localNotices, localNoticesAvailable, useLocalNoticeStore } from '@app/notices/local-notices'
import { useSessionStore } from '@shared/state'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import AppMainNavigation from '@app/components/AppMainNavigation.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
const session = useSessionStore()
const notices = useLocalNoticeStore()
const workOrders = useWorkOrderListStore()
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const available = localNoticesAvailable()
const filters = [{ key: 'all', label: '全部' }, { key: 'unread', label: '未读' }, { key: 'read', label: '已读' }] as const
type NoticeFilter = typeof filters[number]['key']
const filter = ref<NoticeFilter>('all')
const openingId = ref('')
const feedback = ref('')
let active = true
let navigationVersion = 0
function invalidateNavigation(): void {
  navigationVersion += 1
  openingId.value = ''
  feedback.value = ''
  filter.value = 'all'
}
const visibleNotices = computed(() => !available ? [] : localNotices.filter(item =>
  filter.value === 'all' || (notices.readIds.includes(item.id) === (filter.value === 'read'))))
const groups = computed(() => (['今天', '昨天'] as const).map(day => ({
  day, items: visibleNotices.value.filter(item => item.day === day),
})).filter(group => group.items.length))
watch([() => session.status, () => workOrderReadScopeKey(session.session)], () => {
  notices.ensureScope(session.session)
  invalidateNavigation()
}, { immediate: true, flush: 'sync' })
onShow(() => { active = true })
onHide(() => { active = false; invalidateNavigation() })
onBeforeUnmount(() => { active = false; invalidateNavigation() })
async function open(id: string): Promise<void> {
  if (openingId.value || !canAccess.value || !available || !localNotices.some(item => item.id === id)) return
  const scope = workOrderReadScopeKey(session.session)
  if (!scope) return
  const version = ++navigationVersion
  const isCurrent = () => active && canAccess.value && version === navigationVersion
    && scope === workOrderReadScopeKey(session.session)
  openingId.value = id
  feedback.value = ''
  try { await workOrders.navigateTo(`/pages/notices/detail?id=${encodeURIComponent(id)}`) }
  catch { if (isCurrent()) feedback.value = '通知暂时无法打开，请稍后重试' }
  finally { if (isCurrent()) openingId.value = '' }
}
</script>
<style lang="scss">@import '@brand-ui/main-pages.scss';</style>
