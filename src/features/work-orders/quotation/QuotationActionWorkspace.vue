<template>
  <ActionWorkspaceShell
    class="quotation-workspace-shell"
    :scroll-into-view="scrollIntoView"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="!productionReadOnly && workspace.canSubmitQuotation"
    :transitioning="workspace.quotationOrderState.state === 'submitting'"
    :submit-label="workspace.quotationOrderState.state === 'submitting' ? '提交中…' : '提交订单/报价方案'"
    @submit="quotationConfirmOpen = true"
  >
    <QuotationActionContent :state="contentState" @retry="$emit('retry')" @back="$emit('back')" @return-to-group="returnToGroup" />
    <template #actions>
      <view class="quotation-workspace-footer-summary" data-testid="quotation-footer-summary">
        <view class="quotation-workspace-footer-summary__copy">
          <text class="quotation-workspace-footer-summary__title">本机报价草稿</text>
          <text class="quotation-workspace-footer-summary__meta">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个部位组</text>
        </view>
        <view class="quotation-workspace-footer-summary__amount">
          <text class="quotation-workspace-footer-summary__amount-label">{{ amountPresentation.label }}</text>
          <text class="quotation-workspace-footer-summary__amount-value">
            {{ amountPresentation.value }}
          </text>
        </view>
      </view>
      <AppStatus
        v-if="productionReadOnly"
        class="quotation-production-read-only"
        message="生产服务器报价只读；此处本机草稿不会提交、修改订单或推进流程。"
        tone="warning"
        quiet
        data-testid="quotation-production-read-only"
      />
      <AppButton
        v-else
        data-testid="action-workspace-submit"
        class="action-workspace-submit"
        :disabled="!workspace.canSubmitQuotation || workspace.quotationOrderState.state === 'submitting'"
        :loading="workspace.quotationOrderState.state === 'submitting'"
        block
        @tap="quotationConfirmOpen = true"
      >{{ workspace.quotationOrderState.state === 'submitting' ? '提交中…' : '提交订单/报价方案' }}</AppButton>
      <AppStatus
        v-if="!productionReadOnly && !workspace.canSubmitQuotation"
        class="quotation-submit-unavailable"
        message="提交条件尚未满足；完成必需配置并通过本机校验后，此入口才会开放。"
        tone="neutral"
        quiet
        data-testid="quotation-submit-unavailable"
      />
    </template>
    <view v-if="!productionReadOnly && quotationConfirmOpen" class="quotation-confirm-backdrop" role="presentation">
      <view class="quotation-confirm-sheet" role="dialog" aria-modal="true" data-testid="quotation-order-confirmation">
        <text class="quotation-confirm-title">确认提交订单/报价方案？</text>
        <text class="workspace-state-copy">提交会创建服务器订单，并触发后端已验证的报价单生成、工单金额更新等副作用；不会完成当前工单工作流。提交后请勿重复操作。</text>
        <view class="quotation-confirm-actions">
          <AppButton variant="secondary" @tap="quotationConfirmOpen = false">返回检查</AppButton>
          <AppButton data-testid="quotation-order-confirm" :disabled="workspace.quotationOrderState.state === 'submitting'" @tap="confirmQuotationSubmit">确认提交</AppButton>
        </view>
      </view>
    </view>
  </ActionWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { quotationAmountPresentation } from './amount-presentation'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import QuotationActionContent from './QuotationActionContent.vue'

defineProps<{ readonly contentState: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal' }>()
defineEmits<{ (event: 'retry'): void; (event: 'back'): void }>()

const workspace = useActionWorkspaceStore()
const composition = useQuotationCompositionStore()
const amountPresentation = computed(() => quotationAmountPresentation({
  result: workspace.quotationEngine.result,
  draftVersion: composition.draft?.draftVersion,
  isLoading: workspace.quotationEngine.state === 'loading',
}))
const productionReadOnly = isProductionReadOnlyRuntime()
const quotationConfirmOpen = ref(false)
const scrollIntoView = ref('')

async function returnToGroup(groupId: string): Promise<void> {
  scrollIntoView.value = ''
  await nextTick()
  scrollIntoView.value = `quotation-repair-group-${groupId}`
}

async function confirmQuotationSubmit(): Promise<void> {
  if (productionReadOnly) return
  quotationConfirmOpen.value = false
  await workspace.submitQuotationOrder()
}
</script>

<style>
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
.quotation-workspace-footer-summary__amount { align-items: flex-end; display: flex; flex-direction: column; flex-shrink: 0; margin-left: var(--app-space-sm); }
.quotation-workspace-footer-summary__amount-label { color: var(--app-color-text-secondary); font-size: 20rpx; }
.quotation-workspace-footer-summary__amount-value { color: var(--app-color-primary); font-size: 25rpx; font-weight: 800; margin-top: 4rpx; }
.quotation-submit-unavailable { margin-top: var(--app-space-sm); }
.quotation-workspace-shell .action-workspace-body { padding-bottom: calc(320rpx + env(safe-area-inset-bottom)); }
/* #ifdef H5 */
.quotation-workspace-shell.action-workspace-page { height: calc(100vh - 44px); min-height: 0; }
/* #endif */
</style>
