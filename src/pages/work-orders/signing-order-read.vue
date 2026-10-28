<template>
  <view class="signing-read-page app-transaction-page xl-craft">
    <view class="signing-read-header">
      <AppCraftHeading
        title="签约进度"
        eyebrow="订单签约 · 当前工单"
        subtitle="先看当前状态，再核对合同记录。"
      />
    </view>

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
          <text class="xl-craft__caption">当前签约状态 · 仅供查看</text>
          <text v-if="signingStepIndex > 0" class="signing-read-stage-index">步骤 {{ signingStepIndex }}/3</text>
        </view>
        <view v-if="signingStepIndex > 0" class="xl-craft__progress-track" aria-hidden="true">
          <view :class="{ 'is-active': signingStepIndex >= 1 }" />
          <view :class="{ 'is-active': signingStepIndex >= 2 }" />
          <view :class="{ 'is-active': signingStepIndex >= 3 }" />
        </view>
        <text class="signing-read-progress-title xl-craft__section-title">{{ signingPhaseTitle }}</text>
        <text class="signing-read-next-label">下一步</text>
        <text class="signing-read-body" data-testid="signing-review-next">{{ signingNextActionDisplay }}</text>
        <AppButton
          v-if="devFixtureContractRead && (review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable')"
          class="signing-read-contract-cta signing-read-stage-cta"
          block data-testid="signing-contract-read-request" @tap="readContracts"
        >{{ review.contractSnapshot.state === 'failed_retryable' ? '重新核验合同状态' : '核验当前订单合同' }}</AppButton>
        <text class="signing-read-warning xl-craft__caption">{{ uxStateLanguage.signingReadOnly }}</text>
      </view>
      <AppRecordCard class="signing-read-section signing-read-hero xl-craft__surface" data-testid="signing-order-read-verified">
        <view class="signing-read-hero-top">
          <text class="signing-read-hero-title">当前订单</text>
          <AppMetaTag class="xl-craft__badge" :label="uxStateLanguage.verifiedOrder" tone="success" />
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
            {{ orderAuditExpanded ? '收起订单状态说明' : '查看订单状态说明' }}
          </button>
          <text v-show="orderAuditExpanded" class="signing-read-order-note"
            data-testid="signing-order-read-r1-stage">{{ orderStageDisplay(review.snapshot.review?.order.processState) }}</text>
        </view>
        <text v-if="!review.snapshot.review?.order.contentSupported" class="signing-read-warning xl-craft__caption">
          部分订单明细暂不可识别，未推断缺失字段。
        </text>
      </AppRecordCard>
      <AppRecordCard class="signing-read-section xl-craft__surface xl-craft__surface--flat" data-testid="signing-order-read-contract-status">
        <AppSectionHeading title="合同状态">
          <template #trailing><AppMetaTag label="仅核验" /></template>
        </AppSectionHeading>
        <text class="signing-read-help">只核对当前订单；没有读到合同不代表合同不存在。</text>
        <text v-if="!devFixtureContractRead" data-testid="signing-contract-prod-blocked">
          当前仅能查看签约进度。合同详情与签约操作暂未开放。
        </text>
        <text v-else-if="review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable'"
          class="signing-read-help">请使用上方主操作核验当前合同记录。</text>
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
            <text class="signing-read-contract-state">{{ contractStatusDisplay(contract.contractStatus) }}</text>
            <text v-if="contract.signedDate" class="signing-read-meta xl-craft__meta">记录中的签约日期：{{ contract.signedDate }}</text>
          </view>
          <text class="signing-read-warning xl-craft__caption">仅限本次已核验的有限结果，不代表拥有签约权限或可访问合同文件。</text>
        </template>
      </AppRecordCard>
      <AppRecordCard class="signing-read-section xl-craft__surface xl-craft__surface--flat" data-testid="signing-read-reconciled-status">
        <AppSectionHeading title="当前结果" />
        <text class="signing-read-progress-title" data-testid="signing-read-stage-title">{{ signingStage.title }}</text>
        <text class="signing-read-body" data-testid="signing-read-stage-detail">{{ signingStage.detail }}</text>
        <text class="signing-read-warning xl-craft__caption">这里只提供进度查看，不支持签约、取消或发送消息。</text>
      </AppRecordCard>
      <AppRecordCard class="signing-read-section xl-craft__surface xl-craft__surface--flat" data-testid="signing-order-read-no-contract">
        <text class="signing-read-section-title">签约业务操作 · 未开放</text>
        <AppStatus
          message="这里只提供进度核对。合同查看、签署和短信操作尚未开放。"
          variant="strip"
          tone="warning"
          quiet
          data-testid="ds07c4b-signing-authority-note"
        />
        <AppButton disabled block variant="secondary" data-testid="signing-order-read-contract-disabled">
          查看合同 · 未开放
        </AppButton>
        <AppButton disabled block data-testid="signing-order-read-sign-disabled">
          发起签署 · 未开放
        </AppButton>
      </AppRecordCard>
      <navigator class="signing-read-return xl-craft__action-secondary" open-type="navigateBack" :delta="1"
        data-testid="signing-order-read-return">
        返回上一页
      </navigator>
    </template>
    <view class="signing-read-footer xl-craft__caption" data-testid="signing-order-read-no-write">
      仅供查看 · 业务操作暂未开放
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
import AppCraftHeading from '@shared/ui/AppCraftHeading.vue'
import { uxStateLanguage } from '@shared/ui/ux-state-language'
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
  if (status === '10') return '记录显示已签署，最终结果仍待后台核实'
  if (status === '2') return '签署处理中，请勿重复发起'
  if (status === '-3') return '签署状态异常，请联系支持人员核实'
  return '合同状态尚未核验，不代表已完成签署'
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
      ? '核验当前订单的合同状态。' : '合同状态读取暂未开放，请等待授权。'
    case 'loading': return '正在读取合同状态，请稍候。'
    case 'failed_retryable': return devFixtureContractRead.value
      ? '合同读取失败，可在下方重新核验。' : '合同读取失败，暂不可执行签署。'
    case 'failed_terminal': return '合同状态无法确认，请联系支持人员核对。'
    case 'succeeded': {
      if (signingStage.value.stage === 'signing_in_progress') return '等待签约结果更新，请勿重复发起。'
      if (signingStage.value.stage === 'record_signed') return '已读取签约记录，合同文件及签名真实性仍待核实。'
      return '请核对下方合同状态；当前没有可执行的签约操作。'
    }
  }
  return '合同状态暂不可确认，请勿发起签约。'
})
const orderAuditExpanded = ref(false)
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
  padding: 14px 20px calc(38px + env(safe-area-inset-bottom));
}
.signing-read-header { padding: 0; margin: 0 0 15px; }
.signing-read-section {
  display: flex; flex-direction: column; gap: 10px;
  padding: 17px; margin-bottom: 13px;
}
.signing-read-section .app-section-heading__title {
  color: var(--xl-ink); font-size: 14px; font-weight: 600;
}
.signing-read-section .app-section-heading__subtitle {
  color: var(--xl-caption); font-size: 11px;
}
.signing-read-hero {
  gap: 0; padding: 15px 18px 13px; margin-bottom: 11px;
}
.signing-read-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.signing-read-hero-title { color: var(--xl-ink); font-size: 14px; font-weight: 600; line-height: 22px; }

