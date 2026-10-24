<template>
  <view v-if="authorized" class="mock-commerce-links app-surface" data-testid="mock-commerce-handoff">
    <view class="mock-commerce-links__head">
      <text class="mock-commerce-links__title">报价后续资料核对</text>
      <text class="mock-commerce-links__scope">仅本机合成数据</text>
    </view>
    <text class="mock-commerce-links__help" data-testid="mock-commerce-progress">
      {{ progress.complete ? '三个资料核对点均完成 · 仅本机演示' : progress.paused ? '本机核对已暂停，可恢复' : `已核对 ${progress.confirmed.length}/3 项 · 不影响后台工单` }}
    </text>
    <view class="mock-commerce-links__review-actions">
      <AppButton v-if="!progress.confirmed.includes('quotation_preview')" variant="secondary"
        data-testid="mock-commerce-confirm-quotation" :disabled="progress.paused"
        @tap="confirmQuotation">确认已核对报价入口 · 本机</AppButton>
      <AppButton v-if="!progress.complete" variant="text" data-testid="mock-commerce-toggle-pause"
        @tap="togglePause">{{ progress.paused ? '恢复本机核对' : '暂停本机核对' }}</AppButton>
      <AppButton v-if="progress.confirmed.length && !progress.paused" variant="text"
        data-testid="mock-commerce-revoke-last" @tap="revokeLast">撤销最近一次本机核对</AppButton>
    </view>
    <text v-if="feedback" class="mock-commerce-links__help" data-testid="mock-commerce-feedback">{{ feedback }}</text>
    <navigator :url="materialSkuReviewUrl()" class="mock-commerce-links__item"
      data-testid="mock-journey-sku-review">
      <view class="mock-commerce-links__copy">
        <text class="mock-commerce-links__item-title">材料规格与 SKU</text>
        <text class="mock-commerce-links__help">核对销售属性及唯一 SKU，不读取库存或提交报价。</text>
        <text v-if="progress.confirmed.includes('sku_review')" class="mock-commerce-links__check">本机已核对</text>
      </view>
      <text class="mock-commerce-links__arrow" aria-hidden="true">›</text>
    </navigator>
    <navigator :url="signingMockReviewUrl()" class="mock-commerce-links__item"
      data-testid="mock-journey-signing-review">
      <view class="mock-commerce-links__copy">
        <text class="mock-commerce-links__item-title">订单与合同关系 · 签约 Mock</text>
        <text class="mock-commerce-links__help">独立的正式订单与合同合成样本；本机报价未提交，不会生成可签约订单。</text>
        <text v-if="progress.complete" class="mock-commerce-links__check">本机关系核对完成（并非已签约）</text>
      </view>
      <text class="mock-commerce-links__arrow" aria-hidden="true">›</text>
    </navigator>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { mockJourneyContext } from '@app/mock-journey'
import { canReadMaterialSkuMock, materialSkuReviewUrl } from '@app/material-sku-mock-review'
import { signingMockReviewUrl } from '@app/signing-mock-review'
import AppButton from '@shared/ui/AppButton.vue'
import {
  confirmMockCommercialCheckpoint, pauseMockCommercialReview,
  readMockCommercialProgress, resumeMockCommercialReview, revokeLastMockCommercialCheckpoint,
} from '@app/mock-commercial-journey'

const props = defineProps<{ readonly workOrderId: string;
  readonly userId?: string; readonly roleId?: string }>()
const authorized = computed(() => mockJourneyContext(props.workOrderId)?.stage === 'quotation'
  && canReadMaterialSkuMock({workOrderId:props.workOrderId,
    userId:props.userId,roleId:props.roleId}))
const revision = ref(0)
const feedback = ref('')
const scope = computed(() => ({ workOrderId: props.workOrderId, userId: props.userId, roleId: props.roleId }))
const progress = computed(() => {
  void revision.value
  return readMockCommercialProgress(scope.value)
})
onShow(() => { revision.value += 1 })
function confirmQuotation(): void {
  feedback.value = confirmMockCommercialCheckpoint(scope.value, 'quotation_preview')
    ? '报价工作台入口已核对；仅记录本机浏览进度，未提交报价。'
    : '尚不能记录核对结果，请确认本机流程未暂停。'
  revision.value += 1
}
function togglePause(): void {
  const wasPaused = progress.value.paused
  const ok = wasPaused ? resumeMockCommercialReview(scope.value) : pauseMockCommercialReview(scope.value)
  feedback.value = ok ? (wasPaused ? '已恢复本机核对；之前的结果仍保留。' : '本机核对已暂停；可稍后恢复。') : '本机状态保存失败。'
  revision.value += 1
}
function revokeLast(): void {
  feedback.value = revokeLastMockCommercialCheckpoint(scope.value)
    ? '已撤销最近一项本机核对，之前的资料仍保留；后台业务未发生变化。'
    : '本机核对撤销失败。'
  revision.value += 1
}
</script>

<style scoped>
.mock-commerce-links { margin: 20rpx 24rpx; padding: 20rpx 24rpx; }
.mock-commerce-links__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12rpx; margin-bottom: 12rpx; }
.mock-commerce-links__title { font-size: 30rpx; color: var(--app-color-text-primary); font-weight: 650; }
.mock-commerce-links__scope { font-size: 21rpx; color: var(--app-color-text-secondary); }
.mock-commerce-links__item { display: flex; align-items: center; justify-content: space-between; gap: 18rpx;
  padding: 18rpx 0; min-height: 88rpx; border-top: 1rpx solid var(--app-color-border); }
.mock-commerce-links__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
.mock-commerce-links__item-title { color: var(--app-color-text-primary); font-size: 28rpx; font-weight: 600; }
.mock-commerce-links__help { color: var(--app-color-text-secondary); font-size: 22rpx; line-height: 1.5; }
.mock-commerce-links__arrow { color: var(--app-color-text-secondary); font-size: 36rpx; }
.mock-commerce-links__review-actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin: 14rpx 0; }
.mock-commerce-links__review-actions .app-button { min-height: 88rpx; }
.mock-commerce-links__check { color: var(--app-color-primary); font-size: 22rpx; font-weight: 650; }
</style>
