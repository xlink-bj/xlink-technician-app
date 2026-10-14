<template>
  <view class="signing-read-page">
    <view class="signing-read-header">
      <text class="signing-read-eyebrow">订单签约 · 当前工单</text>
      <text class="signing-read-title">签约进度</text>
      <text class="signing-read-help">查看订单与合同进度，了解当前签约状态。</text>
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
        <view class="signing-read-heading-row">
          <text class="signing-read-section-title">订单信息</text>
          <text class="signing-read-tag">身份已核验</text>
        </view>
        <text class="signing-read-order-number" data-testid="signing-order-read-display-number">{{ review.snapshot.review?.order.displayNumber || '正式订单' }}</text>
        <text class="signing-read-meta">仅限当前工单 · {{ review.snapshot.review?.order.groups.length || 0 }} 个维修分组</text>
        <text class="signing-read-order-note" data-testid="signing-order-read-r1-stage">{{ r1OrderSigningStageNotice(review.snapshot.review?.order.processState) }}</text>
        <view v-if="review.snapshot.review?.order.totalPrice !== undefined" class="signing-read-amount">
          <text class="signing-read-meta">订单金额</text>
          <text class="signing-read-amount-value">¥{{ review.snapshot.review.order.totalPrice.toFixed(2) }}</text>
        </view>
        <text v-if="!review.snapshot.review?.order.contentSupported" class="signing-read-warning">
          部分订单明细暂不可识别，未推断缺失字段。
        </text>
      </view>
      <view class="signing-read-section signing-read-section--progress" data-testid="signing-review-progress">
        <text class="signing-read-section-title">签约进度</text>
        <text class="signing-read-progress-title">{{ signingProgress.title }}</text>
        <text class="signing-read-body" data-testid="signing-review-next">{{ signingProgress.nextStep }}</text>
        <text class="signing-read-warning">只读进度，不代表当前账号具有签署或短信发送权限。</text>
      </view>
      <view class="signing-read-section" data-testid="signing-order-read-contract-status">
        <view class="signing-read-heading-row">
          <text class="signing-read-section-title">合同状态</text>
          <text class="signing-read-tag signing-read-tag--neutral">仅核验</text>
        </view>
        <text v-if="devFixtureContractRead" class="signing-read-dev-note" data-testid="signing-contract-fixture-label">DEV 合成合同演示 · 非真实订单、非真实签约</text>
        <text class="signing-read-help">按当前正式订单核验合同，不包含其他订单。查询为空或不完整时，不能认定合同不存在。</text>
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
            当前有限查询尚未核验到此订单合同；可能受分页及可见范围影响，不能认定合同不存在。
          </text>
          <view v-for="contract in review.contractSnapshot.items" :key="contract.id" class="signing-read-contract-item"
            data-testid="signing-contract-matched">
            <text class="signing-read-contract-number">{{ contract.displayNumber || '合同编号未返回' }}</text>
            <text class="signing-read-contract-state">{{ r1ContractStatusReadNotice(contract.contractStatus) }}</text>
            <text v-if="contract.signedDate" class="signing-read-meta">记录中的签约日期：{{ contract.signedDate }}</text>
          </view>
          <text class="signing-read-warning">仅限本次已核验的有限结果，不代表拥有签约权限或可访问合同文件。</text>
        </template>
      </view>
      <view class="signing-read-section" data-testid="signing-read-reconciled-status">
        <text class="signing-read-section-title">当前结果</text>
        <text class="signing-read-progress-title" data-testid="signing-read-stage-title">{{ signingStage.title }}</text>
        <text class="signing-read-body" data-testid="signing-read-stage-detail">{{ signingStage.detail }}</text>
        <text class="signing-read-warning">本页没有调用签署、取消合同、发送短信、创建 PDF 或工作流提交接口。</text>
      </view>
      <view v-if="devFixtureContractRead" class="signing-read-section signing-read-section--diagnostics" data-testid="signing-command-preflight">
        <view class="signing-read-heading-row">
          <view class="signing-read-diagnostics-copy">
            <text class="signing-read-section-title">测试环境 · 技术核验</text>
            <text class="signing-read-help">仅供内部核对，不是签约业务操作</text>
          </view>
          <button class="signing-read-diagnostics-toggle"
            data-testid="signing-command-preflight-toggle"
            :aria-expanded="devAuditExpanded"
            @tap="devAuditExpanded = !devAuditExpanded">
            {{ devAuditExpanded ? '收起' : '查看详情' }}
          </button>
        </view>
        <view v-show="devAuditExpanded" class="signing-read-diagnostics-details" data-testid="signing-command-preflight-details">
        <AppButton block variant="secondary" data-testid="signing-handler-evidence-check"
          :disabled="review.handlerSnapshot.state === 'loading'" @tap="readNodeHandlerEvidence">
          {{ review.handlerSnapshot.state === 'loading' ? '正在核验当前节点' : '核验当前工作流节点处理人 · 只读' }}
        </AppButton>
        <text data-testid="signing-handler-evidence-result">
          {{ review.handlerSnapshot.reason || '处理人身份尚未进行独立只读核验' }}
        </text>
        <text>这是命令契约和风险提示，不是确认签约；此页没有签约 API 发送功能。</text>
        <AppButton v-for="kind in intentKinds" :key="kind" block variant="secondary"
          :data-testid="'signing-intent-' + kind" @tap="inspectIntent(kind)">
          检查{{ r1SigningIntentDescriptors[kind].title }}条件
        </AppButton>
        <view v-if="intentReview" data-testid="signing-intent-review">
          <text data-testid="signing-intent-assessment">
            {{ intentReview.assessment === 'candidate' ? 'R1 界面条件候选（真实操作仍禁止）'
              : intentReview.assessment === 'source_conflict' ? 'R1 前后端源码存在冲突'
                : '条件不足：拒绝执行' }}
          </text>
          <text data-testid="signing-intent-route">源码接口：{{ intentReview.descriptor.route }}</text>
          <text>影响：{{ intentReview.descriptor.effect }}</text>
          <text>回查：{{ intentReview.descriptor.expectedReadback }}</text>
          <text v-for="(reason, index) in intentReview.reasons" :key="index"
            data-testid="signing-intent-reason">· {{ reason }}</text>
          <AppButton variant="secondary" data-testid="signing-intent-back-to-list" @tap="selectedIntent = null">返回其他操作检查</AppButton>
          <text class="signing-read-warning" data-testid="signing-intent-no-dispatch">
            仅准备/审查 · 不发送业务命令 · 无法从本页生成真实签约请求
          </text>
        </view>
        </view>
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
import { signingReviewProgress } from '@features/work-orders/signing/signing-review-progress'
import { reviewR1SigningIntent, r1SigningIntentDescriptors, type R1SigningIntentKind } from '@features/work-orders/signing/r1-signing-command-intents'

