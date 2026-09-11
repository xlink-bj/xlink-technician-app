<template>
  <view v-if="!canAccess" class="guard-page">
    <view class="guard-icon" aria-hidden="true">锁</view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="work-orders-page">
    <view class="list-shell">
      <view class="list-heading-row">
        <view class="list-heading-copy">
          <text class="page-title">工单</text>
          <text class="page-subtitle">当前范围内可查看的工单</text>
        </view>
      </view>

      <view v-if="workOrders.loadState === 'loading'" class="list-state loading-state">
        <view class="skeleton-list" aria-hidden="true">
          <view class="skeleton-row"><view class="skeleton-icon" /><view class="skeleton-copy"><view class="skeleton-line skeleton-line-long" /><view class="skeleton-line skeleton-line-short" /></view></view>
          <view class="skeleton-row"><view class="skeleton-icon" /><view class="skeleton-copy"><view class="skeleton-line skeleton-line-long" /><view class="skeleton-line skeleton-line-short" /></view></view>
          <view class="skeleton-row"><view class="skeleton-icon" /><view class="skeleton-copy"><view class="skeleton-line skeleton-line-long" /><view class="skeleton-line skeleton-line-short" /></view></view>
        </view>
        <text class="state-title">正在加载工单</text>
      </view>

      <view v-else-if="workOrders.loadState === 'failed_retryable'" class="list-state error-state">
        <view class="state-icon state-icon-error" aria-hidden="true">!</view>
        <text class="state-title">暂时无法加载工单</text>
        <text class="state-detail">请检查网络后重试。</text>
        <button class="state-action" @tap="retry">重新加载</button>
      </view>

      <view v-else-if="workOrders.loadState === 'failed_terminal'" class="list-state error-state">
        <view class="state-icon state-icon-error" aria-hidden="true">!</view>
        <text class="state-title">工单加载失败</text>
        <text class="state-detail">请稍后再试。</text>
        <button class="state-action" @tap="retry">再次尝试</button>
      </view>

      <view v-else-if="workOrders.loadState === 'succeeded' && workOrders.items.length === 0" class="list-state empty-state">
        <view class="state-icon state-icon-empty" aria-hidden="true">—</view>
        <text class="state-title">当前暂无工单</text>
        <text class="state-detail">当前范围内暂时没有可处理的工单，可稍后刷新再试。</text>
        <button class="state-action" @tap="refresh">刷新工单</button>
      </view>

      <view v-else-if="workOrders.loadState === 'succeeded'" class="list-content">
        <view class="content-caption">
          <text class="content-title">工单列表</text>
          <button class="content-refresh" :disabled="isLoading" @tap="refresh">
            {{ isLoading ? '刷新中' : '刷新' }}
          </button>
        </view>

        <navigator
          v-for="item in workOrders.items"
          :key="String(item.id)"
          class="work-order-row"
          :url="workOrderDetailRouteFor(item.id)"
        >
          <view class="row-leading" aria-hidden="true">
            <text>工</text>
          </view>
          <view class="row-copy">
            <text class="row-title">{{ item.displayNumber || '工单详情' }}</text>
            <text class="row-note">查看工单详情</text>
          </view>
          <text class="row-arrow" aria-hidden="true">›</text>
        </navigator>

        <button v-if="workOrders.hasMore === true" class="state-action load-more" @tap="loadMore">加载更多</button>
      </view>

      <view v-else class="list-state">
        <text class="state-title">正在准备工单</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

