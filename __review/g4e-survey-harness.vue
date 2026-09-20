<template>
  <view class="review-root">
    <view class="review-banner">
      <view class="review-banner__title">G4-E Survey / 勘查</view>
      <view class="review-banner__badges">
        <text class="review-badge">H5_VISUAL_PROXY</text>
        <text class="review-badge">MOCK_PRODUCT_REVIEW</text>
      </view>
      <text class="review-banner__copy">真实 Action Workspace 与 Dynamic Form Runtime · 开发评审入口</text>
    </view>

    <view class="review-controls">
      <view class="review-control-row">
        <text class="review-control-label">评审场景</text>
        <select v-model="selectedScenario" class="review-select" aria-label="评审场景">
          <option v-for="item in reviewScenarioCatalog" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </view>
      <text class="review-control-description">{{ currentScenario.description }}</text>
      <text class="review-control-note">合成数据 · 不连接登录、Beta 或真实写操作</text>
    </view>

    <AppStatus
      v-if="session.status !== 'authenticated' || workspace.loadState !== 'succeeded'"
      class="review-load-status"
      :message="loadMessage"
      :tone="workspace.error ? 'warning' : 'neutral'"
      quiet
    />

    <ActionWorkspaceShell
      v-if="workspace.loadState === 'succeeded' && workspace.descriptor && workspace.dynamicForm"
      :customer-name="workspace.detail?.customerName"
      :display-number="workspace.detail?.displayNumber"
      :lifecycle="workspace.lifecycle"
      :draft-status="workspace.draftStatus"
      :can-submit="workspace.canSubmit"
      :business-feedback="feedback"
      submit-label="完成勘察"
      @submit="complete"
    >
      <SurveyActionContent />

      <template #success>
        <view class="review-success app-surface">
          <text class="review-success__title">现场勘察已完成</text>
          <text class="review-success__copy">本次动态表单已提交，工单状态已刷新。</text>
        </view>
      </template>
      <template #success-actions>
        <AppButton block variant="secondary" @tap="reloadScenario">重新查看场景</AppButton>
      </template>
    </ActionWorkspaceShell>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useSessionStore } from '@shared/state'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import SurveyActionContent from '@features/work-orders/components/SurveyActionContent.vue'
import {
  reviewScenario,
  reviewScenarioCatalog,
  reviewScenarioKeys,
  reviewWorkOrderId,
  reviewWorkflowNodeId,
  setReviewScenario,
  type ReviewScenarioKey,
} from './g4e-review-runtime'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const selectedScenario = ref<ReviewScenarioKey>(reviewScenario.value)
let loadSequence = 0

const currentScenario = computed(() => reviewScenarioCatalog.find((item) => item.key === selectedScenario.value) ?? reviewScenarioCatalog[0])
const feedback = computed(() => workspace.error?.message ?? workspace.postSuccessError?.message ?? '')
const loadMessage = computed(() => {
  if (session.status !== 'authenticated') return '正在准备开发会话…'
  if (workspace.loadState === 'loading') return '正在准备 Survey 操作空间…'
  if (workspace.loadState === 'blocked') return '当前场景无法执行，请检查 Mock fixture'
  if (workspace.error) return workspace.error.message
  return ''
})

watch(selectedScenario, (value) => {
  setReviewScenario(value)
})

watch(
  [() => session.status, reviewScenario],
  async ([status]) => {
    if (status !== 'authenticated') return
    const sequence = ++loadSequence
    workspace.clear()
    await workspace.ensureLoaded({
      workOrderId: reviewWorkOrderId,
      workflowNodeId: reviewWorkflowNodeId,
      actionIntent: 'interact_with_form',
    })
    if (sequence !== loadSequence) return
    await applyScenario(reviewScenario.value)
  },
  { immediate: true },
)

async function applyScenario(scenario: ReviewScenarioKey): Promise<void> {
  if (!workspace.dynamicForm) return
  if (scenario === 'survey-overview' || scenario === 'required-media-empty' || scenario === 'deferred-fields-absent') return

  const part = workspace.dynamicFields.find((field) => field.valueKey === 'part')
  if (part?.options?.length) {
    const leaf = firstLeaf(part.options)
    if (leaf) workspace.setField(part.fieldId, leaf)
  }

  if (scenario === 'required-fields' || scenario === 'validation-error' || scenario === 'unsaved') {
    const representative = workspace.dynamicFields.find((field) =>
      field.runtime.visible && field.runtime.capability !== 'UNSUPPORTED' && field.runtime.required && field.type !== 'image' && field.type !== 'file',
    )
    if (representative) workspace.setField(representative.fieldId, valueForField(representative))
  }

  if (scenario === 'part-dependent-fields' || scenario === 'leakage-cause' || scenario === 'saved-ready-to-complete') {
    await workspace.loadSurveyLeakageCauseOptions()
  }
  if (scenario === 'leakage-cause' || scenario === 'saved-ready-to-complete') {
    const ids = workspace.surveyLeakageCauseOptions.flatMap((group) => group.children.slice(0, 1).map((option) => option.value))
    if (ids.length > 0) workspace.setSurveyLeakageCauseSelection(ids)
  }

  if (scenario === 'part-dependent-fields') return
  if (scenario === 'saved-ready-to-complete') {
    fillAllRequiredFields()
    await nextTick()
    await workspace.saveDynamicForm()
  }
}