const session = useSessionStore()
const review = useSigningReviewReadStore()
const productionReadOnly = isProductionReadOnlyRuntime()
const signingStage = computed(() => reconcileR1SigningRead(
  review.snapshot.state === 'ready' ? review.snapshot.review?.order : null,
  review.contractSnapshot,
))
const signingProgress = computed(() => signingReviewProgress({
  orderVerified: review.snapshot.state === 'ready',
  contractState: review.contractSnapshot.state,
  stage: signingStage.value.stage,
  handlerState: review.handlerSnapshot.state,
}))
const intentKinds: readonly R1SigningIntentKind[] = ['electronic','offline','resign','resend_sms','cancel']
const selectedIntent = ref<R1SigningIntentKind | null>(null)
const devAuditExpanded = ref(false)
const intentReview = computed(() => {
  if (!selectedIntent.value || !devFixtureContractRead.value || review.snapshot.state !== 'ready') return null
  const order = review.snapshot.review?.order ?? null
  const matchingContracts = review.contractSnapshot.items.filter(c => c.orderId === routeOrderId.value)
  return reviewR1SigningIntent(selectedIntent.value, {
    workOrderId: routeWorkOrderId.value, selectedOrderId: routeOrderId.value,
    officialOrder: order,
    contractState: review.contractSnapshot.state, contracts: review.contractSnapshot.items,
    ...(matchingContracts.length === 1 ? { selectedContractId: matchingContracts[0]!.id } : {}),
    currentRoleWorkOrderVerified: review.snapshot.workOrderId === routeWorkOrderId.value
      && review.snapshot.orderId === routeOrderId.value,
    // Only a separate fresh, identity-bound current-node read can prove R1
    // handler display eligibility. This never proves backend signer authority.
    currentNodeHandlerVerified: review.handlerSnapshot.state === 'verified',
    currentIdentityVerified: session.status === 'authenticated'
      && Boolean(session.session?.currentRole?.id && session.session?.roleVersion),
  })
})
function inspectIntent(kind: R1SigningIntentKind): void {
  if (!devFixtureContractRead.value || review.snapshot.state !== 'ready') return
  selectedIntent.value = kind
}
const devFixtureContractRead = computed(() => !productionReadOnly
  && isDevSyntheticContractReadPreviewEnabled(routeWorkOrderId.value))
