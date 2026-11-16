<template>
  <view class="signing-read-page app-transaction-page xl-craft">
    <AppLoadingState
      v-if="session.status === 'unknown' || review.snapshot.state === 'loading'"
      variant="inline" label="正在核验工单与正式订单"
      data-testid="signing-order-read-loading"
    />
    <view
      v-else-if="session.status !== 'authenticated' || review.snapshot.state !== 'ready'"
      class="app-record-card signing-read-section xl-craft__surface xl-craft__surface--flat"
      data-testid="signing-order-read-blocked"
    >
      <text :class="{ 'signing-read-error': review.snapshot.state === 'failed_retryable' }">当前订单暂无法完成签约前只读核验。请从当前账号可见工单中的正式订单重新进入。</text>
      <AppButton
        v-if="session.status === 'authenticated' && review.snapshot.state === 'failed_retryable'"
        block variant="secondary" data-testid="signing-order-read-retry"
        @tap="retryScopedRead"
      >重新核验当前订单</AppButton>
      <AppButton variant="secondary" :disabled="returning" data-testid="signing-order-read-return"
        @tap="returnToWorkOrder">返回工单</AppButton>
    </view>
    <template v-else>
      <view class="signing-read-stage xl-craft__surface" :class="{ 'signing-read-stage--error': signingFeedbackError }" data-testid="signing-review-progress">
        <view class="xl-craft__progress-labels">
          <text class="xl-craft__caption">合同状态核验</text>
          <AppMetaTag label="只读" tone="neutral" />
        </view>
        <view class="signing-read-reconciled-inline" data-testid="signing-read-reconciled-status">
          <text v-if="review.contractSnapshot.state === 'succeeded'" class="signing-read-phase xl-craft__caption">合同记录回读结果</text>
          <text class="signing-read-progress-title xl-craft__section-title" data-testid="signing-read-stage-title">{{ signingStatusTitle }}</text>
        </view>
        <view class="signing-read-next">
          <text class="signing-read-next-label">接下来</text>
          <text class="signing-read-body" data-testid="signing-review-next">{{ signingNextActionDisplay }}</text>
        </view>
        <AppButton
          v-if="scopedContractReadEnabled && (review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable')"
          class="signing-read-contract-cta signing-read-stage-cta"
          block data-testid="signing-contract-read-request" @tap="readContracts"
        >{{ review.contractSnapshot.state === 'failed_retryable' ? '重新核验合同状态 · 只读' : '核验当前订单合同 · 只读' }}</AppButton>
        <text class="signing-read-help">仅核对状态，不发起签署、发送短信或读取合同文件。</text>
        <button class="signing-read-context-toggle" type="button" :aria-expanded="stageInfoExpanded"
          @tap="stageInfoExpanded = !stageInfoExpanded">
          <text class="xl-craft__caption">状态说明</text><AppIcon name="chevron-right" :size="15" color="var(--signing-read-detail-icon, #7b8aa0)" />
        </button>
        <text v-show="stageInfoExpanded" class="signing-read-stage-detail signing-read-body"
          data-testid="signing-read-stage-detail">{{ signingStage.detail }}</text>
      </view>
      <view class="app-record-card signing-read-section signing-read-hero xl-craft__surface" data-testid="signing-order-read-verified">
        <view class="signing-read-hero-top">
          <text class="signing-read-hero-title">当前订单</text>
          <AppMetaTag class="xl-craft__badge" label="订单身份已核验" tone="success" />
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
          <text v-else class="signing-read-meta xl-craft__meta" data-testid="signing-read-amount-unverified">订单金额待核验</text>
          <text class="signing-read-meta xl-craft__meta">{{ review.snapshot.review?.order.groups.length ? `${review.snapshot.review.order.groups.length} 个可识别维修分组` : '维修分组待核验' }}</text>
        </view>
        <view class="signing-read-order-details">
          <button class="signing-read-detail-toggle" type="button" :aria-expanded="orderAuditExpanded"
            data-testid="signing-order-audit-toggle" @tap="orderAuditExpanded = !orderAuditExpanded">
            <text class="xl-craft__caption">{{ orderAuditExpanded ? '收起订单状态' : '订单状态' }}</text>
            <AppIcon name="chevron-right" :size="15" color="var(--signing-read-detail-icon, #7b8aa0)" />
          </button>
          <text v-show="orderAuditExpanded" class="signing-read-order-note"
            data-testid="signing-order-read-r1-stage">{{ orderStageDisplay(review.snapshot.review?.order.processState) }}</text>
        </view>
        <text v-if="!review.snapshot.review?.order.contentSupported" class="signing-read-warning xl-craft__caption">
          部分订单明细暂不可识别，未推断缺失字段。
        </text>
      </view>
      <view class="app-record-card signing-read-section xl-craft__surface xl-craft__surface--flat" data-testid="signing-order-read-contract-status">
        <AppSectionHeading title="合同记录" />
        <text v-if="!scopedContractReadEnabled" data-testid="signing-contract-prod-blocked">
          合同状态核验暂未开放
        </text>
        <text v-else class="signing-read-help" data-testid="signing-contract-read-scope">
          仅核验当前工单已核验订单的合同状态，不读取合同文件或签署信息。
        </text>
        <text v-if="scopedContractReadEnabled && (review.contractSnapshot.state === 'idle' || review.contractSnapshot.state === 'failed_retryable')"
          class="signing-read-help">合同状态待核验</text>
        <AppLoadingState v-if="review.contractSnapshot.state === 'loading'"
          variant="inline" label="正在只读核验合同状态" />
        <text v-if="review.contractSnapshot.state === 'failed_terminal'">合同核验失败</text>
        <template v-if="review.contractSnapshot.state === 'succeeded'">
          <text v-if="review.contractSnapshot.items.length === 0" data-testid="signing-contract-inconclusive">
            本次有界读取未核验到合同记录
          </text>
          <view v-for="contract in review.contractSnapshot.items" :key="contract.id" class="signing-read-contract-item"
            data-testid="signing-contract-matched">
            <text class="signing-read-contract-number">{{ contract.displayNumber || '合同编号未返回' }}</text>
            <text class="signing-read-contract-state" :class="{ 'signing-read-error': contract.state === 1 && contract.contractStatus === '-3' }">{{ contractStatusDisplay(contract.contractStatus) }}</text>
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
              <AppIcon name="chevron-right" :size="16" color="var(--signing-read-operations-icon, #74859a)" />
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
      </view>
      <view class="app-record-card signing-read-section xl-craft__surface xl-craft__surface--flat" data-testid="signing-eligibility">
        <AppSectionHeading title="签约信息核对" />
        <text data-testid="signing-eligibility-result">{{ eligibilityFeedback.summary }}</text>
        <text v-if="review.handlerSnapshot.reason" data-testid="signing-handler-reason">{{ eligibilityFeedback.handler }}</text>
        <AppButton block variant="secondary" data-testid="signing-handler-check"
          :disabled="productionReadOnly || review.handlerSnapshot.state === 'loading'" @tap="review.loadNodeHandlerEvidence()">核对操作条件</AppButton>
        <text v-for="reason in eligibilityFeedback.notes" :key="reason" class="signing-read-help" data-testid="signing-eligibility-reason">{{ reason }}</text>
        <text class="signing-read-help">{{ eligibilityFeedback.notice }}</text>
      </view>
      <AppButton variant="secondary" class="signing-read-return xl-craft__action-secondary" :disabled="returning"
        data-testid="signing-order-read-return" @tap="returnToWorkOrder">
        返回
      </AppButton>
    </template>
    <AppStatus v-if="returnError" tone="danger" :message="returnError" />
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
import { signingEligibilityFeedback } from '@features/work-orders/signing/r1-signing-ui-rules'
import { signingReviewProgress } from '@features/work-orders/signing/signing-review-progress'
import { createDefaultNavigationPort } from '@app/composition'

