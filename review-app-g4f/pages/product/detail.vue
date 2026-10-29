<template>
  <view class="product-detail-page" data-testid="commercial-review-detail">
    <navigator class="product-detail-back" open-type="navigateBack" delta="1">‹ 返回工单</navigator>
    <view class="product-detail-card">
      <view class="product-detail-title-row">
        <text class="product-detail-title">{{ detail.detail?.customerName || '维修服务工单' }}</text>
        <text class="product-detail-state">待报价</text>
      </view>
      <text class="product-detail-number">工单 #{{ detail.detail?.displayNumber || '—' }}</text>
      <view class="product-detail-separator" />
      <text class="product-detail-label">当前任务</text>
      <text class="product-detail-task">编制维修报价方案</text>
      <text class="product-detail-description">确认维修部位、工作量和产品配置，形成报价草稿。</text>
      <text v-if="detail.detail?.serviceAddress" class="product-detail-address">{{ detail.detail.serviceAddress }}</text>
      <AppButton
        variant="primary"
        block
        :disabled="session.status !== 'authenticated' || detail.loadState !== 'succeeded'"
        data-testid="commercial-review-start-quotation"
        @tap="goToQuotation"
      >开始报价</AppButton>
      <AppStatus
        v-if="detail.loadState === 'failed_terminal' || detail.loadState === 'failed_retryable'"
        message="演示工单暂时无法读取；不会连接真实服务。"
        tone="warning"
        quiet
      />
    </view>
    <text class="product-detail-safe">演示数据 · 所有正式提交操作均已禁用</text>
  </view>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useSessionStore } from '@shared/state'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { mockCommandScenarioIds } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'

const session = useSessionStore()
const detail = useWorkOrderDetailStore()
watch(() => session.status, (status) => {
  if (status === 'authenticated') {
    void detail.load(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.quotationFoundation))
  }
}, { immediate: true })

function goToQuotation(): void {
  if (session.status !== 'authenticated' || detail.loadState !== 'succeeded') return
  uni.navigateTo({ url: '/pages/product/quotation' })
}
</script>

<style scoped>
.product-detail-page { background: #f3f6fa; box-sizing: border-box; min-height: 100vh; padding: 24rpx 28rpx; }
.product-detail-back { color: #3978e9; display: block; font-size: 25rpx; padding: 10rpx 4rpx 28rpx; }
.product-detail-card { background: #fff; border: 1rpx solid #e7edf7; border-radius: 24rpx; padding: 30rpx; }
.product-detail-title-row { align-items: center; display: flex; justify-content: space-between; }
.product-detail-title { color: #20304b; font-size: 33rpx; font-weight: 800; }
.product-detail-state { background: #eaf2ff; border-radius: 28rpx; color: #2875ed; font-size: 21rpx; padding: 6rpx 14rpx; }
.product-detail-address { color: #7c8999; display: block; font-size: 22rpx; margin: -16rpx 0 24rpx; }
.product-detail-number,.product-detail-label { color: #8491a6; display: block; font-size: 22rpx; margin-top: 14rpx; }
.product-detail-separator { border-top: 1rpx solid #eaf0f9; margin: 30rpx 0; }
.product-detail-task { color: #1e2f4a; display: block; font-size: 32rpx; font-weight: 800; margin-top: 9rpx; }
.product-detail-description { color: #72819a; display: block; font-size: 25rpx; line-height: 1.65; margin: 16rpx 0 38rpx; }
.product-detail-safe { color: #95a0b1; display: block; font-size: 21rpx; margin-top: 28rpx; text-align: center; }
</style>