function readNodeHandlerEvidence(): void {
  if (!devFixtureContractRead.value || review.snapshot.state !== 'ready') return
  selectedIntent.value = null
  void review.loadNodeHandlerEvidence()
}
function readContracts(): void {
  // This is user-triggered and never bypasses Production's transport gate.
  if (!devFixtureContractRead.value || review.snapshot.state !== 'ready') return
  selectedIntent.value = null
  void review.loadContracts()
}
const routeReady = ref(false)
const routeWorkOrderId = ref('')
const routeOrderId = ref('')
let requested = false
// A reviewed business intent belongs to one current role/Order/Contract revision.
// Re-check after any status or handler evidence changes.
watch(() => [session.session?.roleVersion, review.snapshot.workOrderId,
  review.snapshot.orderId, review.contractSnapshot.state,
  review.contractSnapshot.items.map(item => item.id + ':' + (item.contractStatus ?? '')).join('|'),
  review.handlerSnapshot.state] as const, () => { selectedIntent.value = null })

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
.signing-read-page {
  min-height: 100vh;
  padding: var(--app-page-gutter);
  background: var(--app-color-page);
  color: var(--app-color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: var(--app-font-body);
  line-height: 1.55;
}
.signing-read-header, .signing-read-section {
  display: flex; flex-direction: column; gap: 14rpx;
  padding: var(--app-card-padding); margin-bottom: 20rpx;
  background: var(--app-color-surface);
  border: 1rpx solid var(--app-color-border);
  border-radius: var(--app-radius-card);
}
.signing-read-eyebrow { color: var(--app-color-primary); font-size: var(--app-font-meta); font-weight: 700; }
.signing-read-title { display: block; font-size: var(--app-font-major-title); font-weight: 800; line-height: 1.3; }
.signing-read-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.signing-read-section-title { display: block; font-size: var(--app-font-section-title); font-weight: 750; line-height: 1.4; }
.signing-read-tag { flex: none; background: var(--app-color-success-soft); color: var(--app-color-success);
  padding: 5rpx 13rpx; border-radius: 10rpx; font-size: var(--app-font-status); font-weight: 700; }
.signing-read-tag--neutral { color: var(--app-color-text-body); background: var(--app-color-control-surface); }
.signing-read-order-number { display: block; font-size: 29rpx; font-weight: 750; line-height: 1.4; overflow-wrap: anywhere; }
.signing-read-meta { display: block; font-size: var(--app-font-meta); color: var(--app-color-text-secondary); }
.signing-read-order-note { display: block; color: var(--app-color-text-body); font-size: var(--app-font-body);
  line-height: 1.5; padding-top: 12rpx; border-top: 1rpx solid var(--app-color-divider); }
.signing-read-amount { display: flex; align-items: center; justify-content: space-between;
  padding-top: 12rpx; border-top: 1rpx solid var(--app-color-divider); }
.signing-read-amount-value { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 750; }
.signing-read-section--progress { border-color: var(--app-color-border-soft); }
.signing-read-progress-title { display: block; color: var(--app-color-text-primary); font-size: 28rpx; font-weight: 750; }
.signing-read-body { display: block; color: var(--app-color-text-body); font-size: var(--app-font-body); line-height: 1.55; }
.signing-read-help, .signing-read-warning, .signing-read-footer { display: block; color: var(--app-color-text-secondary);
  font-size: var(--app-font-meta); line-height: 1.5; }
.signing-read-dev-note { display: block; font-size: var(--app-font-meta); color: var(--app-color-primary);
  background: var(--app-color-primary-soft); border-radius: 10rpx; padding: 9rpx 12rpx; }
.signing-read-contract-item { display: flex; flex-direction: column; gap: 10rpx; border-radius: var(--app-radius-surface);
  background: var(--app-color-control-surface); padding: 20rpx; }
.signing-read-contract-number { display: block; color: var(--app-color-text-primary); font-size: 26rpx;
  font-weight: 750; overflow-wrap: anywhere; }
.signing-read-contract-state { display: block; color: var(--app-color-text-body); font-size: var(--app-font-body); line-height: 1.6; }
.signing-read-footer { text-align: center; margin: 28rpx 0 52rpx; }
.signing-read-section--diagnostics { border-style: dashed; background: var(--app-color-control-surface); }
.signing-read-diagnostics-copy { display: flex; flex-direction: column; min-width: 0; gap: 5rpx; }
.signing-read-diagnostics-copy .signing-read-section-title { font-size: var(--app-font-body); font-weight: 700; }
.signing-read-diagnostics-toggle { flex: none; border: 1rpx solid var(--app-color-border-control); border-radius: 12rpx;
  background: var(--app-color-surface); color: var(--app-color-text-body); font-size: var(--app-font-body);
  min-height: 44px; line-height: 1.4; padding: 9rpx 18rpx; margin: 0; }
.signing-read-diagnostics-toggle::after { border: 0; }
.signing-read-diagnostics-details { display: flex; flex-direction: column; gap: 15rpx; border-top: 1rpx solid var(--app-color-border); padding-top: 18rpx; }
.signing-read-section--progress { background: var(--app-color-surface); border-left: 5rpx solid var(--app-color-primary); }
.signing-read-contract-item { border: 1rpx solid var(--app-color-border); }
</style>
