<template>
  <ActionWorkspaceShell
    commercial-quotation
    :compact-quote-entry="firstStepActive"
    class="quotation-workspace-shell"
    :class="{ 'quotation-workspace-shell--review': productReviewOnly }"
    :scroll-into-view="scrollIntoView"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :service-address="workspace.detail?.serviceAddress"
    :service-district="workspace.detail?.serviceDistrict"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="canOpenSubmit"
    :transitioning="workspace.quotationOrderState.state === 'submitting'"
    :submit-label="workspace.quotationOrderState.state === 'submitting' ? '提交中…' : '提交订单/报价方案'"
    @submit="openQuotationConfirmation"
  >
    <slot name="journey-context" />
    <QuotationActionContent
      ref="quotationContentRef"
      :state="contentState"
      :synthetic-fields-review="syntheticReviewEnabled"
      :product-review-only="productReviewOnly"
      :sku-lineage-audit="props.skuLineageAudit"
      :same-catalog-lineage="props.sameCatalogLineage"
      :synthetic-sku-readiness="props.syntheticSkuReadiness"
      :synthetic-review-validate-selection="props.syntheticReviewValidateSelection"
      :synthetic-review-focus-first-error="props.syntheticReviewFocusFirstError"
      @retry="$emit('retry')"
      @back="$emit('back')"
      @return-to-group="returnToGroup"
      @first-step-presentation="onFirstStepPresentation"
    ><template #synthetic-review-panel><slot name="synthetic-review-panel" /></template></QuotationActionContent>
    <!-- Future-stage entry follows the active quotation task, never precedes it. -->
    <slot name="after-content" />
    <template #actions>
      <view v-if="firstStepActive" class="q01-footer" data-testid="quotation-first-step-footer">
        <view class="q01-footer-status" data-testid="quotation-footer-summary">
          <text>本机草稿</text>
          <text>{{ amountPresentation.label }} · {{ amountPresentation.value }}</text>
        </view>
        <view class="q01-footer-actions">
          <AppButton variant="secondary" class="q01-footer-save xl-craft__action-secondary"
            data-testid="quotation-first-step-save-draft"
            :disabled="!firstStepCanEdit" @tap="composition.flushDraft">保存草稿</AppButton>
          <AppButton class="q01-footer-next xl-craft__action-primary"
            data-testid="quotation-first-step-next"
            :disabled="!firstStepCanEdit"
            @tap="advanceFirstRepairStep">下一步 · 添加报价项目 →</AppButton>
        </view>
        <text v-if="productReviewOnly || syntheticReviewEnabled || productionReadOnly"
          class="q01-footer-caution">演示 / 只读环境不支持创建正式订单</text>
      </view>
      <view v-else class="quotation-workspace-footer-main">
      <view class="quotation-workspace-footer-summary" data-testid="quotation-footer-summary">
        <view class="quotation-workspace-footer-summary__amount">
          <text class="quotation-workspace-footer-summary__amount-label">{{ amountPresentation.label }}</text>
          <AppAmountValue class="quotation-workspace-footer-summary__amount-value" size="prominent"
            tone="primary" :value="amountPresentation.value" />
        </view>
        <view class="quotation-workspace-footer-summary__copy">
          <text class="quotation-workspace-footer-summary__title">本机报价草稿</text>
          <text class="quotation-workspace-footer-summary__meta" :data-testid="productReviewOnly ? 'quotation-product-demo-read-only' : undefined">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个部位组{{ productReviewOnly ? ' · 演示，不提交订单' : '' }}</text>
        </view>
      </view>
      <AppButton
        v-if="!productionReadOnly && !syntheticReviewEnabled && !productReviewOnly"
        data-testid="action-workspace-submit"
        class="action-workspace-submit"
        :disabled="!canOpenSubmit"
        :loading="workspace.quotationOrderState.state === 'submitting'"
        block
        @tap="openQuotationConfirmation"
      >{{ workspace.quotationOrderState.state === 'submitting' ? '提交中…' : '提交订单/报价方案' }}</AppButton>
      <AppButton v-if="productionReadOnly || syntheticReviewEnabled || productReviewOnly"
        class="quotation-workspace-disabled-submit" disabled block data-testid="quotation-submit-disabled-preview"
      >提交订单</AppButton>

      </view>
      <AppStatus
        v-if="productionReadOnly"
        class="quotation-production-read-only"
        message="生产服务器报价只读；此处本机草稿不会提交、修改订单或推进流程。"
        tone="warning"
        quiet
        data-testid="quotation-production-read-only"
      />
      <AppStatus
        v-else-if="syntheticReviewEnabled"
        class="quotation-production-read-only"
        message="合成动态字段评审模式：正式订单提交与工作流命令已禁用。"
        tone="warning"
        quiet
        data-testid="quotation-synthetic-submit-disabled"
      />
      <AppStatus v-if="!productionReadOnly && !syntheticReviewEnabled && !productReviewOnly && hasQuantityErrors"
        class="quotation-submit-unavailable" message="部分项目数量不合法，请逐项修正后再检查提交。"
        tone="warning" quiet data-testid="quotation-submit-invalid-quantity" />
      <AppStatus
        v-if="!productionReadOnly && !syntheticReviewEnabled && !productReviewOnly && !canOpenSubmit && !isInitialEmptyWorkbench && !hasQuantityErrors"
        class="quotation-submit-unavailable"
        message="提交条件尚未满足；完成必需配置并通过本机校验后，此入口才会开放。"
        tone="neutral"
        quiet
        data-testid="quotation-submit-unavailable"
      />
    </template>
    <view v-if="canOpenSubmit && quotationConfirmOpen" class="quotation-confirm-backdrop" role="presentation">
      <view class="quotation-confirm-sheet" role="dialog" aria-modal="true" data-testid="quotation-order-confirmation">
        <text class="quotation-confirm-title">确认提交订单/报价方案？</text>
        <text class="workspace-state-copy">提交会创建服务器订单，并触发后端已验证的报价单生成、工单金额更新等副作用；不会完成当前工单工作流。提交后请勿重复操作。</text>
        <view class="quotation-confirm-actions">
          <AppButton variant="secondary" @tap="quotationConfirmOpen = false">返回检查</AppButton>
          <AppButton data-testid="quotation-order-confirm" :disabled="!canOpenSubmit" @tap="confirmQuotationSubmit">确认提交</AppButton>
        </view>
      </view>
    </view>
  </ActionWorkspaceShell>
