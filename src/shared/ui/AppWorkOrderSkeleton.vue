<template>
  <!-- Read-only skeleton: parent owns timing; no business data fetched here. -->
      <view v-if="variant === 'list'" class="list-state loading-state app-workorder-skeleton--list" data-testid="work-order-skeleton-list" aria-label="正在加载工单">
        <view class="skeleton-list" aria-hidden="true">
          <view class="skeleton-card">
            <view class="skeleton-accent" />
            <view class="skeleton-card-main">
              <view class="skeleton-card-top">
                <view class="skeleton-mark" />
                <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-part" /></view>
                <view class="skeleton-line skeleton-line-number" />
              </view>
              <view class="skeleton-line skeleton-line-location" />
              <view class="skeleton-line skeleton-line-customer" />
              <view class="skeleton-card-footer"><view class="skeleton-line skeleton-line-chip" /><view class="skeleton-phone" /></view>
            </view>
          </view>
          <view class="skeleton-card">
            <view class="skeleton-accent" />
            <view class="skeleton-card-main">
              <view class="skeleton-card-top">
                <view class="skeleton-mark" />
                <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-part" /></view>
                <view class="skeleton-line skeleton-line-number" />
              </view>
              <view class="skeleton-line skeleton-line-location" />
              <view class="skeleton-line skeleton-line-customer" />
              <view class="skeleton-card-footer"><view class="skeleton-line skeleton-line-chip" /><view class="skeleton-phone" /></view>
            </view>
          </view>
          <view class="skeleton-card">
            <view class="skeleton-accent" />
            <view class="skeleton-card-main">
              <view class="skeleton-card-top">
                <view class="skeleton-mark" />
                <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-part" /></view>
                <view class="skeleton-line skeleton-line-number" />
              </view>
              <view class="skeleton-line skeleton-line-location" />
              <view class="skeleton-line skeleton-line-customer" />
              <view class="skeleton-card-footer"><view class="skeleton-line skeleton-line-chip" /><view class="skeleton-phone" /></view>
            </view>
          </view>
        </view>
      </view>


    <view v-else class="detail-state detail-loading-state app-workorder-skeleton--detail" data-testid="work-order-skeleton-detail" aria-label="正在加载工单详情">
      <view class="detail-skeleton" aria-hidden="true">
        <view class="skeleton-surface skeleton-summary">
          <view class="skeleton-summary-top">
            <view class="skeleton-line skeleton-line--customer" />
            <view class="skeleton-line skeleton-line--number" />
          </view>
          <view class="skeleton-line skeleton-line--location" />
          <view class="skeleton-actions skeleton-actions--summary">
            <view /><view /><view /><view />
          </view>
        </view>

        <view class="skeleton-surface skeleton-task">
          <view class="skeleton-line skeleton-line--eyebrow" />
          <view class="skeleton-line skeleton-line--task-title" />
          <view class="skeleton-button" />
        </view>

        <view class="skeleton-surface skeleton-information">
          <view class="skeleton-tabs"><view /><view /><view /><view /></view>
          <view class="skeleton-information-row"><view /><view /></view>
          <view class="skeleton-information-row"><view /><view /></view>
        </view>
      </view>
    </view>


</template>
<script setup lang="ts">
defineProps<{ readonly variant: 'list' | 'detail' }>()
</script>
<style scoped>
.app-workorder-skeleton--list {
  align-items: stretch;
  background: transparent;
  border: 0;
  border-radius: 0;
  min-height: 0;
  padding: 0;
}.app-workorder-skeleton--list .loading-placeholder {
  min-height: 184rpx;
}.app-workorder-skeleton--list .skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  width: 100%;
}.app-workorder-skeleton--list .skeleton-card {
  align-items: stretch;
  background: #ffffff;
  border: 1rpx solid #e2e8f1;
  border-radius: 28rpx;
  box-sizing: border-box;
  display: flex;
  min-height: 184rpx;
  overflow: hidden;
}.app-workorder-skeleton--list .skeleton-accent {
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
  background: #e8eef7;
  flex: 0 0 6rpx;
  width: 6rpx;
}.app-workorder-skeleton--list .skeleton-card-main {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 24rpx 20rpx 28rpx 18rpx;
}.app-workorder-skeleton--list .skeleton-card-top,
.app-workorder-skeleton--list .skeleton-card-footer {
  align-items: center;
  display: flex;
}.app-workorder-skeleton--list .skeleton-card-top {
  gap: 16rpx;
  min-width: 0;
}.app-workorder-skeleton--list .skeleton-mark {
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
  background: #edf2f7;
  border-radius: 16rpx;
  flex: 0 0 54rpx;
  height: 54rpx;
  width: 54rpx;
}.app-workorder-skeleton--list .skeleton-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16rpx;
}.app-workorder-skeleton--list .skeleton-line {
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
  background: #e3ebf7;
  border-radius: 999rpx;
  height: 20rpx;
}.app-workorder-skeleton--list .skeleton-line-main { height: 30rpx; width: 68%; }.app-workorder-skeleton--list .skeleton-line-part { height: 16rpx; width: 30%; }.app-workorder-skeleton--list .skeleton-line-number { height: 24rpx; width: 20%; }.app-workorder-skeleton--list .skeleton-line-location { margin-top: 18rpx; width: 62%; }.app-workorder-skeleton--list .skeleton-line-customer { height: 28rpx; margin-top: 10rpx; width: 42%; }.app-workorder-skeleton--list .skeleton-line-chip { height: 24rpx; width: 24%; }.app-workorder-skeleton--list .skeleton-card-footer {
  justify-content: space-between;
  margin-top: 14rpx;
  min-height: 58rpx;
}.app-workorder-skeleton--list .skeleton-phone {
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
  background: #f5f7fa;
  border: 1rpx solid #edf0f5;
  border-radius: 50%;
  flex: 0 0 58rpx;
  height: 58rpx;
  width: 58rpx;
}


