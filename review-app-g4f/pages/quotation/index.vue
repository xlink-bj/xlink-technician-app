<template>
  <view class="g4f-review-page" data-testid="g4f-quotation-review">
    <view class="g4f-review-banner">
      <text class="g4f-review-banner__title" data-testid="g4f-review-title">G4-F 报价工作区</text>
      <view class="g4f-review-banner__badges">
        <text class="g4f-review-badge">H5_VISUAL_PROXY</text>
        <text class="g4f-review-badge">MOCK_PRODUCT_REVIEW</text>
      </view>
      <text class="g4f-review-banner__copy">uni-app H5 · 合成报价场景 · 本地草稿</text>
      <view class="g4f-review-scenarios" data-testid="g4f-review-scenario-selector">
        <navigator
          v-for="option in reviewScenarios"
          :key="option.id"
          class="g4f-review-scenario"
          :class="{ 'g4f-review-scenario--selected': scenario === option.id }"
          :url="`/pages/quotation/index?scenario=${option.id}`"
          :data-testid="`g4f-review-scenario-${option.id}`"
        >{{ option.label }}</navigator>
      </view>
    </view>

    <AppLoadingState
      v-if="session.status !== 'authenticated' || (!workspace.descriptor && workspace.loadState === 'loading')"
      variant="workspace"
      label="正在准备报价工作区"
    />

    <QuotationActionWorkspace
      v-else-if="workspace.descriptor?.contentKind === 'quotation'"
      data-testid="g4f-quotation-workspace"
      :content-state="quotationContentViewState"
      @retry="reload"
      @back="exit"
    />

    <view v-else-if="workspace.loadState === 'blocked' || workspace.loadState.startsWith('failed')" class="g4f-review-blocked" data-testid="g4f-workspace-blocked">
      <text class="g4f-review-blocked__title">报价工作区未能打开</text>
      <text class="g4f-review-blocked__copy">Mock fixture 或当前 Workflow 条件未通过；不会切换到真实报价 API。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useSessionStore } from '@shared/state'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import QuotationActionWorkspace from '@features/work-orders/quotation/QuotationActionWorkspace.vue'
import { mockCommandScenarioIds, mockQuotationWorkflowNodeId } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'
import { reviewScenarioFromLocation } from '../../quotation-scenarios'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const scenario = reviewScenarioFromLocation()
const routeOrderId = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('orderId')
const reviewScenarios = [
  { id: 'empty', label: '空草稿' },
  { id: 'catalog', label: '目录浏览' },
  { id: 'catalog-empty', label: '目录空状态' },
  { id: 'catalog-error', label: '目录可重试失败' },
  { id: 'populated', label: '组合草稿' },
  { id: 'restored', label: '恢复草稿' },
  { id: 'invalid', label: '异常草稿' },
  { id: 'legacy', label: '旧版草稿保留' },
  { id: 'submit-ready', label: '可提交合成草稿' },
  { id: 'readback-pending', label: '读回待刷新' },
  { id: 'edit', label: '现有订单编辑' },
  { id: 'unsupported-edit', label: '不支持订单只读' },
] as const
const quotationContentViewState = computed(() => workspace.quotationContentState === 'idle'
  ? 'loading'
  : workspace.quotationContentState)

watch(
  () => session.status,
  (status) => {
    if (status !== 'authenticated') return
    void workspace.ensureLoaded({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.quotationFoundation),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockQuotationWorkflowNodeId),
      actionIntent: 'place_order',
    }).then(async (loaded) => {
      if (loaded.state === 'succeeded' && routeOrderId) {
        await workspace.loadQuotationOrderForEdit(routeOrderId)
      }
    })
  },
  { immediate: true },
)

function reload(): void {
  void workspace.clear()
  void workspace.ensureLoaded({
    workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.quotationFoundation),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockQuotationWorkflowNodeId),
    actionIntent: 'place_order',
  })
}

function exit(): void {
  void workspace.flushDraft()
}
</script>

<style>
.g4f-review-page { background: var(--app-color-page); min-height: 100vh; padding: var(--app-space-md) var(--app-page-gutter); }
.g4f-review-banner { margin: 0 auto; max-width: 960rpx; padding: var(--app-space-sm) var(--app-space-xs) var(--app-space-md); }
.g4f-review-banner__title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.g4f-review-banner__badges { display: flex; flex-wrap: wrap; gap: var(--app-space-xs); margin-top: var(--app-space-sm); }
.g4f-review-badge { background: var(--app-color-primary-soft); border-radius: var(--app-radius-control); color: var(--app-color-primary); font-size: var(--app-font-meta); padding: var(--app-space-xs) var(--app-space-sm); }
.g4f-review-banner__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-sm); }
.g4f-review-scenarios { display: flex; flex-wrap: wrap; gap: var(--app-space-xs); margin-top: var(--app-space-sm); }
.g4f-review-scenario { background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); color: var(--app-color-text-secondary); font-size: var(--app-font-meta); padding: var(--app-space-xs) var(--app-space-sm); }
.g4f-review-scenario--selected { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); color: var(--app-color-primary); }
.g4f-review-blocked { background: var(--app-color-surface); border-radius: var(--app-radius-card); margin: var(--app-space-md) auto; max-width: 960rpx; padding: var(--app-card-padding); }
.g4f-review-blocked__title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.g4f-review-blocked__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
</style>
