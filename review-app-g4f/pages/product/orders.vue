<template>
  <view class="product-review-page" data-testid="commercial-review-orders">
    <view class="product-review-top">
      <text class="product-review-kicker">今日任务</text>
      <text class="product-review-title">我的工单</text>
      <text class="product-review-subtitle">查看需要处理的服务任务</text>
    </view>

    <view class="product-review-section">
      <view class="product-review-section-heading">
        <text>待处理报价</text>
        <text class="product-review-count">{{ item ? '1 个工单' : '当前无工单' }}</text>
      </view>
      <navigator
        v-if="item"
        class="product-review-order-card"
        url="/pages/product/detail"
        data-testid="commercial-review-open-detail"
      >
        <view class="product-review-row">
          <text class="product-review-order-name">{{ item.customerName || '维修服务工单' }}</text>
          <text class="product-review-state">待报价</text>
        </view>
        <text class="product-review-meta">工单 #{{ item.displayNumber || '—' }}</text>
        <text v-if="item.serviceAddress" class="product-review-address">{{ item.serviceAddress }}</text>
        <view class="product-review-card-footer">
          <text>查看工单并继续报价</text>
          <text class="product-review-chevron">›</text>
        </view>
      </navigator>
      <view v-else class="product-review-empty" data-testid="commercial-review-list-state">
        {{ list.loadState === 'loading' || session.status !== 'authenticated'
          ? '正在加载工单…'
          : list.loadState === 'succeeded' ? '暂无可以演示报价的工单' : '演示工单暂不可用，请检查本地 Mock 数据。' }}
      </view>
    </view>

    <text class="product-review-disclaimer">演示数据 · 不涉及真实客户或业务提交</text>
  </view>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSessionStore } from '@shared/state'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { mockCommandScenarioIds } from '@adapters/api/mock'

const session = useSessionStore()
const list = useWorkOrderListStore()
const item = computed(() => list.items.find((row) => String(row.id) === mockCommandScenarioIds.quotationFoundation))
watch(() => session.status, (status) => {
  if (status === 'authenticated') void list.load({ refresh: true })
}, { immediate: true })
</script>

<style scoped>
.product-review-page { background: #f3f6fa; box-sizing: border-box; min-height: 100vh; padding: 36rpx 28rpx; }
.product-review-top { display: flex; flex-direction: column; gap: 8rpx; padding: 16rpx 4rpx 40rpx; }
.product-review-kicker { color: #286ff0; font-size: 23rpx; font-weight: 650; }
.product-review-title { color: #1c2940; font-size: 43rpx; font-weight: 800; }
.product-review-subtitle { color: #77859a; font-size: 25rpx; }
.product-review-section { background: #fff; border: 1rpx solid #e6edf7; border-radius: 24rpx; padding: 28rpx; }
.product-review-section-heading,.product-review-row,.product-review-card-footer { align-items: center; display: flex; justify-content: space-between; }
.product-review-section-heading { color: #223148; font-size: 29rpx; font-weight: 750; margin-bottom: 26rpx; }
.product-review-count { color: #8391a6; font-size: 22rpx; font-weight: 400; }
.product-review-order-card { border: 1rpx solid #dfe8f6; border-radius: 18rpx; overflow: hidden; padding: 25rpx; }
.product-review-order-name { color: #25324b; font-size: 29rpx; font-weight: 750; }
.product-review-state { background: #eaf2ff; border-radius: 25rpx; color: #2876ee; font-size: 21rpx; padding: 7rpx 14rpx; }
.product-review-empty { color: #8290a6; font-size: 25rpx; padding: 22rpx 8rpx; }
.product-review-address { color: #7f8b9b; display: block; font-size: 22rpx; margin-top: 9rpx; }
.product-review-meta { color: #78869b; display: block; font-size: 23rpx; margin-top: 12rpx; }
.product-review-card-footer { border-top: 1rpx solid #eef2f8; color: #2876ee; font-size: 25rpx; margin-top: 22rpx; padding-top: 20rpx; }
.product-review-chevron { font-size: 34rpx; }
.product-review-disclaimer { color: #97a3b4; display: block; font-size: 21rpx; margin: 32rpx 8rpx; text-align: center; }
</style>