</template>

<script setup lang="ts">
import AppAmountValue from '@shared/ui/AppAmountValue.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { quotationAmountPresentation } from './amount-presentation'
import { evaluateQuotationSubmitGuard } from './quotation-submit-guard'
import { isInitialQuotationWorkbenchEmpty } from './empty-workbench-state'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import QuotationActionContent from './QuotationActionContent.vue'
import type { SkuLineageAudit } from './sku-identity-review'
import type { SameCatalogComparison } from './sku-identity-review'
import type { QuoteSkuReadiness } from './sku-readiness-view'

const props = defineProps<{
  readonly contentState: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
  readonly productReviewOnly?: boolean
  readonly skuLineageAudit?: SkuLineageAudit | null
  readonly sameCatalogLineage?: SameCatalogComparison | null
  readonly syntheticSkuReadiness?: QuoteSkuReadiness | null
  readonly syntheticFieldsReview?: boolean
  readonly syntheticReviewValidateSelection?: () => boolean
  readonly syntheticReviewFocusFirstError?: () => void
}>()
defineEmits<{ (event: 'retry'): void; (event: 'back'): void }>()

const workspace = useActionWorkspaceStore()
const composition = useQuotationCompositionStore()
const isInitialEmptyWorkbench = computed(() => isInitialQuotationWorkbenchEmpty({
  contentState: props.contentState,
  editState: workspace.quotationEditState.state,
  draftState: composition.localState,
  groupCount: composition.groups.length,
  catalogOpen: false,
}))
const amountPresentation = computed(() => quotationAmountPresentation({
  result: workspace.quotationEngine.result,
  draftVersion: composition.draft?.draftVersion,
  isLoading: workspace.quotationEngine.state === 'loading',
}))
const productionReadOnly = isProductionReadOnlyRuntime()
const productReviewOnly = computed(() => import.meta.env.DEV && props.productReviewOnly === true)
const syntheticReviewEnabled = computed(() => import.meta.env.DEV
  && props.syntheticFieldsReview === true
  && Boolean(props.syntheticReviewValidateSelection)
  && Boolean(props.syntheticReviewFocusFirstError))
