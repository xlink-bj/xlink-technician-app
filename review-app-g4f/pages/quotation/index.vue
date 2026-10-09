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
      <view
        v-if="syntheticFieldsReviewEnabled"
        class="g4f-review-scenario g4f-review-reentry"
        data-testid="g4f-review-fast-reentry"
        @tap="remountSyntheticReviewPanel"
      >快速离开并返回字段面板</view>
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
      :synthetic-fields-review="syntheticFieldsReviewEnabled"
      :synthetic-review-validate-selection="validateSyntheticSelectionEntry"
      :synthetic-review-focus-first-error="focusSyntheticFirstError"
      @retry="reload"
      @back="exit"
    >
      <template #synthetic-review-panel>
        <AppButton
          class="g4f-review-synthetic-toggle"
          variant="secondary"
          block
          data-testid="synthetic-panel-toggle"
          :aria-expanded="syntheticPanelExpanded"
          @tap="syntheticPanelExpanded = !syntheticPanelExpanded"
        >{{ syntheticPanelExpanded ? '收起合成字段体验' : '展开合成字段体验（评审专用）' }}</AppButton>
        <SyntheticOrderExtFieldReviewPanel
          v-if="syntheticFieldsReviewEnabled && syntheticReviewIdentity && syntheticPanelExpanded && syntheticPanelMounted"
          ref="syntheticReviewPanel"
          :enabled="true"
          :identity="syntheticReviewIdentity"
          :storage="syntheticReviewStorage"
        />
      </template>
    </QuotationActionWorkspace>

    <view v-else-if="workspace.loadState === 'blocked' || workspace.loadState.startsWith('failed')" class="g4f-review-blocked" data-testid="g4f-workspace-blocked">
      <text class="g4f-review-blocked__title">报价工作区未能打开</text>
      <text class="g4f-review-blocked__copy">Mock fixture 或当前 Workflow 条件未通过；不会切换到真实报价 API。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useSessionStore } from '@shared/state'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppButton from '@shared/ui/AppButton.vue'
import QuotationActionWorkspace from '@features/work-orders/quotation/QuotationActionWorkspace.vue'
import { mockCommandScenarioIds, mockQuotationWorkflowNodeId } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'
import {
  createG4fSyntheticReviewStorage,
  reviewScenarioFromLocation,
} from '../../quotation-scenarios'
import SyntheticOrderExtFieldReviewPanel from '@features/work-orders/quotation/SyntheticOrderExtFieldReviewPanel.vue'
import type { SyntheticOrderExtFieldReviewPanelHandle } from '@features/work-orders/quotation/SyntheticOrderExtFieldReviewPanel.vue'
import {
  SYNTHETIC_ORDER_EXTFIELD_FIXTURE_VERSION,
  SYNTHETIC_ORDER_EXTFIELD_SCENARIO,
} from '@features/work-orders/quotation/synthetic-extfield-review'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const scenario = reviewScenarioFromLocation()
const syntheticReviewPanel = ref<SyntheticOrderExtFieldReviewPanelHandle | null>(null)
const syntheticPanelMounted = ref(true)
const syntheticPanelExpanded = ref(false)
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
  { id: 'dynamic-fields', label: '合成动态字段' },
] as const
const syntheticFieldsReviewEnabled = import.meta.env.DEV && scenario === SYNTHETIC_ORDER_EXTFIELD_SCENARIO
const syntheticReviewStorage = createG4fSyntheticReviewStorage()
const syntheticReviewIdentity = computed(() => {
  const descriptor = workspace.descriptor
  if (!syntheticFieldsReviewEnabled || !descriptor || descriptor.actionIntent !== 'place_order') return undefined
  return {
    userId: String(descriptor.userId),
    workOrderId: String(descriptor.workOrderId),
    workflowNodeId: String(descriptor.workflowNodeId),
    actionIntent: String(descriptor.actionIntent),
    scenario: SYNTHETIC_ORDER_EXTFIELD_SCENARIO,
    fixtureVersion: SYNTHETIC_ORDER_EXTFIELD_FIXTURE_VERSION,
  } as const
})
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
      if (loaded.state === 'succeeded' && routeOrderId && scenario !== SYNTHETIC_ORDER_EXTFIELD_SCENARIO) {
        await workspace.loadQuotationOrderForEdit(routeOrderId)
      }
    })
  },
  { immediate: true },
)

async function remountSyntheticReviewPanel(): Promise<void> {
  syntheticPanelMounted.value = false
  await nextTick()
  syntheticPanelMounted.value = true
}

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

function validateSyntheticSelectionEntry(): boolean {
  return syntheticReviewPanel.value?.validateSelectionEntry() ?? false
}

function focusSyntheticFirstError(): void {
  syntheticReviewPanel.value?.focusFirstError()
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
.g4f-review-synthetic-toggle { margin-top: var(--app-space-md); }
.g4f-review-blocked { background: var(--app-color-surface); border-radius: var(--app-radius-card); margin: var(--app-space-md) auto; max-width: 960rpx; padding: var(--app-card-padding); }
.g4f-review-blocked__title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.g4f-review-blocked__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
</style>