.app-workorder-skeleton--detail .detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 0;
  width: 100%;
}.app-workorder-skeleton--detail {
  align-items: stretch;
  justify-content: flex-start;
  min-height: 0;
}.app-workorder-skeleton--detail .detail-loading-placeholder {
  min-height: 184rpx;
}.app-workorder-skeleton--detail .skeleton-surface {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-sizing: border-box;
  overflow: hidden;
}.app-workorder-skeleton--detail .skeleton-summary {
  padding: 28rpx 28rpx 24rpx;
}.app-workorder-skeleton--detail .skeleton-summary-top,
.app-workorder-skeleton--detail .skeleton-tabs,
.app-workorder-skeleton--detail .skeleton-information-row {
  align-items: center;
  display: flex;
}.app-workorder-skeleton--detail .skeleton-summary-top {
  justify-content: space-between;
}.app-workorder-skeleton--detail .skeleton-line {
  background: #edf2f7;
  border-radius: 999rpx;
  height: 22rpx;
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
}.app-workorder-skeleton--detail .skeleton-line--customer { height: 32rpx; width: 42%; }.app-workorder-skeleton--detail .skeleton-line--number { height: 24rpx; width: 20%; }.app-workorder-skeleton--detail .skeleton-line--location { margin-top: 24rpx; width: 64%; }.app-workorder-skeleton--detail .skeleton-line--eyebrow { height: 20rpx; width: 18%; }.app-workorder-skeleton--detail .skeleton-line--task-title { height: 30rpx; margin-top: 14rpx; width: 30%; }.app-workorder-skeleton--detail .skeleton-actions--summary {
  margin-top: 24rpx;
}.app-workorder-skeleton--detail .skeleton-actions {
  display: flex;
  gap: 18rpx;
}.app-workorder-skeleton--detail .skeleton-actions view {
  background: #edf2f7;
  border-radius: 14rpx;
  flex: 1;
  height: 64rpx;
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
}.app-workorder-skeleton--detail .skeleton-task {
  background: #ffffff;
  border-color: #e4eaf2;
  padding: 24rpx 26rpx 22rpx;
}.app-workorder-skeleton--detail .skeleton-button {
  background: #edf2f7;
  border-radius: 14rpx;
  height: 68rpx;
  margin-top: 22rpx;
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
}.app-workorder-skeleton--detail .skeleton-information {
  padding-bottom: 12rpx;
}.app-workorder-skeleton--detail .skeleton-tabs {
  border-bottom: 1rpx solid #edf1f6;
  gap: 28rpx;
  height: 82rpx;
  padding: 0 28rpx;
}.app-workorder-skeleton--detail .skeleton-tabs view {
  background: #edf2f7;
  border-radius: 999rpx;
  height: 20rpx;
  width: 76rpx;
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
}.app-workorder-skeleton--detail .skeleton-information-row {
  border-bottom: 1rpx solid #edf1f6;
  justify-content: space-between;
  margin: 0 28rpx;
  min-height: 82rpx;
}.app-workorder-skeleton--detail .skeleton-information-row view {
  background: #edf2f7;
  border-radius: 999rpx;
  height: 20rpx;
  width: 22%;
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
}.app-workorder-skeleton--detail .skeleton-information-row view:last-child {
  width: 34%;
}


</style>