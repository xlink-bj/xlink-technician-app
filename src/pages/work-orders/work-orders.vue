<template>
  <view v-if="!canAccess" class="guard-page">
    <view class="guard-icon" aria-hidden="true">锁</view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="work-orders-page">
    <view class="list-shell">
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
        <view class="empty-illustration" aria-hidden="true">
          <view class="empty-illustration-halo" />
          <view class="empty-illustration-card" />
          <view class="empty-illustration-line" />
        </view>
        <text class="state-title">当前暂无工单</text>
        <text class="state-detail">当前范围内暂时没有可处理的工单，可稍后刷新再试。</text>
        <button class="state-action" @tap="refresh">刷新工单</button>
      </view>

      <view v-else-if="workOrders.loadState === 'succeeded'" class="list-content">
        <view class="content-caption">
          <view class="content-heading">
            <text class="content-kicker">工作范围</text>
            <text class="content-title">当前可见工单</text>
          </view>
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
            <view class="row-leading-glyph" />
          </view>
          <view class="row-body">
            <view class="row-head">
              <text v-if="item.displayNumber" class="row-meta">{{ item.displayNumber }}</text>
              <view v-else class="row-meta-spacer" aria-hidden="true" />
              <view class="row-arrow" aria-hidden="true">›</view>
            </view>
            <text v-if="item.customerName" class="row-title">{{ item.customerName }}</text>
            <view v-if="item.serviceAddress" class="row-address">
              <text class="row-address-icon" aria-hidden="true">⌖</text>
              <text class="row-address-copy">{{ item.serviceAddress }}</text>
            </view>
          </view>
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
  padding: 20rpx 24rpx calc(48rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.list-shell {
  margin: 0 auto;
  max-width: none;
}

.back-link {
  color: #3970c9;
  font-size: 26rpx;
  font-weight: 800;
  line-height: 1.4;
  padding: 16rpx 0;
}

.content-refresh {
  background: #edf4ff;
  border: 1rpx solid #d4e4ff;
  border-radius: 999rpx;
  color: #286bd5;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
  margin: 0;
  min-height: 64rpx;
  padding: 0 20rpx;
}

.content-refresh[disabled] {
  opacity: 0.55;
}

.content-title {
  color: #1b2942;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.4;
}

.content-heading {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.content-kicker {
  color: #8a98af;
  font-size: 21rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
  line-height: 1.3;
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

.empty-illustration {
  height: 116rpx;
  position: relative;
  width: 172rpx;
}

.empty-illustration-halo {
  background: #edf4ff;
  border-radius: 50%;
  height: 116rpx;
  left: 28rpx;
  position: absolute;
  top: 0;
  width: 116rpx;
}

.empty-illustration-card {
  background: #ffffff;
  border: 2rpx solid #bcd5ff;
  border-radius: 12rpx;
  box-shadow: 0 10rpx 20rpx rgba(59, 112, 190, 0.1);
  height: 58rpx;
  left: 42rpx;
  position: absolute;
  top: 28rpx;
  transform: rotate(-5deg);
  width: 88rpx;
}

.empty-illustration-card::before,
.empty-illustration-card::after {
  background: #cfe0ff;
  border-radius: 999rpx;
  content: '';
  height: 7rpx;
  left: 14rpx;
  position: absolute;
}

.empty-illustration-card::before {
  top: 16rpx;
  width: 50rpx;
}

.empty-illustration-card::after {
  top: 32rpx;
  width: 34rpx;
}

.empty-illustration-line {
  background: #76a7ff;
  border-radius: 999rpx;
  bottom: 4rpx;
  height: 8rpx;
  left: 20rpx;
  position: absolute;
  transform: rotate(-5deg);
  width: 132rpx;
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
  padding: 0 6rpx 20rpx;
}

.work-order-row {
  align-items: flex-start;
  background: #ffffff;
  border: 1rpx solid #e0e8f5;
  border-radius: 28rpx;
  box-shadow: 0 14rpx 36rpx rgba(35, 75, 128, 0.09);
  box-sizing: border-box;
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
  min-height: 188rpx;
  overflow: hidden;
  padding: 22rpx 18rpx 22rpx 20rpx;
  position: relative;
  width: 100%;
}

.work-order-row::before {
  background: #3277ed;
  content: '';
  height: 100%;
  left: 0;
  position: absolute;
  top: 0;
  width: 6rpx;
}

.row-leading {
  align-items: center;
  background: #eaf2ff;
  border: 1rpx solid #cfe0ff;
  border-radius: 18rpx;
  display: flex;
  flex: 0 0 68rpx;
  height: 68rpx;
  justify-content: center;
}

.row-leading-glyph {
  background: #5f98f5;
  border-radius: 999rpx;
  height: 5rpx;
  position: relative;
  width: 28rpx;
}

.row-leading-glyph::before,
.row-leading-glyph::after {
  background: #5f98f5;
  border-radius: 999rpx;
  content: '';
  height: 5rpx;
  left: 0;
  position: absolute;
  width: 28rpx;
}

.row-leading-glyph::before {
  top: -10rpx;
}

.row-leading-glyph::after {
  top: 10rpx;
}

.row-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  min-height: 48rpx;
}

.row-meta {
  background: #f1f5fb;
  border-radius: 8rpx;
  color: #5f708e;
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 0.2rpx;
  line-height: 1.35;
  max-width: 68%;
  overflow: hidden;
  padding: 6rpx 10rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta-spacer {
  flex: 1;
}

.row-title {
  color: #17243b;
  display: -webkit-box;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.35;
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.row-address {
  align-items: flex-start;
  color: #71809a;
  display: flex;
  font-size: 24rpx;
  gap: 8rpx;
  line-height: 1.45;
  border-top: 1rpx solid #edf1f7;
  margin-top: 16rpx;
  min-width: 0;
  padding-top: 14rpx;
}

.row-address-icon {
  color: #6d8fc6;
  flex: 0 0 auto;
  font-size: 23rpx;
  line-height: 1.45;
}

.row-address-copy {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.row-arrow {
  align-items: center;
  background: #f3f7fe;
  border: 1rpx solid #e1ebfa;
  border-radius: 50%;
  color: #7d9ed3;
  display: flex;
  flex: 0 0 48rpx;
  font-size: 34rpx;
  font-weight: 500;
  height: 48rpx;
  justify-content: center;
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
