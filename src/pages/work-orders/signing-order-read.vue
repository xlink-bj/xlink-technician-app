<template>
  <view class="signing-read-page">
    <view class="signing-read-header">
      <text class="signing-read-title">签约前订单核验 · 只读</text>
      <text class="signing-read-help">只展示当前已授权工单的正式订单摘要。无法查看合同、生成 PDF、发送短信或发起签署。</text>
    </view>

    <AppLoadingState
      v-if="session.status === 'unknown' || review.snapshot.state === 'loading'"
      variant="inline" label="正在核验工单与正式订单"
      data-testid="signing-order-read-loading"
    />
    <view
      v-else-if="session.status !== 'authenticated' || review.snapshot.state !== 'ready'"
      class="signing-read-section"
      data-testid="signing-order-read-blocked"
    >
      <text>当前订单暂无法完成签约前只读核验。请从当前账号可见的工单报价记录重新进入。</text>
      <AppButton
        v-if="session.status === 'authenticated' && review.snapshot.state === 'failed_retryable'"
        block variant="secondary" data-testid="signing-order-read-retry"
        @tap="retryScopedRead"
      >重新核验当前订单</AppButton>
      <navigator open-type="navigateBack" :delta="1">返回工单</navigator>
    </view>
    <template v-else>
      <view class="signing-read-section" data-testid="signing-order-read-verified">
        <text class="signing-read-section-title">已核验的正式订单</text>
        <text data-testid="signing-order-read-display-number">{{ review.snapshot.review?.order.displayNumber || '正式订单' }}</text>
        <text>仅限当前工单 · {{ review.snapshot.review?.order.groups.length || 0 }} 个维修分组</text>
        <text data-testid="signing-order-read-r1-stage">{{ r1OrderSigningStageNotice(review.snapshot.review?.order.processState) }}</text>
        <text v-if="review.snapshot.review?.order.totalPrice !== undefined">
          订单金额：¥{{ review.snapshot.review.order.totalPrice.toFixed(2) }}
        </text>
        <text v-if="!review.snapshot.review?.order.contentSupported" class="signing-read-warning">
          部分订单明细暂不可识别，未推断缺失字段。
        </text>
      </view>
      <view class="signing-read-section" data-testid="signing-order-read-no-contract">
        <text class="signing-read-section-title">签约状态 · 未授权</text>
        <text>当前版本未核验合同读取权限或签署角色。正式订单存在不代表已生成合同。</text>
        <AppButton disabled block variant="secondary" data-testid="signing-order-read-contract-disabled">
          查看合同 · 未开放
        </AppButton>
        <AppButton disabled block data-testid="signing-order-read-sign-disabled">
          发起签署 · 未开放
        </AppButton>
      </view>
    </template>
    <view class="signing-read-footer" data-testid="signing-order-read-no-write">
      全程只读 · 不创建订单、不推进流程、不发起签约
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import AppButton from '@shared/ui/AppButton.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import { useSessionStore } from '@shared/state'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'
import { r1OrderSigningStageNotice } from '@features/work-orders/signing/r1-signing-ui-rules'

const session = useSessionStore()
const review = useSigningReviewReadStore()
const routeReady = ref(false)
const routeWorkOrderId = ref('')
const routeOrderId = ref('')
let requested = false

function retryScopedRead(): void {
  if (session.status !== 'authenticated' || review.snapshot.state !== 'failed_retryable') return
  // This is a fresh, fully guarded pair of read-only scoped list requests,
  // not a retry of any signing/Contract command.
  void review.load(routeWorkOrderId.value, routeOrderId.value)
}

function startIfAuthorized(): void {
  if (!routeReady.value || session.status !== 'authenticated' || requested) return
  requested = true
  void review.load(routeWorkOrderId.value, routeOrderId.value)
}

onLoad((options) => {
  routeWorkOrderId.value = typeof options?.workOrderId === 'string' ? options.workOrderId : ''
  routeOrderId.value = typeof options?.orderId === 'string' ? options.orderId : ''
  routeReady.value = true
  startIfAuthorized()
})
watch(() => session.status, (status) => {
  if (status === 'authenticated') startIfAuthorized()
  else if (status !== 'unknown') review.clear()
}, { immediate: true })
onUnload(() => {
  requested = true
  review.clear()
})
</script>

<style>
.signing-read-page { min-height: 100vh; padding: 28rpx; background: var(--app-color-page); color: var(--app-color-text-primary); }
.signing-read-header, .signing-read-section { display: flex; flex-direction: column; gap: 18rpx; padding: 28rpx; margin-bottom: 20rpx; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); }
.signing-read-title { font-size: 36rpx; font-weight: 800; }
.signing-read-section-title { font-size: 29rpx; font-weight: 700; }
.signing-read-help, .signing-read-warning, .signing-read-footer { font-size: 24rpx; color: var(--app-color-text-secondary); line-height: 1.6; }
.signing-read-footer { text-align: center; margin: 28rpx 0 52rpx; }
</style>