const session = useSessionStore()
const navigation = createDefaultNavigationPort()
const returning = ref(false)
const returnError = ref('')

async function returnToWorkOrder(): Promise<void> {
  if (returning.value) return
  returning.value = true
  returnError.value = ''
  try {
    if (typeof getCurrentPages === 'function' && getCurrentPages().length > 1 && navigation.back) {
      try { await navigation.back(); return } catch { /* Fall back to a known business page. */ }
    }
    const target = routeWorkOrderId.value.trim()
      ? `/pages/work-orders/detail?id=${encodeURIComponent(routeWorkOrderId.value.trim())}`
      : '/pages/work-orders/work-orders'
    await (navigation.reset ?? navigation.replace ?? navigation.navigate)(target)
  } catch {
    returnError.value = '暂时无法返回，请重试。'
  } finally {
    returning.value = false
  }
}
const review = useSigningReviewReadStore()
const eligibilityFeedback = computed(() => signingEligibilityFeedback(review.initialSigningIntent.assessment, review.handlerSnapshot.state))
const productionReadOnly = isProductionReadOnlyRuntime()
const signingStage = computed(() => reconcileR1SigningRead(
  review.snapshot.state === 'ready' ? review.snapshot.review?.order : null,
  review.contractSnapshot,
))
// Presentation only: failed reads and a verified exception are distinct from
// unverified, unknown, processing or conflicting records.
const signingFeedbackError = computed(() =>
  review.contractSnapshot.state === 'failed_retryable'
  || review.contractSnapshot.state === 'failed_terminal'
  || signingStage.value.stage === 'signing_exception',
)
const signingProgress = computed(() => signingReviewProgress({
  orderVerified: review.snapshot.state === 'ready',
  contractState: review.contractSnapshot.state,
  stage: signingStage.value.stage,
  handlerState: review.handlerSnapshot.state,
}))
// A read lifecycle is not a signing-completion percentage.
const signingStatusTitle = computed(() => review.contractSnapshot.state === 'succeeded'
  ? signingStage.value.title : signingProgress.value.title)
function contractStatusDisplay(status: string | undefined): string {
  if (status === '10') return '记录显示已签署 · 待核验'
  if (status === '2') return '签署处理中'
  if (status === '-3') return '状态异常 · 请联系支持'
  return '合同状态待核验'
}
function orderStageDisplay(processState: number | undefined): string {
  if (processState === 0) return '订单记录显示待签约；请以合同核验结果为准'
  if (processState === 4) return '订单记录显示签约处理中，请勿重复发起'
  return '订单签约阶段尚待核验，不能据此判断合同已签署'
}
/** Task-facing language derived only from the authoritative read state. */
const signingNextActionDisplay = computed(() => {
  switch (review.contractSnapshot.state) {
    case 'idle': return scopedContractReadEnabled.value
      ? '核验合同状态' : '合同状态核验暂未开放'
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
const scopedContractReadEnabled = computed(() => devFixtureContractRead.value
  || review.canReadContracts(routeWorkOrderId.value, routeOrderId.value))
function readContracts(): void {
  // Only an explicitly configured scoped read authority may query Contracts.
  if (!scopedContractReadEnabled.value || review.snapshot.state !== 'ready') return
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

<style lang="scss">
@import "@brand-ui/signing-read.scss";
</style>