const quotationConfirmOpen = ref(false)
const firstStepActive = ref(false)
const firstStepCanEdit = ref(false)
const quotationContentRef = ref<InstanceType<typeof QuotationActionContent> | null>(null)
function onFirstStepPresentation(state: { active: boolean; canEdit: boolean }): void {
  firstStepActive.value = state.active
  firstStepCanEdit.value = state.canEdit
}
function advanceFirstRepairStep(): void {
  if (!firstStepActive.value || !firstStepCanEdit.value) return
  void quotationContentRef.value?.advanceFirstRepairPartStep()
}
const scrollIntoView = ref('')
const hasQuantityErrors = computed(() => Object.values(composition.quantityErrorBySelection).some(Boolean))
const submitGate = computed(() => evaluateQuotationSubmitGuard({
  modeBlocked: productionReadOnly || productReviewOnly.value || syntheticReviewEnabled.value,
  contentReady: props.contentState === 'ready',
  workspaceReady: workspace.canSubmitQuotation,
  quantityErrors: composition.quantityErrorBySelection,
  orderState: workspace.quotationOrderState.state,
}))
const canOpenSubmit = computed(() => submitGate.value === 'ready')
// Never reuse an old confirmation for a different draft revision.
watch(() => composition.draft?.draftVersion, () => { quotationConfirmOpen.value = false })
watch(canOpenSubmit, allowed => { if (!allowed) quotationConfirmOpen.value = false })

async function returnToGroup(groupId: string): Promise<void> {
  scrollIntoView.value = ''
  await nextTick()
  scrollIntoView.value = `quotation-repair-group-${groupId}`
}

async function confirmQuotationSubmit(): Promise<void> {
  if (!quotationConfirmOpen.value || !canOpenSubmit.value) return
  quotationConfirmOpen.value = false
  await workspace.submitQuotationOrder()
}

function openQuotationConfirmation(): void {
  if (!canOpenSubmit.value) return
  quotationConfirmOpen.value = true
}
</script>

<style>
.quotation-workspace-shell { font-family:-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif; }

