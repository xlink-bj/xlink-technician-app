<template>
  <view v-if="authorized" class="mock-commerce-links app-surface" data-testid="mock-commerce-handoff">
    <view class="mock-commerce-links__head">
      <text class="mock-commerce-links__title">报价后续资料核对</text>
      <text class="mock-commerce-links__scope">仅本机合成数据</text>
    </view>
    <navigator :url="materialSkuReviewUrl()" class="mock-commerce-links__item"
      data-testid="mock-journey-sku-review">
      <view class="mock-commerce-links__copy">
        <text class="mock-commerce-links__item-title">材料规格与 SKU</text>
        <text class="mock-commerce-links__help">核对销售属性及唯一 SKU，不读取库存或提交报价。</text>
      </view>
      <text class="mock-commerce-links__arrow" aria-hidden="true">›</text>
    </navigator>
    <navigator :url="signingMockReviewUrl()" class="mock-commerce-links__item"
      data-testid="mock-journey-signing-review">
      <view class="mock-commerce-links__copy">
        <text class="mock-commerce-links__item-title">订单与合同关系 · 签约 Mock</text>
        <text class="mock-commerce-links__help">独立的正式订单与合同合成样本；本机报价未提交，不会生成可签约订单。</text>
      </view>
      <text class="mock-commerce-links__arrow" aria-hidden="true">›</text>
    </navigator>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { mockJourneyContext } from '@app/mock-journey'
import { canReadMaterialSkuMock, materialSkuReviewUrl } from '@app/material-sku-mock-review'
import { signingMockReviewUrl } from '@app/signing-mock-review'

const props = defineProps<{ readonly workOrderId: string;
  readonly userId?: string; readonly roleId?: string }>()
const authorized = computed(() => mockJourneyContext(props.workOrderId)?.stage === 'quotation'
  && canReadMaterialSkuMock({workOrderId:props.workOrderId,
    userId:props.userId,roleId:props.roleId}))
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
</style>
