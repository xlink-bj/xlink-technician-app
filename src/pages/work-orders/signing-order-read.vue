<template>
  <view class="signing-read-page app-transaction-page xl-craft">
    <AppLoadingState
      v-if="session.status === 'unknown' || review.snapshot.state === 'loading'"
      variant="inline" label="正在核验工单与正式订单"
      data-testid="signing-order-read-loading"
    />
    <AppRecordCard
      v-else-if="session.status !== 'authenticated' || review.snapshot.state !== 'ready'"
      class="signing-read-section xl-craft__surface xl-craft__surface--flat"
      data-testid="signing-order-read-blocked"
    >
      <text>当前订单暂无法完成签约前只读核验。请从当前账号可见的工单报价记录重新进入。</text>
      <AppButton
        v-if="session.status === 'authenticated' && review.snapshot.state === 'failed_retryable'"
        block variant="secondary" data-testid="signing-order-read-retry"
        @tap="retryScopedRead"
      >重新核验当前订单</AppButton>
      <navigator open-type="navigateBack" :delta="1">返回工单</navigator>
    </AppRecordCard>
    <template v-else>
      <view class="signing-read-stage xl-craft__surface" data-testid="signing-review-progress">
        <view class="xl-craft__progress-labels">
          <text class="xl-craft__caption">当前签约状态</text>
          <text v-if="signingStepIndex > 0" class="signing-read-stage-index">步骤 {{ signingStepIndex }}/3</text>
        </view>
        <view v-if="signingStepIndex > 0" class="xl-craft__progress-track" aria-hidden="true">
          <view :class="{ 'is-active': signingStepIndex >= 1 }" />
          <view :class="{ 'is-active': signingStepIndex >= 2 }" />
          <view :class="{ 'is-active': signingStepIndex >= 3 }" />
        </view>
        <view class="signing-read-reconciled-inline" data-testid="signing-read-reconciled-status">
          <text class="signing-read-phase xl-craft__caption">{{ signingPhaseTitle }}</text>
          <text class="signing-read-progress-title xl-craft__section-title" data-testid="signing-read-stage-title">{{ signingStage.title }}</text>
        </view>
        <view class="signing-read-next">
          <text class="signing-read-next-label">接下来</text>
          <text class="signing-read-body" data-testid="signing-review-next">{{ signingNextActionDisplay }}</text>
        </view>
        <AppButton
          v-if="devFixtureContractRead && (review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable')"
          class="signing-read-contract-cta signing-read-stage-cta"
          block data-testid="signing-contract-read-request" @tap="readContracts"
        >{{ review.contractSnapshot.state === 'failed_retryable' ? '重新核验合同状态' : '核验当前订单合同' }}</AppButton>
        <button class="signing-read-context-toggle" type="button" :aria-expanded="stageInfoExpanded"
          @tap="stageInfoExpanded = !stageInfoExpanded">
          <text class="xl-craft__caption">状态说明</text><AppIcon name="chevron-right" :size="15" color="#7b8aa0" />
        </button>
        <text v-show="stageInfoExpanded" class="signing-read-stage-detail signing-read-body"
          data-testid="signing-read-stage-detail">{{ signingStage.detail }}</text>
      </view>
      <AppRecordCard class="signing-read-section signing-read-hero xl-craft__surface" data-testid="signing-order-read-verified">
        <view class="signing-read-hero-top">
          <text class="signing-read-hero-title">当前订单</text>
          <AppMetaTag class="xl-craft__badge" label="已核验" tone="success" />
        </view>
        <view class="signing-read-order-identity">
          <text class="xl-craft__caption">订单编号</text>
          <text class="signing-read-order-number xl-craft__value" data-testid="signing-order-read-display-number">{{ review.snapshot.review?.order.displayNumber || '订单编号待核验' }}</text>
        </view>
        <view class="signing-read-hero-money">
          <view v-if="review.snapshot.review?.order.totalPrice !== undefined && (!devFixtureContractRead || review.snapshot.review.order.totalPrice > 0)" class="signing-read-hero-amount" data-testid="signing-read-order-amount">
            <text class="signing-read-meta xl-craft__meta">订单金额</text>
            <AppAmountValue class="signing-read-amount-value" size="prominent" :value="`¥${review.snapshot.review.order.totalPrice.toFixed(2)}`" />
          </view>
          <text v-else-if="devFixtureContractRead" class="signing-read-meta xl-craft__meta" data-testid="signing-read-amount-unverified">订单金额待核验</text>
          <text class="signing-read-meta xl-craft__meta">{{ review.snapshot.review?.order.groups.length || 0 }} 个维修分组</text>
        </view>
        <view class="signing-read-order-details">
          <button class="signing-read-detail-toggle" type="button" :aria-expanded="orderAuditExpanded"
            data-testid="signing-order-audit-toggle" @tap="orderAuditExpanded = !orderAuditExpanded">
            <text class="xl-craft__caption">{{ orderAuditExpanded ? '收起订单状态' : '订单状态' }}</text>
            <AppIcon name="chevron-right" :size="15" color="#7b8aa0" />
          </button>
          <text v-show="orderAuditExpanded" class="signing-read-order-note"
            data-testid="signing-order-read-r1-stage">{{ orderStageDisplay(review.snapshot.review?.order.processState) }}</text>
        </view>
        <text v-if="!review.snapshot.review?.order.contentSupported" class="signing-read-warning xl-craft__caption">
          部分订单明细暂不可识别，未推断缺失字段。
        </text>
      </AppRecordCard>
      <AppRecordCard class="signing-read-section xl-craft__surface xl-craft__surface--flat" data-testid="signing-order-read-contract-status">
        <AppSectionHeading title="合同记录" />
        <text v-if="!devFixtureContractRead" data-testid="signing-contract-prod-blocked">
          合同详情暂未开放
        </text>
        <text v-else-if="review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable'"
          class="signing-read-help">合同状态待核验</text>
        <AppLoadingState v-if="review.contractSnapshot.state === 'loading'"
          variant="inline" label="正在只读核验合同状态" />
        <text v-if="review.contractSnapshot.state === 'failed_terminal'">合同核验失败</text>
        <template v-if="review.contractSnapshot.state === 'succeeded'">
          <text v-if="review.contractSnapshot.items.length === 0" data-testid="signing-contract-inconclusive">
            暂未核验到合同记录
          </text>
          <view v-for="contract in review.contractSnapshot.items" :key="contract.id" class="signing-read-contract-item"
            data-testid="signing-contract-matched">
            <text class="signing-read-contract-number">{{ contract.displayNumber || '合同编号未返回' }}</text>
            <text class="signing-read-contract-state">{{ contractStatusDisplay(contract.contractStatus) }}</text>
            <text v-if="contract.signedDate" class="signing-read-meta xl-craft__meta">记录中的签约日期：{{ contract.signedDate }}</text>
          </view>
        </template>
        <view class="signing-read-operations" data-testid="signing-order-read-no-contract">
          <button class="signing-read-operations-toggle" type="button" :aria-expanded="operationLimitsExpanded"
            data-testid="signing-read-operations-toggle" @tap="operationLimitsExpanded = !operationLimitsExpanded">
            <view class="signing-read-operations-copy">
              <text>合同操作</text><text class="signing-read-operations-state xl-craft__caption">暂未开放</text>
            </view>
            <view class="signing-read-operations-chevron" :class="{ 'is-open': operationLimitsExpanded }" aria-hidden="true">
              <AppIcon name="chevron-right" :size="16" color="#74859a" />
            </view>
          </button>
          <view v-show="operationLimitsExpanded" class="signing-read-operations-detail">
            <AppStatus
              message="当前仅能核对进度，不能查看合同文件、发起签署或发送短信。"
              variant="strip"
              tone="warning"
              quiet
              data-testid="ds07c4b-signing-authority-note"
            />
            <view class="signing-read-operations-actions">
              <AppButton disabled block variant="secondary" data-testid="signing-order-read-contract-disabled">查看合同</AppButton>
              <AppButton disabled block data-testid="signing-order-read-sign-disabled">发起签署</AppButton>
            </view>
          </view>
        </view>
      </AppRecordCard>
      <navigator class="signing-read-return xl-craft__action-secondary" open-type="navigateBack" :delta="1"
        data-testid="signing-order-read-return">
        返回
      </navigator>
    </template>
    <view class="signing-read-footer xl-craft__caption" data-testid="signing-order-read-no-write">
      全程只读
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import AppButton from '@shared/ui/AppButton.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppMetaTag from '@shared/ui/AppMetaTag.vue'
import AppSectionHeading from '@shared/ui/AppSectionHeading.vue'
import AppAmountValue from '@shared/ui/AppAmountValue.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import { useSessionStore } from '@shared/state'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { isDevSyntheticContractReadPreviewEnabled } from '@app/business-mock'
import { reconcileR1SigningRead } from '@features/work-orders/signing/r1-signing-read-reconciliation'
import { signingReviewProgress } from '@features/work-orders/signing/signing-review-progress'

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
// The read model is the sole authority for progress. An unrecognized title
// hides the visual segments rather than inventing a contract/signing state.
const signingStepIndex = computed(() => {
  const match = /^步骤\s*([123])\s*\/\s*3/.exec(signingProgress.value.title)
  return match ? Number(match[1]) : 0
})
function contractStatusDisplay(status: string | undefined): string {
  if (status === '10') return '记录显示已签署 · 待核验'
  if (status === '2') return '签署处理中'
  if (status === '-3') return '状态异常 · 请联系支持'
  return '合同状态待核验'
}
function orderStageDisplay(processState: number | undefined): string {
  if (processState === 0) return '订单当前待签约；请以合同核验结果为准'
  if (processState === 4) return '订单签约处理中，请勿重复发起'
  return '订单签约阶段尚待核验，不能据此判断合同已签署'
}
const signingPhaseTitle = computed(() => signingProgress.value.title.replace(
  /^步骤\s*[123]\s*\/\s*3\s*[·•:：\s]*/, '',
))
/** Task-facing language derived only from the authoritative read state. */
const signingNextActionDisplay = computed(() => {
  switch (review.contractSnapshot.state) {
    case 'idle': return devFixtureContractRead.value
      ? '核验合同状态' : '合同状态待核验'
    case 'loading': return '正在核验合同状态'
    case 'failed_retryable': return '合同核验失败，可重试'
    case 'failed_terminal': return '请联系支持人员核验'
    case 'succeeded': {
      if (signingStage.value.stage === 'signing_in_progress') return '等待签约结果更新'
      if (signingStage.value.stage === 'record_signed') return '已读取签约记录 · 待最终核验'
      return '请核对合同状态'
    }
  }
  return '合同状态待核验'
})
const orderAuditExpanded = ref(false)
const operationLimitsExpanded = ref(false)
const stageInfoExpanded = ref(false)
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
/* DS-05B — C01 visual master translation. All UI materials come from shared
   .xl-craft; this page owns ONLY spatial composition and a factual progress cue. */