.quotation-confirm-backdrop { align-items: center; background: rgba(20, 32, 52, .42); display: flex; inset: 0; justify-content: center; padding: var(--app-page-gutter); position: fixed; z-index: 1100; }
.quotation-confirm-sheet { background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); box-sizing: border-box; max-width: 640rpx; padding: var(--app-card-padding); width: 100%; }
.quotation-confirm-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.quotation-confirm-actions { display: flex; gap: var(--app-space-sm); justify-content: flex-end; margin-top: var(--app-space-lg); }
.quotation-production-read-only { display: block; }
.quotation-workspace-shell .action-workspace-footer { background: var(--app-color-surface); padding-top: 14rpx; }
.quotation-workspace-footer-summary { align-items: center; display: flex; justify-content: space-between; margin-bottom: 12rpx; }
.quotation-workspace-footer-summary__copy { display: flex; flex-direction: column; min-width: 0; }
.quotation-workspace-footer-summary__title { color: var(--app-color-text-primary); font-size: 22rpx; font-weight: 800; }
.quotation-workspace-footer-summary__meta { color: var(--app-color-text-secondary); font-size: 22rpx; line-height: 1.35; margin-top: 4rpx; }
.quotation-workspace-shell--review .quotation-workspace-footer-summary__meta { font-size: 20rpx; }
.quotation-workspace-shell--review .quotation-workspace-footer-summary { margin-bottom: 2rpx; }
.quotation-workspace-shell--review .action-workspace-footer { padding-top: 8rpx; }
.quotation-workspace-footer-summary__amount { align-items: flex-end; display: flex; flex-direction: column; flex-shrink: 0; margin-left: var(--app-space-sm); }
.quotation-workspace-footer-summary__amount-label { color: var(--app-color-text-secondary); font-size: 20rpx; }
.quotation-workspace-footer-summary__amount-value { margin-top: 4rpx; }
.quotation-submit-unavailable { margin-top: var(--app-space-sm); }
.quotation-workspace-shell .action-workspace-body { padding-bottom: calc(320rpx + env(safe-area-inset-bottom)); }
/* #ifdef H5 */
.quotation-workspace-shell.action-workspace-page { height: calc(100vh - 44px); min-height: 0; }
/* #endif */

/* Q01 fixed summary: amount + primary action on the same horizontal row.
   Disabled preview still appears for visual parity, never issues an intent. */
.quotation-workspace-shell .action-workspace-footer-inner {
  display:grid; grid-template-columns:minmax(0, 1fr) minmax(160rpx, 34%); column-gap:12rpx; align-items:center;
}
.quotation-workspace-footer-summary { grid-column:1; grid-row:1; margin-bottom:0; display:flex; align-items:flex-start;
  gap:6rpx; flex-direction:column; min-width:0; }
.quotation-workspace-footer-summary__amount { align-items:flex-start; margin-left:0; }
.quotation-workspace-footer-summary__amount-label { color:var(--app-color-text-secondary); font-size:20rpx; }
.quotation-workspace-footer-summary__amount-value { margin-top:2rpx; }
.quotation-workspace-footer-summary__copy { display:block; }
.quotation-workspace-footer-summary__title { display:none; }
.quotation-workspace-footer-summary__meta { font-size:19rpx; color:var(--app-color-text-secondary); margin-top:4rpx; }
.quotation-workspace-shell .action-workspace-submit, .quotation-workspace-disabled-submit {
  grid-column:2; grid-row:1; width:100%; min-width:0; min-height:82rpx; font-size:24rpx; }
.quotation-workspace-shell .quotation-production-read-only,
.quotation-workspace-shell .quotation-submit-unavailable { grid-column:1 / -1; }
.quotation-workspace-disabled-submit { background:#e6eaf1; color:#9ca8b9; border:0; }
.quotation-workspace-shell--review .quotation-workspace-footer-summary { margin-bottom:0; }

/* The footer is a true two-column row, not separate slot fragments whose
   uni-app wrapper may cause grid auto-placement and hiding of the CTA. */
.quotation-workspace-shell .action-workspace-footer-inner { display:block !important; }
.quotation-workspace-footer-main { display:flex; align-items:center; justify-content:space-between;
  gap:14rpx; min-width:0; width:100%; }
.quotation-workspace-footer-main .quotation-workspace-footer-summary { flex:1 1 0; min-width:0; width:auto; margin:0; }
.quotation-workspace-footer-main .action-workspace-submit,
.quotation-workspace-footer-main .quotation-workspace-disabled-submit {
  flex:0 0 38%; width:38%; max-width:38%; height:84rpx; min-height:84rpx; box-sizing:border-box;
  margin:0; font-size:23rpx;
}
.quotation-workspace-footer-main .quotation-workspace-disabled-submit.app-button {
  opacity:1 !important; background:#ecf0f6 !important; color:#8593a6 !important;
  border:1rpx solid #dae2ed !important;
}

</style>
<style src="./Q01Footer.css"></style>
