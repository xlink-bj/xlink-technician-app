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
      <view class="signing-read-section" data-testid="signing-order-read-contract-status">
        <text class="signing-read-section-title">R1 合同状态 · 只读核验</text>
        <text v-if="devFixtureContractRead" data-testid="signing-contract-fixture-label">DEV 合成合同演示 · 非真实订单、非真实签约</text>
        <text>合同可能与同一工单的其他订单关联；这里只核验当前选中的正式订单。部分结果或空结果不能证明不存在合同。</text>
        <text v-if="!devFixtureContractRead" data-testid="signing-contract-prod-blocked">
          真实环境合同读取尚未开放。仅 DEV 隔离合成样本可核验状态，不能代表生产签约。
        </text>
        <AppButton
          v-else-if="review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable'"
          block variant="secondary" data-testid="signing-contract-read-request" @tap="readContracts"
        >{{ review.contractSnapshot.state === 'failed_retryable' ? '重新核验合同状态' : '读取当前订单合同状态' }}</AppButton>
        <AppLoadingState v-if="review.contractSnapshot.state === 'loading'"
          variant="inline" label="正在只读核验合同状态" />
        <text v-if="review.contractSnapshot.state === 'failed_terminal'">合同核验未通过。没有读取签署文件，也没有执行签约。</text>
        <template v-if="review.contractSnapshot.state === 'succeeded'">
          <text v-if="review.contractSnapshot.items.length === 0" data-testid="signing-contract-inconclusive">
            当前有限查询尚未核验到此订单合同；可能受 R1 旧字段映射或分页影响，不能认定合同不存在。
          </text>
          <view v-for="contract in review.contractSnapshot.items" :key="contract.id" class="signing-read-contract-item"
            data-testid="signing-contract-matched">
            <text>{{ contract.displayNumber || '合同编号未返回' }}</text>
            <text>{{ r1ContractStatusReadNotice(contract.contractStatus) }}</text>
            <text v-if="contract.signedDate">记录中的签约日期：{{ contract.signedDate }}</text>
          </view>
          <text class="signing-read-warning">仅限本次已核验的有限结果，不代表拥有签约权限或可访问合同文件。</text>
        </template>
      </view>
      <view class="signing-read-section" data-testid="signing-read-reconciled-status">
        <text class="signing-read-section-title">签约阶段综合核验 · 只读</text>
        <text data-testid="signing-read-stage-title">{{ signingStage.title }}</text>
        <text data-testid="signing-read-stage-detail">{{ signingStage.detail }}</text>
        <text class="signing-read-warning">本页没有调用签署、取消合同、发送短信、创建 PDF 或工作流提交接口。</text>
      </view>
      <view class="signing-read-section" data-testid="signing-order-read-no-contract">
        <text class="signing-read-section-title">签约业务操作 · 未开放</text>
        <text>即使 DEV 样本显示合同记录，也不授予真实合同查看、签章或重复发送权限。</text>
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
import { computed, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import AppButton from '@shared/ui/AppButton.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import { useSessionStore } from '@shared/state'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'
import { r1OrderSigningStageNotice, r1ContractStatusReadNotice } from '@features/work-orders/signing/r1-signing-ui-rules'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { isDevSyntheticContractReadPreviewEnabled } from '@app/business-mock'
import { reconcileR1SigningRead } from '@features/work-orders/signing/r1-signing-read-reconciliation'

const session = useSessionStore()
const review = useSigningReviewReadStore()
const productionReadOnly = isProductionReadOnlyRuntime()
const signingStage = computed(() => reconcileR1SigningRead(
  review.snapshot.state === 'ready' ? review.snapshot.review?.order : null,
  review.contractSnapshot,
))
const devFixtureContractRead = computed(() => !productionReadOnly
  && isDevSyntheticContractReadPreviewEnabled(routeWorkOrderId.value))
function readContracts(): void {
  // This is user-triggered and never bypasses Production's transport gate.
  if (!devFixtureContractRead.value || review.snapshot.state !== 'ready') return
  void review.loadContracts()
}
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
