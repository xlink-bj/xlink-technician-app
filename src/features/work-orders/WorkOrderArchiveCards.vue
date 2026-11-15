<template>
  <view class="archive-stack" data-testid="work-order-archives">
    <AppRecordCard class="archive-card information-card" data-testid="follow-up-summary">
      <view class="archive-heading">
        <text class="archive-title">跟进记录</text>
        <navigator v-if="activities.length || hasHistory" :url="route('follow-up')" class="archive-link" data-testid="follow-up-all">
          {{ activities.length ? `查看全部 ${activities.length} 条` : '查看已完成记录' }} ›
        </navigator>
      </view>
      <text v-if="followUpMessage" class="archive-hint">{{ followUpMessage }}</text>
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
    </AppRecordCard>

    <navigator :url="route('customer')" class="archive-navigator" data-testid="customer-summary">
      <AppRecordCard class="archive-card">
        <view class="archive-heading"><text class="archive-title">客户资料</text><text class="archive-link">查看详情 ›</text></view>
        <text class="archive-copy">{{ customerSummary }}</text>
      </AppRecordCard>
    </navigator>

    <view v-for="archive in archives" :key="archive.kind">
      <navigator v-if="orderState === 'succeeded' && archive.complete && archive.items.length === 1"
        :url="route('quotation', archive.items[0]!.id)" class="archive-navigator" data-testid="order-archive-single">
        <AppRecordCard class="archive-card" data-testid="order-archive-summary">
        <view class="archive-heading"><text class="archive-title">{{ archive.title }}</text><text class="archive-link">1 笔 ›</text></view>
        <text class="archive-entry-title">{{ orderTitle(archive.items[0]!) }}</text>
        <text class="archive-copy">{{ orderAmount(archive.items[0]!) }}</text>
        <text v-if="archive.items[0]!.updateTime" class="archive-hint">订单更新：{{ archive.items[0]!.updateTime }}</text>
        </AppRecordCard>
      </navigator>
      <AppRecordCard v-else class="archive-card" data-testid="order-archive-summary">
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
          <text class="archive-hint">{{ orderError || '订单暂时无法读取' }}</text>
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
      </AppRecordCard>
    </view>

    <!-- Neither category has a verified detail-page read port. A separate
         signing read route does not prove document access or applicability. -->
    <AppRecordCard class="archive-card" data-testid="contract-archive-unverified">
      <view class="archive-heading"><text class="archive-title">合同</text></view>
      <text class="archive-hint">合同状态待确认</text>
    </AppRecordCard>
    <AppRecordCard class="archive-card" data-testid="warranty-archive-unverified">
      <view class="archive-heading"><text class="archive-title">质保</text></view>
      <text class="archive-hint">质保状态待确认</text>
    </AppRecordCard>
  </view>
</template>

<script setup lang="ts">
import type { QuotationOrderBrowseItem, WorkOrderActivity } from '@shared/ports'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppButton from '@shared/ui/AppButton.vue'
import { detailReadRoute, type DetailReadView, type OrderArchiveSummary } from './detail-archive'
const props = defineProps<{
  readonly workOrderId: string
  readonly activities: readonly WorkOrderActivity[]
  readonly followUpMessage: string
  readonly hasHistory: boolean
  readonly customerSummary: string
  readonly archives: readonly OrderArchiveSummary[]
  readonly orderState: string
  readonly orderError: string
}>()
defineEmits<{ 'retry-orders': [] }>()
function route(view: DetailReadView, orderId?: string) { return detailReadRoute(props.workOrderId, view, orderId) }
function orderTitle(order: QuotationOrderBrowseItem) { return order.displayNumber ? `订单 ${order.displayNumber}` : '正式订单' }
function orderAmount(order: QuotationOrderBrowseItem) { return order.totalPrice === undefined ? '金额暂未确认' : `订单金额 ¥${order.totalPrice.toFixed(2)}` }
</script>

<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
</style>