function fillAllRequiredFields(): void {
  for (const field of workspace.dynamicFields) {
    if (!field.runtime.visible || field.runtime.readOnly || field.runtime.capability === 'UNSUPPORTED' || field.runtime.capability === 'PRESENTATION_ONLY') continue
    if (!field.runtime.required || field.type === 'image' || field.type === 'file') continue
    const current = workspace.dynamicForm?.values[field.valueKey]
    if (current !== undefined && current !== null && current !== '' && (!Array.isArray(current) || current.length > 0)) continue
    workspace.setField(field.fieldId, valueForField(field))
  }
}

function valueForField(field: { readonly type: string; readonly options?: readonly { readonly value: string; readonly children?: readonly unknown[] }[]; readonly multiple?: boolean }): string | readonly string[] {
  if (field.type === 'cascade' && field.options?.length) return firstLeaf(field.options) ?? 'mock-option'
  if ((field.multiple || field.type === 'checkbox') && field.options?.length) return [field.options[0].value]
  if (field.options?.length) return field.options[0].value
  return field.type === 'textarea' ? '演示填写内容' : '演示填写'
}

function firstLeaf(options: readonly { readonly value: string; readonly children?: readonly any[] }[]): readonly string[] | undefined {
  for (const option of options) {
    if (option.children?.length) {
      const nested = firstLeaf(option.children)
      if (nested) return [option.value, ...nested]
    }
    return [option.value]
  }
  return undefined
}

async function complete(): Promise<void> {
  await workspace.completeDynamicForm()
}

function reloadScenario(): void {
  const next = reviewScenario.value
  setReviewScenario(next)
  loadSequence += 1
  workspace.clear()
  void workspace.ensureLoaded({
    workOrderId: reviewWorkOrderId,
    workflowNodeId: reviewWorkflowNodeId,
    actionIntent: 'interact_with_form',
  }).then(() => applyScenario(next))
}

// Keep the catalog import live in the generated template while making the
// controlled vocabulary explicit for static review-harness checks.
void reviewScenarioKeys
</script>

<style>
html, body, #app { background: var(--app-color-page); margin: 0; min-height: 100%; }
body { color: var(--app-color-text-primary); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
.review-root { background: var(--app-color-page); min-height: 100vh; padding: 16px 0 0; }
.review-banner { background: #172a47; color: #fff; margin: 0 auto 12px; max-width: 960rpx; padding: 16px 24px; }
.review-banner__title { font-size: 22px; font-weight: 800; }
.review-banner__badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.review-badge { background: #2f80ed; border-radius: 999px; font-size: 11px; padding: 4px 8px; }
.review-banner__copy { color: #c7d6ed; display: block; font-size: 12px; margin-top: 8px; }
.review-controls { background: #fff; border: 1px solid var(--app-color-border); margin: 0 auto 12px; max-width: 912rpx; padding: 14px 24px; }
.review-control-row { align-items: center; display: flex; justify-content: space-between; gap: 12px; }
.review-control-label { color: var(--app-color-text-primary); font-size: 14px; font-weight: 700; }
.review-select { background: var(--app-color-control-surface); border: 1px solid var(--app-color-border-control); border-radius: 8px; color: var(--app-color-text-primary); font-size: 14px; max-width: 64%; padding: 8px 10px; }
.review-control-description, .review-control-note { color: var(--app-color-text-secondary); display: block; font-size: 12px; margin-top: 8px; }
.review-control-note { color: var(--app-color-warning); }
.review-load-status { margin: 0 auto; max-width: 912rpx; padding: 12px 24px; }
.review-success { margin-top: 16px; padding: 32px 24px; text-align: center; }
.review-success__title { color: var(--app-color-text-primary); display: block; font-size: 24px; font-weight: 800; }
.review-success__copy { color: var(--app-color-text-secondary); display: block; font-size: 14px; margin-top: 8px; }
@media (min-width: 640px) {
  .review-root { padding-top: 24px; }
  .review-banner { border-radius: 16px; }
  .review-controls { border-radius: 16px; }
}
</style>
