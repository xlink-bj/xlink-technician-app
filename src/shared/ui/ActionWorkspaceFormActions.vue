<template>
  <view class="action-workspace-form-actions-wrap" data-testid="action-workspace-form-actions-wrap">
    <view v-if="hint" class="action-workspace-form-actions__hint" data-testid="survey-complete-hint">
      <AppIcon name="warning" :size="14" color="var(--app-color-warning)" />
      <text>{{ hint }}</text>
    </view>
    <text v-if="saveState !== 'saved'" class="action-workspace-form-actions__status" data-testid="dynamic-form-save-status">{{ saveState === 'saving' ? '正在保存当前表单，请稍候。' : saveState === 'failed' ? '表单保存未成功，当前输入仍保留。' : '当前修改尚未保存为记录。' }}</text>
    <text v-else class="action-workspace-form-actions__status" data-testid="dynamic-form-save-status">表单已保存；完成操作仍需满足当前节点条件。</text>
    <view class="action-workspace-form-actions" data-testid="action-workspace-form-actions">
    <AppButton
      data-testid="dynamic-form-save"
      class="action-workspace-form-actions__save"
      :variant="saveState === 'saved' ? 'secondary' : 'primary'"
      :disabled="!canSave || saveState === 'saved' || lifecycle === 'submitting' || transitioning || saveState === 'saving'"
      :loading="saveState === 'saving'"
      block
      @tap="$emit('save')"
    >
      {{ saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '保存表单' }}
    </AppButton>
    <AppButton
      data-testid="action-workspace-submit"
      class="action-workspace-form-actions__complete"
      :variant="saveState === 'saved' ? 'primary' : 'secondary'"
      :disabled="!canSubmit || lifecycle === 'submitting' || transitioning || saveState === 'saving'"
      :loading="lifecycle === 'submitting' || transitioning"
      block
      @tap="$emit('submit')"
    >
      {{ lifecycle === 'submitting' ? '提交中…' : submitLabel }}
    </AppButton>
    </view>
  </view>
</template>

<script setup lang="ts">
import AppButton from './AppButton.vue'
import AppIcon from './AppIcon.vue'
import type { AppActionLifecycle } from './types'

withDefaults(
  defineProps<{
    readonly lifecycle: AppActionLifecycle
    readonly saveState: 'not_saved' | 'saving' | 'saved' | 'failed'
    readonly canSubmit: boolean
    /** Runtime Action execution gate, NOT form field readOnly. A DEV Mock
     * localPreviewOnly route is editable for local UI feedback but must NEVER
     * dispatch a single-FormData command for a real R1 forms/repeat node. */
    readonly canSave?: boolean
    readonly transitioning?: boolean
    readonly submitLabel?: string
    readonly hint?: string
  }>(),
  {
    transitioning: false,
    canSave: true,
    submitLabel: '完成',
  },
)

defineEmits<{
  (event: 'save'): void
  (event: 'submit'): void
}>()
</script>

<style>
@import "@brand-ui/form-actions.scss";
</style>
