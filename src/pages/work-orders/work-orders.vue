<template>
  <view v-if="!canAccess" class="guard-page">
    <text class="eyebrow">Technician App</text>
    <text class="title">Sign in required</text>
    <text class="subtitle">Return to Home to start an authenticated session.</text>
    <navigator class="back-link" url="/pages/index/index">Return to sign in</navigator>
  </view>

  <view v-else class="work-orders-page">
    <view class="list-header">
      <view class="header-copy">
        <text class="eyebrow">Technician Home</text>
        <text class="title">My Work Orders</text>
        <text class="subtitle">Assigned work orders</text>
      </view>
      <button class="refresh" :disabled="isLoading" @tap="refresh">
        {{ isLoading ? 'Loading…' : 'Refresh' }}
      </button>
    </view>

    <view v-if="workOrders.loadState === 'loading'" class="list-state">
      <text class="state-title">Loading work orders…</text>
    </view>

    <view v-else-if="workOrders.loadState === 'failed_retryable'" class="list-state">
      <text class="state-title">Work orders are temporarily unavailable.</text>
      <text class="state-detail">{{ workOrders.error?.message }}</text>
      <button class="retry" @tap="retry">Try again</button>
    </view>

    <view v-else-if="workOrders.loadState === 'failed_terminal'" class="list-state">
      <text class="state-title">Work orders could not be loaded.</text>
      <text class="state-detail">{{ workOrders.error?.message }}</text>
      <button class="retry" @tap="retry">Retry</button>
    </view>

    <view v-else-if="workOrders.loadState === 'succeeded' && workOrders.items.length === 0" class="list-state">
      <text class="state-title">No work orders to show.</text>
      <text class="state-detail">Refresh to check again.</text>
    </view>

    <view v-else-if="workOrders.loadState === 'succeeded'" class="list-content">
      <view v-for="item in workOrders.items" :key="String(item.id)" class="work-order-row">
        <text class="row-title">{{ item.title ?? 'Untitled work order' }}</text>
        <text class="row-note">Details become available in G4-C.</text>
      </view>
      <button v-if="workOrders.hasMore === true" class="retry" @tap="loadMore">Load more</button>
    </view>

    <view v-else class="list-state">
      <text class="state-title">Preparing work orders…</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

import { hasAuthenticatedSession } from '@features/home/access'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useSessionStore } from '@shared/state'

const session = useSessionStore()
const workOrders = useWorkOrderListStore()
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const isLoading = computed(() => workOrders.loadState === 'loading')

watch(
  () => session.status,
  (status) => {
    if (status === 'authenticated') void workOrders.refresh()
  },
  { immediate: true },
)

async function refresh(): Promise<void> {
  await workOrders.refresh()
}

async function retry(): Promise<void> {
  await workOrders.retry()
}

async function loadMore(): Promise<void> {
  await workOrders.loadMore()
}
</script>

<style>
.work-orders-page,
.guard-page {
  background: #f5f7fb;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 32rpx;
}

.list-header {
  align-items: flex-start;
  display: flex;
  gap: 20rpx;
  justify-content: space-between;
  margin: 12rpx auto 28rpx;
  max-width: 960rpx;
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.eyebrow,
.state-detail,
.row-note {
  color: #667085;
  font-size: 26rpx;
}

.title {
  color: #101828;
  font-size: 48rpx;
  font-weight: 700;
}

.subtitle {
  color: #667085;
  font-size: 30rpx;
}

.refresh,
.retry {
  background: #155eef;
  border-radius: 12rpx;
  color: #ffffff;
  font-size: 28rpx;
  margin: 0;
}

.refresh[disabled] {
  opacity: 0.55;
}

.list-state,
.list-content,
.guard-page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin: 0 auto;
  max-width: 960rpx;
}

.list-state,
.guard-page {
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

.state-title {
  color: #344054;
  font-size: 32rpx;
}

.work-order-row {
  background: #ffffff;
  border-radius: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 28rpx;
}

.row-title {
  color: #101828;
  font-size: 32rpx;
  font-weight: 600;
}

.back-link {
  color: #155eef;
  font-size: 30rpx;
}
</style>
