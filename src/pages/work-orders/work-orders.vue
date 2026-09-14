<template>
  <view v-if="!canAccess" class="guard-page">
    <view class="guard-icon" aria-hidden="true">锁</view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="work-orders-page">
    <view class="list-shell">
      <view class="search-band">
        <view class="search-input-shell">
          <AppIcon class="search-icon" name="search" :size="17" color="#71829e" aria-hidden="true" />
          <input
            v-model="searchDraft"
            class="search-input"
            placeholder="搜索任务、客户、地址"
            placeholder-class="search-placeholder"
            confirm-type="search"
            :disabled="isLoading"
            @confirm="submitSearch"
          />
        </view>
        <button class="search-button" :disabled="isLoading" @tap="submitSearch">
          {{ isLoading ? '加载中' : '搜索' }}
        </button>
      </view>

      <view class="list-context">
        <text class="list-context-label">当前角色可见工单</text>
        <button class="context-refresh" :disabled="isLoading" @tap="refresh">
          {{ isLoading ? '刷新中' : '刷新' }}
        </button>
      </view>

      <view v-if="workOrders.loadState === 'loading'" class="list-state loading-state">
        <view class="skeleton-list" aria-hidden="true">
          <view class="skeleton-card">
            <view class="skeleton-mark" />
            <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-meta" /></view>
          </view>
          <view class="skeleton-card">
            <view class="skeleton-mark" />
            <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-meta" /></view>
          </view>
          <view class="skeleton-card">
            <view class="skeleton-mark" />
            <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-meta" /></view>
          </view>
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

      <view v-else-if="workOrders.loadState === 'succeeded' && workOrders.items.length === 0 && workOrders.searchText" class="list-state search-empty-state">
        <view class="state-illustration state-illustration-search" aria-hidden="true">
          <view class="illustration-ring" />
          <view class="illustration-handle" />
        </view>
        <text class="state-title">没有找到匹配工单</text>
        <text class="state-detail">请尝试其他任务、客户或地址。</text>
        <button class="state-action" @tap="clearSearch">清除搜索</button>
      </view>

      <view v-else-if="workOrders.loadState === 'succeeded' && workOrders.items.length === 0" class="list-state empty-state">
        <view class="state-illustration" aria-hidden="true">
          <view class="illustration-card" />
          <view class="illustration-line illustration-line-short" />
          <view class="illustration-line illustration-line-long" />
        </view>
        <text class="state-title">当前暂无工单</text>
        <text class="state-detail">当前角色暂时没有可见工单，可稍后刷新再试。</text>
        <button class="state-action" @tap="refresh">刷新工单</button>
      </view>

      <view v-else-if="workOrders.loadState === 'succeeded'" class="list-content">
        <navigator
          v-for="item in workOrders.items"
          :key="String(item.id)"
          class="work-order-card"
          hover-class="work-order-card-hover"
          :url="workOrderDetailRouteFor(item.id)"
        >
          <view
            class="card-accent"
            :class="`card-accent--${workOrderCardToneFor(item.taskLabel)}`"
            aria-hidden="true"
          />
          <view class="card-main">
            <view class="card-top-row">
              <view
                class="card-mark"
                :class="`card-mark--${workOrderCardToneFor(item.taskLabel)}`"
                aria-hidden="true"
              >
                <AppIcon
                  :name="workOrderCardIconFor(item.taskLabel)"
                  :size="19"
                  :color="workOrderCardIconColorFor(item.taskLabel)"
                  aria-hidden="true"
                />
              </view>
              <view class="card-title-cluster">
                <view class="card-title-line">
                  <text v-if="item.taskLabel" class="card-task">{{ item.taskLabel }}</text>
                  <text v-if="item.servicePartLabel" class="card-part-badge">{{ item.servicePartLabel }}</text>
                </view>
              </view>
              <text v-if="item.displayNumber" class="card-number">{{ cardNumber(item.displayNumber) }}</text>
            </view>
            <view class="card-details">
              <view v-if="item.serviceDistrict || item.serviceAddress || item.distanceText" class="card-location">
                <AppIcon class="location-icon" name="location" :size="17" color="#7088ae" aria-hidden="true" />
                <text v-if="item.serviceDistrict" class="location-district">{{ item.serviceDistrict }}</text>
                <text v-if="item.serviceDistrict && item.serviceAddress" class="location-separator" aria-hidden="true"> </text>
                <text v-if="item.serviceAddress" class="location-address">{{ item.serviceAddress }}</text>
                <view v-if="item.distanceText" class="location-distance">
                  <text>{{ item.distanceText }}</text>
                  <view class="distance-vehicle-icon" aria-hidden="true" />
                </view>
              </view>
              <text v-if="item.customerName" class="card-customer">{{ item.customerName }}</text>
              <view
                v-if="item.communityOrderCount !== undefined || item.contact?.normalizedPhone"
                class="card-footer"
              >
                <text v-if="item.communityOrderCount !== undefined" class="nearby-chip">
                  同小区 {{ item.communityOrderCount }}
                </text>
                <view
                  v-if="item.contact?.normalizedPhone"
                  class="card-phone-button"
                  :class="[
                    `card-phone-button--${workOrderCardToneFor(item.taskLabel)}`,
                    { 'card-phone-button--loading': workOrders.contactInFlightId === item.id },
                  ]"
                  role="button"
                  aria-label="联系客户"
                  @tap.stop="dialContact(item)"
                >
                  <AppIcon
                    name="phone"
                    :size="19"
                    :color="workOrderCardIconColorFor(item.taskLabel)"
                    aria-hidden="true"
                  />
                </view>
              </view>
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
import { computed, ref, watch } from 'vue'

