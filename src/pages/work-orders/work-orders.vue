<template>
  <view v-if="!canAccess" class="guard-page">
    <view class="guard-icon" aria-hidden="true">锁</view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="work-orders-page">
    <view class="list-shell">
      <AppStatus
        v-if="productionReadOnly"
        class="production-read-only-notice"
        message="生产数据只读：可查看当前账号有权限的工单；接单、联系客户和业务修改已关闭。"
        tone="warning"
        quiet
        data-testid="production-read-only-notice"
      />
      <AppSearchBar
        v-model="searchDraft"
        placeholder="搜索任务、客户、地址"
        :disabled="isLoading"
        @search="submitSearch"
      />

      <AppWorkOrderSkeleton v-if="showLoadingSkeleton" variant="list" />

      <AppFeedbackState
        v-else-if="workOrders.loadState === 'failed_retryable'"
        layout="list"
        appearance="error"
        title="暂时无法加载工单"
        description="请检查网络后重试。"
        action-label="重新加载"
        @action="retry"
      />
      <AppFeedbackState
        v-else-if="workOrders.loadState === 'failed_terminal'"
        layout="list"
        appearance="error"
        title="工单加载失败"
        description="请稍后再试。"
        action-label="再次尝试"
        @action="retry"
      />
      <AppFeedbackState
        v-else-if="workOrders.loadState === 'succeeded' && workOrders.items.length === 0 && workOrders.searchText"
        layout="list"
        appearance="search-empty"
        title="没有找到匹配工单"
        description="请尝试其他任务、客户或地址。"
        action-label="清除搜索"
        @action="clearSearch"
      />

      <AppWorkOrderEmptyState
        v-else-if="workOrders.loadState === 'succeeded' && workOrders.items.length === 0"
        @action="refresh"
      />

      <view v-else-if="workOrders.loadState === 'succeeded' || isRefreshing" class="list-content">
        <AppSectionHeading class="list-section-heading" title="当前工单" subtitle="按当前账号权限展示" data-testid="ds02b-list-heading">
          <template #trailing><text v-if="workOrders.loadState === 'succeeded'" class="list-loaded-count">已加载 {{ workOrders.items.length }} 条</text></template>
        </AppSectionHeading>
        <view v-if="isRefreshing" class="inline-refresh" aria-label="正在刷新工单">
          <view class="inline-refresh-indicator" />
        </view>
        <view
          v-for="item in workOrders.items"
          :key="String(item.id)"
          class="work-order-card"
          :hover-class="listActionFor(item).detailAccessible ? 'work-order-card-hover' : 'none'"
          :role="listActionFor(item).detailAccessible ? 'link' : undefined"
          :aria-disabled="!listActionFor(item).detailAccessible"
          @tap="openDetailIfAccessible(item)"
        >
          <AppRecordCard class="work-order-card-surface" layout="horizontal" :tone="workOrderCardToneFor(item.taskLabel)" accent interactive data-testid="ds02b-work-order-card-surface">
          <view class="card-main">
            <view class="card-top-row">
              <AppRecordMark
                :icon="workOrderCardIconFor(item.taskLabel)"
                :size="19"
                :color="workOrderCardIconColorFor(item.taskLabel)"
              />
              <view class="card-title-cluster">
                <view class="card-title-line">
                  <text v-if="item.taskLabel" class="card-task">{{ item.taskLabel }}</text>
                  <AppMetaTag v-if="item.servicePartLabel" class="card-part-badge" :label="item.servicePartLabel" />
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
                v-if="item.communityOrderCount !== undefined || listActionFor(item).contactAvailable || listActionFor(item).acceptOrder"
                class="card-footer"
              >
                <AppMetaTag v-if="item.communityOrderCount !== undefined" class="nearby-chip" tone="info" :label="`同小区 ${item.communityOrderCount}`" />
                <view
                  v-if="listActionFor(item).contactAvailable"
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
                <view v-if="listActionFor(item).acceptOrder" class="card-accept-control" @tap.stop>
                  <AppButton
                    class="card-accept-button"
                    size="compact"
                    :loading="workOrders.acceptInFlightId === item.id"
                    :disabled="workOrders.acceptInFlightId === item.id"
                    @tap="requestAccept(item)"
                  >{{ workOrders.acceptInFlightId === item.id ? '接单中' : '接单' }}</AppButton>
                </view>
              </view>
            </view>
          </view>
          </AppRecordCard>
        </view>

        <button v-if="workOrders.hasMore === true" class="state-action load-more" @tap="loadMore">加载更多</button>
      </view>

      <view v-if="acceptCandidate" class="accept-confirm-backdrop" @tap="cancelAccept">
        <view class="accept-confirm-card" @tap.stop>
          <text class="accept-confirm-title">确认接单</text>
          <text class="accept-confirm-copy">该工单存在待确认事项，确认后将进入工单处理流程。</text>
          <view class="accept-confirm-actions">
            <button class="accept-confirm-button accept-confirm-button--secondary" @tap="cancelAccept">取消</button>
            <button class="accept-confirm-button accept-confirm-button--primary" @tap="confirmAccept">确认接单</button>
          </view>
        </view>
      </view>

      <view v-else-if="workOrders.loadState === 'loading'" class="loading-placeholder" aria-hidden="true" />

      <AppLoadingState v-else variant="inline" label="正在准备工单" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { hasAuthenticatedSession } from '@features/home/access'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { workOrderCardIconColorFor, workOrderCardIconFor, workOrderCardToneFor } from '@features/work-orders/card'
