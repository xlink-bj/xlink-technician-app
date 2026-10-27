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
        <AppSectionHeading class="list-section-heading" title="全部工单" data-testid="ds02b-list-heading">
          <template #trailing><text v-if="workOrders.loadState === 'succeeded'" class="list-loaded-count">{{ workOrders.items.length }} 条</text></template>
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
          <AppRecordCard class="work-order-card-surface" layout="horizontal" :tone="workOrderCardToneFor(item.taskLabel)" interactive data-testid="ds02b-work-order-card-surface">
          <view class="card-main">
            <view class="card-top-row">
              <AppRecordMark
                :icon="workOrderCardIconFor(item.taskLabel)"
                :size="20"
                color="#ffffff"
              />
              <view class="card-title-cluster">
                <view class="card-title-line">
                  <text v-if="item.taskLabel" class="card-task">{{ item.taskLabel }}</text>
                </view>
              </view>
              <text v-if="item.displayNumber" class="card-number">{{ cardNumber(item.displayNumber) }}</text>
            </view>
            <view class="card-details">
              <view v-if="item.customerName || item.servicePartLabel" class="card-customer-row">
                <text v-if="item.customerName" class="card-customer">{{ item.customerName }}</text>
                <AppMetaTag v-if="item.servicePartLabel" class="card-part-badge" :label="item.servicePartLabel" />
              </view>
              <view v-if="item.serviceDistrict || item.serviceAddress || item.distanceText" class="card-location">
                <AppIcon class="location-icon" name="location" :size="17" color="#7088ae" aria-hidden="true" />
                <text v-if="item.serviceDistrict" class="location-district">{{ item.serviceDistrict }}</text>
                <text v-if="item.serviceDistrict && item.serviceAddress" class="location-separator" aria-hidden="true"> </text>
                <text v-if="item.serviceAddress" class="location-address">{{ item.serviceAddress }}</text>
                <view v-if="item.distanceText" class="location-distance">
                  <text>{{ item.distanceText }}</text>
                </view>
              </view>
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
                    color="#1677e8"
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
import { workOrderCardIconFor, workOrderCardToneFor } from '@features/work-orders/card'
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
  background: #f5f7fb;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 12px 15px 22px;
  padding-bottom: calc(22px + env(safe-area-inset-bottom));
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
  margin: 10px 0 0;
}
.work-order-card-surface { width: 100%; min-height: 158px; }
.list-section-heading { margin: 5px 2px 13px; }
.list-loaded-count { color: #8390a3; font-size: 12px; font-weight: 550; white-space: nowrap; }

/* The single-viewport UI lab is isolated to this real list page. Other
   approved RecordCard/SearchBar consumers retain their established styling. */
.work-orders-page .search-band { gap: 10px; margin: 0; }
.work-orders-page .search-band .search-input-shell {
  height: 46px;
  border: 1px solid #e5ebf3;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 2px 9px rgba(21, 47, 85, .035);
  padding: 0 13px;
}
.work-orders-page .search-band .search-input { height: 44px; line-height: 44px; font-size: 14px; }
.work-orders-page .search-band .search-button {
  flex: 0 0 73px;
  height: 46px;
  line-height: 46px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  background: #2077ed;
  box-shadow: 0 3px 9px rgba(28, 104, 216, .11);
}
.work-orders-page .list-section-heading .app-section-heading__title {
  font-size: 19px;
  font-weight: 750;
  letter-spacing: -.25px;
}
.work-orders-page .list-section-heading .app-section-heading__subtitle { font-size: 12px; }
.work-orders-page .app-record-card.work-order-card-surface {
  background: #fff;
  border: 1px solid #e8edf4;
  border-radius: 17px;
  box-shadow: 0 3px 15px rgba(27, 48, 80, .052);
}
.work-orders-page .work-order-card-surface .app-record-mark {
  flex: 0 0 38px;
  height: 38px;
  width: 38px;
  border: 0;
  border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
}
.work-orders-page .app-record-card--tone-blue .app-record-mark { background: #247af0; }
.work-orders-page .app-record-card--tone-red .app-record-mark { background: #f34b53; }
.work-orders-page .app-record-card--tone-orange .app-record-mark { background: #f6a02b; }
.work-orders-page .app-record-card--tone-purple .app-record-mark { background: #8162e8; }
.work-orders-page .app-record-card--tone-green .app-record-mark { background: #28b995; }
.work-orders-page .app-record-card--tone-gray .app-record-mark { background: #8897aa; }

.work-order-card {
  display: block;
  box-sizing: border-box;
  margin-bottom: 12px;
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
  padding: 13px 14px 11px;
}

.card-top-row {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.card-title-cluster {
  flex: 1;
  min-width: 0;
}

.card-title-line {
  align-items: center;
  display: flex;
  gap: 7px;
  min-width: 0;
}

.card-task {
  color: #1a2a40;
  display: -webkit-box;
  flex: 0 1 auto;
  font-size: 16px;
  font-weight: 760;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-part-badge {
  flex: 0 0 auto;
  max-width: 110px;
  padding: 3px 7px;
  font-size: 11px;
  white-space: nowrap;
}
.card-part-badge .app-meta-tag__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.card-number {
  color: #8998ac;
  flex: 0 0 auto;
  font-size: 11.5px;
  font-weight: 570;
  line-height: 1.3;
  max-width: 28%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-left: 0;
}

.card-location {
  align-items: center;
  box-sizing: border-box;
  color: #71819a;
  display: flex;
  font-size: 13px;
  gap: 6px;
  line-height: 1.5;
  margin-left: 0;
  margin-top: 7px;
  min-width: 0;
  padding-left: 0;
  width: 100%;
}

.location-icon {
  flex: 0 0 auto;
  line-height: 1.5;
}

.location-district {
  color: #687992;
  flex: 0 0 auto;
  font-weight: 600;
}

.location-separator {
  color: #afbac9;
  flex: 0 0 auto;
}

.location-address {
  color: #8290a4;
  display: block;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-distance {
  align-items: center;
  color: #77879f;
  display: flex;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 550;
  gap: 0;
  margin-left: 5px;
  white-space: nowrap;
}

.card-customer-row {
  align-items: center;
  display: flex;
  gap: 10px;
  margin-top: 9px;
  min-width: 0;
}

.card-customer {
  color: #17263e;
  display: block;
  flex: 1 1 auto;
  font-size: 20px;
  font-weight: 770;
  line-height: 1.3;
  letter-spacing: -.3px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-footer {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  min-height: 42px;
}

.nearby-chip {
  flex-shrink: 0;
}

.card-phone-button {
  align-items: center;
  background: #f8fbff;
  border: 1px solid #e0e9f6;
  border-radius: 50%;
  display: flex;
  flex: 0 0 42px;
  height: 42px;
  justify-content: center;
  margin-right: 2px;
  width: 42px;
  box-sizing: border-box;
  box-shadow: 0 2px 6px rgba(29, 92, 172, .055);
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