import { hasAuthenticatedSession } from '@features/home/access'
import { workOrderCardIconColorFor, workOrderCardIconFor, workOrderCardToneFor } from '@features/work-orders/card'
import { workOrderDetailRouteFor } from '@features/work-orders/detail'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useSessionStore } from '@shared/state'
import AppIcon from '@shared/ui/AppIcon.vue'

const session = useSessionStore()
const workOrders = useWorkOrderListStore()
const searchDraft = ref(workOrders.searchText)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const isLoading = computed(() => workOrders.loadState === 'loading')

function cardNumber(value: string): string {
  const source = value.trim().replace(/^#/, '')
  const digits = source.replace(/\D/g, '')
  const shortValue = digits ? digits.slice(-5) : source.slice(-5)
  return shortValue ? `#${shortValue}` : ''
}

watch(
  () => session.status,
  (status) => {
    if (status === 'authenticated') void workOrders.refresh()
  },
  { immediate: true },
)

async function submitSearch(): Promise<void> {
  if (isLoading.value) return
  searchDraft.value = searchDraft.value.trim()
  await workOrders.search(searchDraft.value)
}

async function clearSearch(): Promise<void> {
  searchDraft.value = ''
  await workOrders.search('')
}

async function refresh(): Promise<void> {
  await workOrders.refresh()
}

async function retry(): Promise<void> {
  await workOrders.retry()
}

async function loadMore(): Promise<void> {
  await workOrders.loadMore()
}

async function dialContact(item: Parameters<typeof workOrders.dialContact>[0]): Promise<void> {
  await workOrders.dialContact(item)
}
</script>

<style>
.work-orders-page,
.guard-page {
  background: #f3f6fa;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 18rpx 24rpx calc(40rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.list-shell {
  margin: 0 auto;
  max-width: none;
}

.search-band {
  align-items: center;
  display: flex;
  gap: 16rpx;
  width: 100%;
}

.search-input-shell {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #e1e7f0;
  border-radius: 24rpx;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  gap: 12rpx;
  height: 88rpx;
  min-width: 0;
  padding: 0 22rpx;
}

.search-icon {
  color: #71819b;
  flex: 0 0 auto;
  font-size: 32rpx;
  line-height: 1;
  transform: rotate(-18deg);
}

.search-input {
  color: #17243a;
  flex: 1;
  font-size: 26rpx;
  height: 88rpx;
  line-height: 88rpx;
  min-width: 0;
}

.search-placeholder {
  color: #98a6ba;
}

.search-button {
  background: #2878f2;
  border-radius: 24rpx;
  color: #ffffff;
  flex: 0 0 136rpx;
  font-size: 28rpx;
  font-weight: 800;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  padding: 0;
}

.search-button[disabled],
.context-refresh[disabled] {
  opacity: 0.58;
}

.list-context {
  align-items: center;
  display: flex;
  justify-content: space-between;
  min-height: 64rpx;
  padding: 0 8rpx;
}

.list-context-label {
  color: #8794a8;
  font-size: 23rpx;
  line-height: 1.35;
}

.context-refresh {
  background: transparent;
  border: 0;
  color: #3278e8;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 64rpx;
  margin: 0;
  min-height: 64rpx;
  padding: 0 8rpx;
}

.list-content {
  display: flex;
  flex-direction: column;
}

.work-order-card {
  align-items: stretch;
  background: #ffffff;
  border: 1rpx solid #e2e8f1;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 28rpx rgba(27, 48, 82, 0.075);
  box-sizing: border-box;
  display: flex;
  margin-bottom: 18rpx;
  min-height: 184rpx;
  overflow: hidden;
  position: relative;
  transition: transform 120ms ease;
  width: 100%;
}

.work-order-card-hover {
  transform: scale(0.99);
}

.card-accent {
  flex: 0 0 6rpx;
  width: 6rpx;
}

.card-accent--blue { background: #2878f2; }
.card-accent--red { background: #f06445; }
.card-accent--orange { background: #ff941f; }
.card-accent--purple { background: #8a69e8; }
.card-accent--green { background: #35b978; }
.card-accent--gray { background: #9aa6b8; }

.card-main {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 24rpx 20rpx 28rpx 18rpx;
}

.card-top-row {
  align-items: center;
  display: flex;
  gap: 16rpx;
  min-width: 0;
}

.card-mark {
  align-items: center;
  background: #edf4ff;
  border: 1rpx solid #d5e5ff;
  border-radius: 16rpx;
  box-sizing: border-box;
  display: flex;
  flex: 0 0 54rpx;
  height: 54rpx;
  justify-content: center;
  width: 54rpx;
}

.card-mark--blue { background: #edf4ff; border-color: #d5e5ff; color: #2878f2; }
.card-mark--red { background: #fff1ed; border-color: #ffd9cf; color: #f06445; }
.card-mark--orange { background: #fff4e8; border-color: #ffdfbd; color: #ff941f; }
.card-mark--purple { background: #f3efff; border-color: #e2d7ff; color: #8a69e8; }
.card-mark--green { background: #eaf9f1; border-color: #c8efd9; color: #35b978; }
.card-mark--gray { background: #f1f3f6; border-color: #e1e5eb; color: #8d99aa; }

.card-title-cluster {
  flex: 1;
  min-width: 0;
}

.card-title-line {
  align-items: center;
  display: flex;
  gap: 12rpx;
  min-width: 0;
}

.card-task {
  color: #172239;
  display: -webkit-box;
  flex: 0 1 auto;
  font-size: 30rpx;
  font-weight: 850;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-part-badge {
  background: #f1f3f6;
  border-radius: 6rpx;
  color: #263044;
  flex: 0 0 auto;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 1.35;
  padding: 4rpx 10rpx;
}

.card-number {
  color: #627492;
  flex: 0 0 auto;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.3;
  max-width: 30%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-left: 70rpx;
}

.card-location {
  align-items: flex-start;
  box-sizing: border-box;
  color: #71829e;
  display: flex;
  font-size: 24rpx;
  gap: 8rpx;
  line-height: 1.5;
  margin-left: -70rpx;
  margin-top: 18rpx;
  min-width: 0;
  padding-left: 70rpx;
  position: relative;
  width: calc(100% + 70rpx);
}

.location-icon {
  left: 0;
  line-height: 1.5;
  position: absolute;
  top: -4rpx;
}

.location-district {
  color: #667d9f;
  flex: 0 0 auto;
  font-weight: 700;
}

.location-separator {
  color: #afbac9;
  flex: 0 0 auto;
}

.location-address {
  color: #75849b;
  display: -webkit-box;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.location-distance {
  align-items: center;
  color: #627492;
  display: flex;
  flex: 0 0 auto;
  font-size: 22rpx;
  font-weight: 700;
  gap: 6rpx;
  margin-left: 6rpx;
  white-space: nowrap;
}

.distance-vehicle-icon {
  border: 2rpx solid #6f86a8;
  border-radius: 4rpx;
  box-sizing: border-box;
  height: 12rpx;
  position: relative;
  width: 22rpx;
}

.distance-vehicle-icon::before,
.distance-vehicle-icon::after {
  background: #6f86a8;
  border-radius: 50%;
  bottom: -5rpx;
  content: '';
  height: 5rpx;
  position: absolute;
  width: 5rpx;
}

.distance-vehicle-icon::before { left: 2rpx; }
.distance-vehicle-icon::after { right: 2rpx; }

.card-customer {
  color: #172239;
  display: -webkit-box;
  font-size: 29rpx;
  font-weight: 800;
  line-height: 1.4;
  margin-top: 10rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-footer {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-top: 14rpx;
  min-height: 32rpx;
}

.nearby-chip {
  background: #edf4ff;
  border-radius: 6rpx;
  color: #2878f2;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 32rpx;
  padding: 0 10rpx;
}

.card-phone-button {
  align-items: center;
  border: 1rpx solid #edf0f5;
  border-radius: 50%;
  box-shadow: 0 6rpx 14rpx rgba(27, 48, 82, 0.06);
  display: flex;
  flex: 0 0 58rpx;
  height: 58rpx;
  justify-content: center;
  margin-right: 2rpx;
  width: 58rpx;
}

.card-phone-button--loading { opacity: 0.48; }

.list-state {
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1rpx solid #e2e8f1;
  border-radius: 28rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 400rpx;
  padding: 48rpx 36rpx;
  text-align: center;
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  width: 100%;
}

.skeleton-card {
  align-items: center;
  background: #f8fafc;
  border: 1rpx solid #edf1f6;
  border-radius: 24rpx;
  box-sizing: border-box;
  display: flex;
  gap: 16rpx;
  min-height: 128rpx;
  padding: 20rpx;
}

.skeleton-mark,
.skeleton-line {
  background: #e3ebf7;
  border-radius: 999rpx;
}

.skeleton-mark {
  flex: 0 0 54rpx;
  height: 54rpx;
}

.skeleton-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16rpx;
}

.skeleton-line {
  height: 18rpx;
}

.skeleton-line-main {
  width: 72%;
}

.skeleton-line-meta {
  width: 46%;
}

.loading-state .state-title {
  margin-top: 28rpx;
}

.state-illustration {
  height: 112rpx;
  position: relative;
  width: 164rpx;
}

.illustration-card {
  background: #ffffff;
  border: 2rpx solid #c7dcff;
  border-radius: 14rpx;
  box-shadow: 0 10rpx 20rpx rgba(45, 101, 181, 0.09);
  height: 58rpx;
  left: 42rpx;
  position: absolute;
  top: 18rpx;
  transform: rotate(-5deg);
  width: 80rpx;
}

.illustration-line {
  background: #cfe0ff;
  border-radius: 999rpx;
  height: 7rpx;
  left: 55rpx;
  position: absolute;
}

.illustration-line-short {
  top: 44rpx;
  width: 42rpx;
}

.illustration-line-long {
  left: 26rpx;
  top: 78rpx;
  width: 112rpx;
}

.state-illustration-search {
  height: 112rpx;
}

.illustration-ring {
  border: 7rpx solid #c7dcff;
  border-radius: 50%;
  height: 54rpx;
  left: 48rpx;
  position: absolute;
  top: 16rpx;
  width: 54rpx;
}

.illustration-handle {
  background: #78a8f6;
  border-radius: 999rpx;
  height: 8rpx;
  left: 98rpx;
  position: absolute;
  top: 72rpx;
  transform: rotate(45deg);
  width: 34rpx;
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
  height: 96rpx;
  width: 96rpx;
}

.state-icon-error {
  background: #fff0ef;
  color: #d64545;
}

.state-title,
.guard-title {
  color: #1b2940;
  font-size: 32rpx;
  font-weight: 850;
  line-height: 1.4;
}

.state-title {
  margin-top: 24rpx;
}

.state-detail,
.guard-copy {
  color: #7c8ba2;
  font-size: 25rpx;
  line-height: 1.6;
  margin-top: 12rpx;
}

.state-action {
  background: #2878f2;
  border-radius: 16rpx;
  color: #ffffff;
  font-size: 27rpx;
  font-weight: 800;
  line-height: 1;
  margin: 28rpx 0 0;
  min-height: 76rpx;
  padding: 0 34rpx;
}

.load-more {
  align-self: center;
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
  color: #2878f2;
  font-size: 28rpx;
  font-weight: 900;
  height: 92rpx;
  width: 92rpx;
}

.guard-title {
  margin-top: 24rpx;
}

.back-link {
  color: #2878f2;
  font-size: 26rpx;
  font-weight: 800;
  line-height: 1.4;
  padding: 16rpx 0;
}

button::after {
  border: 0;
}
</style>
