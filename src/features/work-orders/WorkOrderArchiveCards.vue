<template>
  <!-- Keep card border and inset on the same native node: MP custom-component
       hosts do not forward the caller’s scoped classes to their inner view. -->
  <view class="archive-stack" data-testid="work-order-archives">
    <view class="app-record-card archive-card information-card" data-testid="follow-up-summary">
      <view class="archive-heading">
        <text class="archive-title">跟进记录</text>
        <navigator v-if="activities.length || hasHistory" :url="route('follow-up')" class="archive-link" data-testid="follow-up-all">
          {{ activities.length ? `查看全部 ${activities.length} 条` : '查看已完成记录' }} ›
        </navigator>
      </view>
      <text v-if="followUpMessage" class="archive-hint" :class="{ 'archive-hint--error': followUpReadFailed }" data-testid="follow-up-read-message">{{ followUpMessage }}</text>
      <view v-if="activities.length" class="follow-up-timeline" data-testid="follow-up-timeline" role="list">
        <view v-for="(activity, index) in activities.slice(0, 2)" :key="activity.id"
          class="follow-up-timeline__item" data-testid="follow-up-timeline-item" role="listitem">
          <view class="follow-up-timeline__rail" aria-hidden="true">
            <view v-if="index < Math.min(activities.length, 2) - 1" class="follow-up-timeline__line" data-testid="follow-up-timeline-line" />
            <view class="follow-up-timeline__dot" data-testid="follow-up-timeline-dot" />
          </view>
          <view class="follow-up-timeline__body">
            <text class="archive-entry-title">{{ activity.title }}</text>
            <text v-if="activity.content" class="archive-copy">{{ activity.content }}</text>
            <text class="archive-hint">{{ activity.owner }} · {{ activity.time }}</text>
          </view>
        </view>
      </view>
    </view>

    <slot name="appointment" />
    <navigator :url="route('customer')" class="archive-navigator" data-testid="customer-summary">
      <view class="app-record-card archive-card">
        <view class="archive-heading"><text class="archive-title">客户资料</text><text class="archive-link">查看详情 ›</text></view>
        <text class="archive-copy">{{ customerSummary }}</text>
      </view>
    </navigator>

    <view v-for="archive in archives" :key="archive.kind">
      <navigator v-if="orderState === 'succeeded' && archive.complete && archive.items.length === 1"
        :url="route('quotation', archive.items[0]!.id)" class="archive-navigator" data-testid="order-archive-single">
        <view class="app-record-card archive-card" data-testid="order-archive-summary">
        <view class="archive-heading"><text class="archive-title">{{ archive.title }}</text><text class="archive-link">1 笔 ›</text></view>
        <text class="archive-entry-title">{{ orderTitle(archive.items[0]!) }}</text>
        <text class="archive-copy">{{ orderAmount(archive.items[0]!) }}</text>
        <text v-if="archive.items[0]!.updateTime" class="archive-hint">订单更新：{{ archive.items[0]!.updateTime }}</text>
        </view>
      </navigator>
      <view v-else class="app-record-card archive-card" data-testid="order-archive-summary">
        <view class="archive-heading">
          <text class="archive-title">{{ archive.title }}</text>
          <text v-if="orderState === 'succeeded' && archive.complete && !archive.items.length" class="archive-hint" data-testid="order-archive-empty">尚未产生正式订单</text>
          <navigator v-if="orderState === 'succeeded' && archive.items.length" :url="route('quotation')" class="archive-link" data-testid="order-archive-all">
            {{ archive.complete ? `查看全部 ${archive.total} 笔` : '查看已读取记录' }} ›
          </navigator>
        </view>
        <view v-if="orderState === 'idle'" class="archive-failure">
          <text class="archive-hint">订单记录尚未读取</text>
          <AppButton variant="text" size="compact" data-testid="order-archive-load" @tap="$emit('retry-orders')">读取订单</AppButton>
        </view>
        <text v-else-if="orderState === 'loading'" class="archive-hint">正在读取订单记录…</text>
        <view v-else-if="orderState !== 'succeeded'" class="archive-failure" data-testid="order-archive-error">
          <text class="archive-hint" :class="{ 'archive-hint--error': isOrderReadFailure() }" data-testid="order-archive-read-message">{{ orderError || '订单暂时无法读取' }}</text>
          <AppButton variant="text" size="compact" @tap="$emit('retry-orders')">重新读取</AppButton>
        </view>
        <template v-else>
          <text v-if="!archive.items.length && !archive.complete" class="archive-hint" data-testid="order-archive-empty">暂未核验到订单，完整数量待确认</text>
          <navigator v-for="order in archive.items.slice(0, 2)" :key="order.id" :url="route('quotation', order.id)"
            class="archive-entry archive-navigator" data-testid="order-archive-item">
            <view class="archive-heading"><text class="archive-entry-title">{{ orderTitle(order) }}</text><text class="archive-link">查看 ›</text></view>
            <text class="archive-copy">{{ orderAmount(order) }}</text>
            <text v-if="order.updateTime" class="archive-hint">订单更新：{{ order.updateTime }}</text>
          </navigator>
          <text v-if="archive.items.length && !archive.complete" class="archive-hint" data-testid="order-archive-partial">已读取 {{ archive.items.length }} 笔，完整数量待确认</text>
        </template>
      </view>
    </view>

    <!-- Other business archives need a verified node/record/read capability.
         A fixed unknown-status placeholder does not establish applicability. -->
  </view>
</template>

<script setup lang="ts">
import type { QuotationOrderBrowseItem, WorkOrderActivity } from '@shared/ports'
import AppButton from '@shared/ui/AppButton.vue'
import { detailReadRoute, type DetailReadView, type OrderArchiveSummary } from './detail-archive'
const props = defineProps<{
  readonly workOrderId: string
  readonly activities: readonly WorkOrderActivity[]
  readonly followUpMessage: string
  readonly followUpReadFailed?: boolean
  readonly hasHistory: boolean
  readonly customerSummary: string
  readonly archives: readonly OrderArchiveSummary[]
  readonly orderState: string
  readonly orderError: string
}>()
defineEmits<{ 'retry-orders': [] }>()
// The browse surface combines denial/unknown with failures in its terminal state.
// Tint only its explicit read-failure copy; permissions and unknowns stay neutral.
function isOrderReadFailure() {
  return (props.orderState === 'failed_retryable' || props.orderState === 'failed_terminal')
    && props.orderError === '暂时无法读取正式订单，请稍后重试。'
}
function route(view: DetailReadView, orderId?: string) { return detailReadRoute(props.workOrderId, view, orderId) }
function orderTitle(order: QuotationOrderBrowseItem) { return order.displayNumber ? `订单 ${order.displayNumber}` : '正式订单' }
function orderAmount(order: QuotationOrderBrowseItem) { return order.totalPrice === undefined ? '金额暂未确认' : `订单金额 ¥${order.totalPrice.toFixed(2)}` }
</script>

<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
</style>