.signing-read-page {
  min-height: 100vh;
  padding: 14px 16px calc(22px + env(safe-area-inset-bottom));
}
.signing-read-section {
  display: flex; flex-direction: column; gap: 9px;
  padding: 15px 16px; margin-bottom: 11px;
}
.signing-read-section .app-section-heading__title {
  color: var(--xl-ink); font-weight: 700;
}
.signing-read-section .app-section-heading__subtitle {
  color: var(--xl-caption); font-size: 11px;
}
.signing-read-hero {
  gap: 0; padding: 15px 16px; margin-bottom: 11px;
}
.signing-read-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.signing-read-hero-title { color: var(--xl-ink); font-size: 14px; font-weight: 600; line-height: 22px; }

.signing-read-order-identity {
  display:flex; align-items:baseline; justify-content:space-between;
  gap:12px; margin-top:12px;
}
.signing-read-order-number {
  display: block; text-align: right;
  font-size: 13px; line-height: 20px; font-weight: 600;
  min-width:0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums;
}
.signing-read-hero-money {
  display: flex; justify-content: space-between; gap: 12px;
  align-items: flex-end; margin-top: 11px;
}
.signing-read-hero-amount { display: flex; flex-direction: column; gap: 2px; }
.signing-read-amount-value {
  color: var(--xl-ink); font-size: 28px; font-weight: 700;
  line-height: 31px; letter-spacing: -.025em;
}
.signing-read-hero-money > .signing-read-meta {
  text-align: right; font-size: 11px; white-space: normal;
  padding-bottom: 3px; max-width: 45%;
}
.signing-read-order-note {
  display: block; color: var(--xl-secondary);
  font-size: 12px; line-height: 19px;
  margin-top: 4px; padding: 8px 0 0;
}
.signing-read-order-details { border-top:1px solid var(--xl-divider); margin-top:11px; padding-top:3px; }
.signing-read-detail-toggle {
  margin:0; padding:0; width:100%; min-height:44px;
  display:flex; align-items:center; justify-content:space-between;
  background:transparent; color:var(--xl-secondary);
  border:0; font-weight:600;
}
.signing-read-detail-toggle::after { border:0; }
.signing-read-stage {
  display: flex; flex-direction: column; gap: 5px; margin: 0 0 11px;
  padding: 16px; border: 1px solid var(--app-journey-context-border);
  background: var(--app-journey-context);
}
.signing-read-stage-index {
  color: var(--xl-blue); font-size: 11px; line-height: 18px;
  font-weight: 700; font-variant-numeric: tabular-nums;
}
.signing-read-stage .xl-craft__progress-track { margin-bottom: 7px; }
.signing-read-reconciled-inline { display:flex; flex-direction:column; gap:4px; }
.signing-read-phase {
  display:block; color:var(--app-journey-context-ink);
  line-height:19px; font-weight:600;
}
.signing-read-progress-title {
  display: block; color: var(--app-journey-emphasis); font-size: var(--app-journey-title-size);
  line-height: 31px; font-weight: 750;
}
.signing-read-stage-detail { margin-top:2px; }
.signing-read-next {
  display:flex; align-items:baseline; gap:12px;
  border-top:1px solid var(--app-journey-context-border);
  margin-top:10px; padding-top:11px;
}
.signing-read-next-label {
  color:var(--app-journey-context-ink); font-size:12px; font-weight:700;
  flex:none;
}
.signing-read-stage .signing-read-body { line-height:1.55; color:var(--xl-secondary); }
.signing-read-stage-cta { margin-top:12px; min-height:var(--app-journey-tap-height); }
.signing-read-context-toggle {
  width:100%; min-height:36px; margin:5px 0 0; padding:6px 0 0;
  display:flex; align-items:center; justify-content:space-between;
  border:0; border-top:1px solid var(--app-journey-context-border);
  background:transparent; color:var(--app-journey-context-ink);
  font-weight:600; text-align:left;
}
.signing-read-context-toggle::after { border:0; }
.signing-read-stage-detail { padding:7px 0 4px; }
.signing-read-body, .signing-read-help {
  display: block; color: var(--xl-secondary);
  font-size: 13px; line-height: 20px;
}
.signing-read-warning, .signing-read-footer {
  display: block; color: var(--xl-caption);
  font-size: 12px; line-height: 19px;
}
.signing-read-section--progress { border-left: 0; }
.signing-read-contract-cta { width: 100%; margin-top: 3px; }
.signing-read-section .xl-craft__notice { margin: 5px 0 0; }
.signing-read-contract-item {
  display: flex; flex-direction: column; gap: 6px;
  padding: 12px 13px; border: 1px solid var(--xl-divider);
  border-radius: var(--xl-radius-control);
  background: var(--xl-field-bg);
}
.signing-read-contract-number { color: var(--xl-ink); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.signing-read-contract-state { color: var(--app-journey-context-ink); font-size: 12px; line-height: 1.5; font-weight:600; }
.signing-read-operations { border-top:1px solid var(--xl-divider); margin-top:5px; }
.signing-read-operations-toggle {
  width:100%; min-height:44px; margin:0; padding:6px 0;
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  border:0; background:transparent; color:var(--xl-ink);
  font-weight:650; line-height:1.5; text-align:left;
}
.signing-read-operations-toggle::after { border:0; }
.signing-read-operations-copy { display:flex; align-items:baseline; gap:8px; min-width:0; }
.signing-read-operations-state { color:var(--xl-caption); font-weight:400; }
.signing-read-operations-chevron { display:flex; align-items:center; justify-content:center; transition:transform .15s ease; }
.signing-read-operations-chevron.is-open { transform:rotate(90deg); }
.signing-read-operations-detail { display:flex; flex-direction:column; gap:11px; padding-top:5px; }
.signing-read-operations-actions { display:flex; flex-direction:column; gap:9px; }
.signing-read-footer { text-align: center; margin: 12px 0 18px; }
.signing-read-return {
  box-sizing:border-box; min-height:44px; margin:12px 0 0;
}
.signing-read-section--diagnostics { border-style: dashed; box-shadow: none; }
.signing-read-diagnostics-copy { display: flex; flex-direction: column; gap: 4px; }
.signing-read-diagnostics-toggle {
  min-height: 44px; margin: 0; padding: 9px 12px;
  border: 1px solid var(--xl-stroke); border-radius: var(--xl-radius-control);
  background: var(--xl-white); color: var(--xl-secondary);
  font-size: 13px; line-height: 1.4;
}
.signing-read-diagnostics-toggle::after { border: 0; }
.signing-read-diagnostics-details {
  display: flex; flex-direction: column; gap: 12px;
  padding-top: 13px; border-top: 1px solid var(--xl-divider);
}
@media(max-width:360px) {
  .signing-read-page { padding-left: 12px; padding-right: 12px; }
  .signing-read-hero { padding: 17px 15px; }
}
</style>
