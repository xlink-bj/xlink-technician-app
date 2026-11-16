<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备通知" />
  <view v-else-if="!canAccess" class="main-guard">
    <text>登录后查看通知</text><button @tap="openMainRoute('home')">返回登录</button>
  </view>
  <view v-else class="main-page notices-page">
    <view class="main-page-intro"><text class="main-eyebrow">消息中心</text><text class="main-title">通知</text>
      <text class="main-subtitle">重要提醒集中在这里，阅读不会处理业务</text></view>
    <view v-if="available" class="main-list">
      <button v-for="item in localNotices" :key="item.id" class="main-list-row" @tap="open(item.id)">
        <view class="notice-indicator" :class="{ 'notice-indicator--read': notices.readIds.includes(item.id) }" />
        <view class="main-list-copy"><text class="main-row-title">{{ item.title }}</text>
          <text class="main-row-summary">{{ item.summary }}</text></view>
        <text class="main-row-time">{{ item.time }}</text><text class="main-row-arrow">›</text>
      </button>
    </view>
    <view v-else class="main-state"><text class="main-state-title">通知暂未接入</text>
      <text class="main-state-copy">当前环境尚无通知读取服务，请通过工单查看任务。</text>
      <button class="main-secondary-action" @tap="openMainRoute('workOrders')">查看工单</button></view>
  </view>
  <AppMainNavigation v-if="canAccess" active="notices" />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { hasAuthenticatedSession } from '@features/home/access'
import { openMainRoute } from '@app/main-navigation'
import { localNotices, localNoticesAvailable, useLocalNoticeStore } from '@app/notices/local-notices'
import { useSessionStore } from '@shared/state'
import { useWorkOrderListStore } from '@features/work-orders/list'
import AppMainNavigation from '@app/components/AppMainNavigation.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
const session = useSessionStore()
const notices = useLocalNoticeStore()
const workOrders = useWorkOrderListStore()
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const available = localNoticesAvailable()
watch(() => session.session, value => notices.ensureScope(value), { immediate: true })
function open(id: string): void {
  if (!canAccess.value || !available || !localNotices.some(item => item.id === id)) return
  void workOrders.navigateTo(`/pages/notices/detail?id=${encodeURIComponent(id)}`)
}
</script>
<style lang="scss">@import '@brand-ui/main-pages.scss';</style>
