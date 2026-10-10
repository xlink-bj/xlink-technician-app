<template>
  <view class="action-workspace-form-actions" data-testid="action-workspace-form-actions">
    <AppButton
      data-testid="dynamic-form-save"
      class="action-workspace-form-actions__save"
      variant="secondary"
      :disabled="saveState === 'saved' || lifecycle === 'submitting' || transitioning || saveState === 'saving'"
      :loading="saveState === 'saving'"
      block
      @tap="$emit('save')"
    >
      {{ saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '保存表单' }}
    </AppButton>
    <AppButton
      data-testid="action-workspace-submit"
      class="action-workspace-form-actions__complete"
      :disabled="!canSubmit || lifecycle === 'submitting' || transitioning || saveState === 'saving'"
      :loading="lifecycle === 'submitting' || transitioning"
      block
      @tap="$emit('submit')"
    >
      {{ lifecycle === 'submitting' ? '提交中…' : submitLabel }}
    </AppButton>
  </view>
</template>

<script setup lang="ts">
import AppButton from './AppButton.vue'
import type { AppActionLifecycle } from './types'

withDefaults(
  defineProps<{
    readonly lifecycle: AppActionLifecycle
    readonly saveState: 'not_saved' | 'saving' | 'saved' | 'failed'
    readonly canSubmit: boolean
    readonly transitioning?: boolean
    readonly submitLabel?: string
  }>(),
  {
    transitioning: false,
    submitLabel: '完成',
  },
)

defineEmits<{
  (event: 'save'): void
  (event: 'submit'): void
}>()
</script>

<style>
.action-workspace-form-actions {
  display: flex;
  gap: var(--app-action-bar-gap);
  width: 100%;
}

.action-workspace-form-actions > .app-button {
  flex: 1 1 0;
  min-width: 0;
}
</style>
