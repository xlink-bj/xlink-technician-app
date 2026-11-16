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

      <scroll-view scroll-x class="work-order-categories" aria-label="工单分类">
        <view class="work-order-categories-row" role="tablist">
          <button v-for="item in workOrderCategories" :key="item.key"
            class="work-order-category" :class="{ 'work-order-category--active': workOrders.category === item.key }"
            role="tab" :aria-selected="workOrders.category === item.key"
            :data-testid="`work-order-category-${item.key}`" @tap="selectCategory(item.key)">
            {{ item.label }}
          </button>
        </view>
      </scroll-view>

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
          :hover-class="canOpenDetail(item) ? 'work-order-card-hover' : 'none'"
          :role="canOpenDetail(item) ? 'link' : undefined"
          :aria-disabled="!canOpenDetail(item)"
          @tap="openDetailIfAccessible(item)"
        >
          <AppRecordCard class="work-order-card-surface" layout="horizontal" :tone="workOrderCardToneFor(item.taskLabel)" accent :interactive="canOpenDetail(item)" data-testid="ds02b-work-order-card-surface">
          <view class="card-main">
            <view class="card-top-row">
              <AppRecordMark
                :icon="workOrderCardIconFor(item.taskLabel)"
                :size="19"
                :color="workOrderCardIconRoleFor(item.taskLabel)"
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
                <AppIcon class="location-icon" name="location" :size="17" color="var(--app-work-order-location-icon)" aria-hidden="true" />
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
                v-if="canOpenDetail(item) || item.communityOrderCount !== undefined || listActionFor(item).contactAvailable || listActionFor(item).acceptOrder"
                class="card-footer"
              >
                <AppMetaTag v-if="item.communityOrderCount !== undefined" class="nearby-chip" tone="info" :label="`同小区 ${item.communityOrderCount}`" />
                <text v-if="canOpenDetail(item)" class="card-detail-hint">查看详情 ›</text>
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
                    :color="workOrderCardIconRoleFor(item.taskLabel)"
                    aria-hidden="true"
                  />
                  <text class="card-phone-label">联系</text>
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

      <view v-else-if="workOrders.loadState === 'loading'" class="loading-placeholder" aria-hidden="true" />

      <AppLoadingState v-else variant="inline" label="正在准备工单" />

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

    </view>
  </view>
  <AppMainNavigation v-if="canAccess" active="workOrders" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { hasAuthenticatedSession } from '@features/home/access'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { workOrderCardIconRoleFor, workOrderCardIconFor, workOrderCardToneFor } from '@features/work-orders/card'
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
import { workOrderCategories } from '@features/work-orders/list-categories'
import type { WorkOrderCategory } from '@shared/ports'
import AppFeedbackState from '@shared/ui/AppFeedbackState.vue'
import AppWorkOrderSkeleton from '@shared/ui/AppWorkOrderSkeleton.vue'
import AppWorkOrderEmptyState from '@shared/ui/AppWorkOrderEmptyState.vue'
import AppMainNavigation from '@app/components/AppMainNavigation.vue'
import { appLoadingSkeletonDelayMs } from '@shared/ui/loading'

const session = useSessionStore()
const workOrders = useWorkOrderListStore()
const acceptCandidate = ref<WorkOrderSummary | null>(null)
const searchDraft = ref(workOrders.searchText)
let acceptGeneration = 0

function invalidatePendingAccept(): void {
  acceptGeneration += 1
  acceptCandidate.value = null
}

function isCurrentAcceptResult(generation: number, scope: string | null): boolean {
  return generation === acceptGeneration && scope !== null
    && scope === workOrderReadScopeKey(session.session)
}
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

onBeforeUnmount(() => {
  invalidatePendingAccept()
  clearLoadingSkeletonTimer()
})

watch(
  [() => session.status, () => workOrderReadScopeKey(session.session)],
  ([status, scope], previous) => {
    if (previous?.length && previous[1] !== scope) searchDraft.value = ''
    if (status === 'authenticated' && scope
      && (!previous || previous[0] !== status || previous[1] !== scope)) {
      invalidatePendingAccept()
      void workOrders.refresh()
    }
    if (status !== 'authenticated' && status !== 'unknown') {
      invalidatePendingAccept()
      searchDraft.value = ''
      workOrders.clear()
    }
  },
  { immediate: true, flush: 'sync' },
)

async function selectCategory(value: WorkOrderCategory): Promise<void> {
  invalidatePendingAccept()
  await workOrders.selectCategory(value)
}

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

function canOpenDetail(item: WorkOrderSummary): boolean {
  const current = workOrders.items.find(row => row.id === item.id)
  return canAccess.value && (workOrders.loadState === 'succeeded' || workOrders.isAppending)
    && Boolean(current && listActionFor(current).detailAccessible)
}

async function openDetailIfAccessible(item: WorkOrderSummary): Promise<void> {
  // A non-actionable card must not instantiate a navigator with an empty URL:
  // MP-WEIXIN reports a runtime error even when the card is never followed.
  if (!canOpenDetail(item)) return
  await workOrders.navigateTo(workOrderDetailRouteFor(item.id))
}

async function requestAccept(item: WorkOrderSummary): Promise<void> {
  if (productionReadOnly) return
  const action = listActionFor(item).acceptOrder
  if (!action) return
  const generation = acceptGeneration
  const scope = workOrderReadScopeKey(session.session)
  const result = await workOrders.acceptOrder({
    workOrderId: item.id,
    workflowNodeId: action.workflowNodeId,
  })
  if (!isCurrentAcceptResult(generation, scope)) return
  if (result.state === 'confirmation_required'
    && workOrders.items.some(current => current.id === item.id)) acceptCandidate.value = item
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
  const generation = acceptGeneration
  const scope = workOrderReadScopeKey(session.session)
  const result = await workOrders.acceptOrder({
    workOrderId: item.id,
    workflowNodeId: action.workflowNodeId,
  }, true)
  if (!isCurrentAcceptResult(generation, scope)) return
  if (result.state !== 'confirmation_required') acceptCandidate.value = null
  if (result.state === 'succeeded') {
    await workOrders.navigateTo(workOrderDetailRouteFor(item.id))
  }
}

function cancelAccept(): void {
  invalidatePendingAccept()
}
</script>

<style lang="scss">
@import "@brand-ui/work-order-list.scss";
</style>
