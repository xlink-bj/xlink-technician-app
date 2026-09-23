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

    <ActionWorkspaceShell
      v-else-if="workspace.descriptor?.contentKind === 'quotation'"
      data-testid="g4f-quotation-workspace"
      :customer-name="workspace.detail?.customerName"
      :display-number="workspace.detail?.displayNumber"
      :lifecycle="workspace.lifecycle"
      :draft-status="workspace.draftStatus"
      :can-submit="false"
      submit-label="报价操作未开放"
    >
      <QuotationActionContent
        :state="quotationContentViewState"
        @retry="reload"
        @back="exit"
      />
      <template #actions>
        <text class="g4f-review-readonly" data-testid="g4f-readonly-boundary">报价草稿仅保存在本机，不会提交报价</text>
      </template>
    </ActionWorkspaceShell>

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
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import QuotationActionContent from '@features/work-orders/quotation/QuotationActionContent.vue'
import { mockCommandScenarioIds, mockQuotationWorkflowNodeId } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'
import { reviewScenarioFromLocation } from '../../quotation-scenarios'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const scenario = reviewScenarioFromLocation()
const reviewScenarios = [
  { id: 'empty', label: '空草稿' },
  { id: 'catalog', label: '目录浏览' },
  { id: 'populated', label: '组合草稿' },
  { id: 'restored', label: '恢复草稿' },
  { id: 'invalid', label: '异常草稿' },
  { id: 'legacy', label: '旧版草稿保留' },
] as const
let initialCatalogOpened = false
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
    })
  },
  { immediate: true },
)

watch(
  () => [workspace.loadState, workspace.quotationComposition.localState] as const,
  ([loadState, localState]) => {
    if (!initialCatalogOpened && scenario === 'catalog' && loadState === 'succeeded' && localState === 'fresh') {
      initialCatalogOpened = true
      const group = workspace.quotationComposition.createGroup({ repairParts: ['repair-part-code-001'] })
      if (group.state === 'succeeded' && group.data) workspace.quotationCatalogBrowser.open('package')
    }
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
.g4f-review-readonly { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); padding: var(--app-space-md) 0; text-align: center; }
.g4f-review-blocked { background: var(--app-color-surface); border-radius: var(--app-radius-card); margin: var(--app-space-md) auto; max-width: 960rpx; padding: var(--app-card-padding); }
.g4f-review-blocked__title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.g4f-review-blocked__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
</style>