.signing-read-order-identity { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.signing-read-order-number {
  display: block; text-align: left;
  font-size: 13px; line-height: 20px; font-weight: 600;
  overflow-wrap: anywhere; font-variant-numeric: tabular-nums;
}
.signing-read-hero-money {
  display: flex; justify-content: space-between; gap: 12px;
  align-items: flex-end; margin-top: 13px;
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
.signing-read-order-details { border-top:1px solid var(--xl-divider); margin-top:12px; padding-top:6px; }
.signing-read-detail-toggle {
  margin:0; padding:0 4px; min-height:44px; display:flex; align-items:center;
  background:transparent; color:var(--app-journey-context-ink);
  border:0; font-weight:650;
}
.signing-read-detail-toggle::after { border:0; }
.signing-read-stage {
  display: flex; flex-direction: column; gap: 4px; margin: 0 0 11px;
  padding: 16px; border: 1px solid var(--app-journey-context-border);
  background: var(--app-journey-context);
}
.signing-read-stage-index {
  color: var(--xl-blue); font-size: 11px; line-height: 18px;
  font-weight: 700; font-variant-numeric: tabular-nums;
}
.signing-read-stage .xl-craft__progress-track { margin-bottom: 7px; }
.signing-read-progress-title {
  display: block; color: var(--app-journey-emphasis); font-size: var(--app-journey-title-size);
  line-height: 26px; font-weight: 600;
}
.signing-read-next-label { color:var(--app-journey-context-ink); font-size:12px; font-weight:700; margin-top:8px; }
.signing-read-stage .signing-read-body { margin-top: 0; line-height:1.5; color:var(--xl-ink); }
.signing-read-stage .signing-read-warning { margin-top: 8px; }
.signing-read-stage-cta { margin-top:12px; min-height:var(--app-journey-tap-height); }
.signing-read-body, .signing-read-help {
  display: block; color: var(--xl-secondary);
  font-size: 12px; line-height: 19px;
}
.signing-read-warning, .signing-read-footer {
  display: block; color: var(--xl-caption);
  font-size: 11px; line-height: 18px;
}
.signing-read-section--progress { border-left: 0; }
.signing-read-contract-cta { width: 100%; margin-top: 3px; }
.signing-read-section .xl-craft__notice { margin: 5px 0 0; }
.signing-read-contract-item {
  display: flex; flex-direction: column; gap: 8px;
  padding: 13px 14px; border: 1px solid var(--xl-divider);
  border-radius: var(--xl-radius-control);
  background: var(--xl-field-bg);
}
.signing-read-contract-number { color: var(--xl-ink); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.signing-read-contract-state { color: var(--xl-secondary); font-size: 12px; line-height: 1.5; }
.signing-read-footer { text-align: center; margin: 19px 0 42px; }
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