import { hasAuthenticatedSession } from '@features/home/access'
import { workOrderDetailRouteFor } from '@features/work-orders/detail'
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
  padding: 28rpx 24rpx calc(48rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.list-shell {
  margin: 0 auto;
  max-width: none;
}

.list-heading-row {
  align-items: flex-start;
  display: flex;
  padding: 12rpx 8rpx 30rpx;
}

.list-heading-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.back-link {
  color: #3970c9;
  font-size: 26rpx;
  font-weight: 800;
  line-height: 1.4;
  padding: 16rpx 0;
}

.content-refresh {
  background: transparent;
  border: 0;
  border-radius: 12rpx;
  color: #286bd5;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 1;
  margin: 0;
  min-height: 56rpx;
  padding: 0 12rpx;
}

.content-refresh[disabled] {
  opacity: 0.55;
}

.content-title {
  color: #1b2942;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.4;
}

.page-title {
  color: #12203a;
  font-size: 48rpx;
  font-weight: 900;
  letter-spacing: -0.5rpx;
  line-height: 1.2;
}

.page-subtitle {
  color: #71809a;
  font-size: 25rpx;
  line-height: 1.5;
  margin-top: 10rpx;
}

.list-state,
.list-content {
  display: flex;
  flex-direction: column;
}

.list-state {
  align-items: center;
  background: rgba(255, 255, 255, 0.88);
  border: 1rpx solid #e0e8f5;
  border-radius: 28rpx;
  box-sizing: border-box;
  justify-content: center;
  min-height: 420rpx;
  padding: 48rpx 36rpx;
  text-align: center;
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  width: 100%;
}

.skeleton-row {
  align-items: center;
  background: #f7f9fc;
  border: 1rpx solid #edf1f7;
  border-radius: 20rpx;
  display: flex;
  gap: 20rpx;
  min-height: 128rpx;
  padding: 24rpx;
}

.skeleton-icon,
.skeleton-line {
  background: #e2eaf7;
  border-radius: 999rpx;
}

.skeleton-icon {
  flex: 0 0 68rpx;
  height: 68rpx;
}

.skeleton-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16rpx;
}

.skeleton-line {
  height: 20rpx;
}

.skeleton-line-long {
  width: 72%;
}

.skeleton-line-short {
  width: 42%;
}

.loading-state .state-title {
  margin-top: 28rpx;
}

.state-icon,
.guard-icon {
  align-items: center;
  border-radius: 50%;
  display: flex;
  justify-content: center;
}

.state-icon {
  font-size: 40rpx;
  font-weight: 900;
  height: 104rpx;
  width: 104rpx;
}

.state-icon-error {
  background: #fff0ef;
  color: #d64545;
}

.state-icon-empty {
  background: #eaf2ff;
  color: #4d83dc;
}

.state-title,
.guard-title {
  color: #21304a;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.4;
}

.state-title {
  margin-top: 24rpx;
}

.state-detail,
.guard-copy {
  color: #7888a3;
  font-size: 26rpx;
  line-height: 1.6;
  margin-top: 12rpx;
}

.state-action {
  background: #1769df;
  border-radius: 16rpx;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 800;
  line-height: 1;
  margin: 28rpx 0 0;
  min-height: 80rpx;
  padding: 0 36rpx;
}

.content-caption {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 0 4rpx 16rpx;
}

.work-order-row {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #e0e8f5;
  border-left: 5rpx solid #3277ed;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 32rpx rgba(35, 75, 128, 0.08);
  box-sizing: border-box;
  display: flex;
  gap: 22rpx;
  margin-bottom: 18rpx;
  min-height: 152rpx;
  padding: 26rpx 20rpx;
  width: 100%;
}

.row-leading {
  align-items: center;
  background: linear-gradient(145deg, #5a93ff, #286bd5);
  border-radius: 18rpx;
  color: #ffffff;
  display: flex;
  flex: 0 0 76rpx;
  font-size: 29rpx;
  font-weight: 900;
  height: 76rpx;
  justify-content: center;
}

.row-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-title {
  color: #1b2942;
  font-size: 31rpx;
  font-weight: 900;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-note {
  color: #8a98ae;
  font-size: 24rpx;
  margin-top: 10rpx;
}

.row-arrow {
  color: #7d9ed3;
  flex: 0 0 auto;
  font-size: 44rpx;
  font-weight: 300;
  line-height: 1;
}

.load-more {
  align-self: center;
  margin-top: 8rpx;
}

.guard-page {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
}

.guard-icon {
  background: #eaf2ff;
  color: #1769df;
  font-size: 28rpx;
  font-weight: 900;
  height: 96rpx;
  width: 96rpx;
}

.guard-title {
  margin-top: 24rpx;
}

button::after {
  border: 0;
}
</style>