import { workOrderDetailRouteFor } from '@features/work-orders/detail'
import { workOrderListActionFor } from '@features/work-orders/list-actions'
import { useWorkOrderListStore } from '@features/work-orders/list'
import type { WorkOrderSummary } from '@shared/ports'
import { useSessionStore } from '@shared/state'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppRecordMark from '@shared/ui/AppRecordMark.vue'
import AppMetaTag from '@shared/ui/AppMetaTag.vue'
import AppSectionHeading from '@shared/ui/AppSectionHeading.vue'
import AppSearchBar from '@shared/ui/AppSearchBar.vue'
import AppFeedbackState from '@shared/ui/AppFeedbackState.vue'
import AppWorkOrderSkeleton from '@shared/ui/AppWorkOrderSkeleton.vue'
import AppWorkOrderEmptyState from '@shared/ui/AppWorkOrderEmptyState.vue'
import { appLoadingSkeletonDelayMs } from '@shared/ui/loading'

const session = useSessionStore()
const workOrders = useWorkOrderListStore()
const acceptCandidate = ref<WorkOrderSummary | null>(null)
const searchDraft = ref(workOrders.searchText)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const productionReadOnly = isProductionReadOnlyRuntime()
const isLoading = computed(() => workOrders.loadState === 'loading')
const isRefreshing = computed(() => isLoading.value && workOrders.items.length > 0)
const showLoadingSkeleton = ref(false)
let loadingSkeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearLoadingSkeletonTimer(): void {
  if (loadingSkeletonTimer) clearTimeout(loadingSkeletonTimer)
  loadingSkeletonTimer = undefined
}

function cardNumber(value: string): string {
  const source = value.trim().replace(/^#/, '')
  const digits = source.replace(/\D/g, '')
  const shortValue = digits ? digits.slice(-5) : source.slice(-5)
  return shortValue ? `#${shortValue}` : ''
}

watch(
  [() => workOrders.loadState, () => workOrders.items.length],
  ([state, itemCount]) => {
    clearLoadingSkeletonTimer()
    showLoadingSkeleton.value = false
    if (state === 'loading' && itemCount === 0) {
      loadingSkeletonTimer = setTimeout(() => {
        if (workOrders.loadState === 'loading' && workOrders.items.length === 0) {
          showLoadingSkeleton.value = true
        }
      }, appLoadingSkeletonDelayMs)
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearLoadingSkeletonTimer)

watch(
  [() => session.status, () => workOrderReadScopeKey(session.session)],
  ([status, scope], previous) => {
    if (status === 'authenticated' && scope
      && (!previous || previous[0] !== status || previous[1] !== scope)) {
      acceptCandidate.value = null
      void workOrders.refresh()
    }
    if (status !== 'authenticated' && status !== 'unknown') {
      acceptCandidate.value = null
      workOrders.clear()
    }
  },
  { immediate: true, flush: 'sync' },
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

function listActionFor(item: WorkOrderSummary) {
  const action = workOrderListActionFor(item, session.session)
  return productionReadOnly
    ? { detailAccessible: action.detailAccessible, contactAvailable: false }
    : action
}

async function openDetailIfAccessible(item: WorkOrderSummary): Promise<void> {
  // A non-actionable card must not instantiate a navigator with an empty URL:
  // MP-WEIXIN reports a runtime error even when the card is never followed.
  if (!listActionFor(item).detailAccessible) return
  await workOrders.navigateTo(workOrderDetailRouteFor(item.id))
}

async function requestAccept(item: WorkOrderSummary): Promise<void> {
  if (productionReadOnly) return
  const action = listActionFor(item).acceptOrder
  if (!action) return
  const result = await workOrders.acceptOrder({
    workOrderId: item.id,
    workflowNodeId: action.workflowNodeId,
  })
  if (result.state === 'confirmation_required') acceptCandidate.value = item
  if (result.state === 'succeeded') {
    await workOrders.navigateTo(workOrderDetailRouteFor(item.id))
  }
}

async function confirmAccept(): Promise<void> {
  if (productionReadOnly) {
    acceptCandidate.value = null
    return
  }
  const item = acceptCandidate.value
  if (!item) return
  const action = listActionFor(item).acceptOrder
  if (!action) {
    acceptCandidate.value = null
    return
  }
  const result = await workOrders.acceptOrder({
    workOrderId: item.id,
    workflowNodeId: action.workflowNodeId,
  }, true)
  if (result.state !== 'confirmation_required') acceptCandidate.value = null
  if (result.state === 'succeeded') {
    await workOrders.navigateTo(workOrderDetailRouteFor(item.id))
  }
}

function cancelAccept(): void {
  acceptCandidate.value = null
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

.production-read-only-notice { display: block; margin: 0 0 14rpx; }

.list-content {
  display: flex;
  flex-direction: column;
  margin: 18rpx 8rpx 0;
}
.work-order-card-surface { width: 100%; min-height: 100px; }
.list-section-heading { margin: 4px 2px 14px; }
.list-loaded-count { color: var(--app-content-muted-ink); font-size: 12px; white-space: nowrap; }

.work-order-card {
  display: block;
  box-sizing: border-box;
  margin-bottom: 14px;
  min-width: 0;
  width: 100%;
  overflow: visible;
}

.work-order-card-hover .work-order-card-surface {
  transform: translateY(1px);
  box-shadow: var(--app-elevation-flat);
}

.card-main {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 17px 15px 17px;
}

.card-top-row {
  align-items: center;
  display: flex;
  gap: 16rpx;
  min-width: 0;
}

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
  color: var(--app-text-strong);
  display: -webkit-box;
  flex: 0 1 auto;
  font-size: var(--app-content-title-size);
  font-weight: 720;
  line-height: 1.34;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-part-badge {
  flex: 0 1 auto;
}

.card-number {
  color: var(--app-content-muted-ink);
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
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
  color: var(--app-content-muted-ink);
  display: flex;
  font-size: 12.5px;
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
  color: var(--app-content-muted-ink);
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
  flex-shrink: 0;
}

.card-phone-button {
  align-items: center;
  background: var(--app-surface-raised);
  border: 1px solid var(--app-outline-subtle);
  border-radius: 14px;
  display: flex;
  flex: 0 0 44px;
  height: 44px;
  justify-content: center;
  margin-right: 2px;
  width: 44px;
  box-sizing: border-box;
  box-shadow: var(--app-elevation-flat);
}

.card-phone-button--loading { opacity: 0.48; }

.card-accept-control { flex: 0 0 auto; margin-left: 10px; }
.card-accept-button { min-width: 80px; }

.accept-confirm-backdrop {
  align-items: center;
  background: rgba(15, 28, 48, 0.38);
  display: flex;
  inset: 0;
  justify-content: center;
  position: fixed;
  z-index: 20;
}

.accept-confirm-card {
  background: #ffffff;
  border-radius: 24rpx;
  box-sizing: border-box;
  margin: 48rpx;
  padding: 32rpx;
  width: 100%;
}

.accept-confirm-title {
  color: #172239;
  display: block;
  font-size: 30rpx;
  font-weight: 800;
}

.accept-confirm-copy {
  color: #6f7f98;
  display: block;
  font-size: 24rpx;
  line-height: 1.6;
  margin-top: 16rpx;
}

.accept-confirm-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
}

.accept-confirm-button {
  border-radius: 12rpx;
  flex: 1;
  font-size: 24rpx;
  font-weight: 800;
  height: 72rpx;
  line-height: 72rpx;
  margin: 0;
}

.accept-confirm-button--secondary { background: #f1f4f8; color: #5f708b; }
.accept-confirm-button--primary { background: #2878f2; color: #ffffff; }

.inline-refresh {
  background: #e7eef8;
  border-radius: 999rpx;
  height: 4rpx;
  margin: 0 0 14rpx;
  overflow: hidden;
  width: 100%;
}

.inline-refresh-indicator {
  animation: app-loading-slide var(--app-motion-loading-slide-duration) ease-in-out infinite;
  background: #2878f2;
  border-radius: inherit;
  height: 100%;
  width: 32%;
}

/* Auth guard remains page-owned; error and search feedback now share AppFeedbackState. */
.guard-icon {
  align-items: center;
  border-radius: 50%;
  display: flex;
  justify-content: center;
}
.guard-title {
  color: #1b2940;
  font-size: 32rpx;
  font-weight: 850;
  line-height: 1.4;
}
.guard-copy {
  color: #7c8ba2;
  font-size: 25rpx;
  line-height: 1.6;
  margin-top: 12rpx;
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
