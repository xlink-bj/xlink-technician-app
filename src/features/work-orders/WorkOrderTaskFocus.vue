<template>
  <!-- DS-06 one-point proof: visual rendering only. The existing detail page
       owns Workflow eligibility, source title and action routing. -->
  <view class="current-task-card task-focus-panel" :class="`task-focus-panel--${tone}`"
    data-testid="task-focus-panel">
    <view class="task-focus-panel__copy">
      <view class="task-focus-panel__heading">
        <text class="task-focus-panel__title" data-testid="task-focus-title">{{ title }}</text>
        <text class="task-focus-panel__eyebrow">当前任务</text>
      </view>
      <text v-if="disabled && note" class="task-focus-panel__note"
        data-testid="task-focus-disabled-note">{{ note }}</text>
    </view>
    <view class="task-focus-panel__actions">
      <button class="primary-task-action task-focus-panel__action" type="button"
        :class="{ 'task-focus-panel__action--disabled': disabled }"
        :disabled="disabled" :aria-disabled="disabled"
        :aria-label="actionLabel"
        :hover-class="disabled ? 'none' : 'task-focus-panel__action--pressed'"
        :hover-start-time="0" :hover-stay-time="70"
        data-testid="task-focus-action" @tap="activate">
        <text class="task-focus-panel__action-label">{{ actionLabel }}</text>
        <text class="task-focus-panel__chevron" aria-hidden="true">›</text>
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
const props = withDefaults(defineProps<{
  readonly title: string
  readonly actionLabel: string
  readonly tone?: 'blue' | 'red' | 'orange' | 'purple' | 'green' | 'gray'
  readonly disabled: boolean
  readonly note?: string
}>(), { tone: 'blue', note: '' })
const emit = defineEmits<{ (event: 'action'): void }>()
function activate(): void {
  if (props.disabled) return
  emit('action')
}
</script>
<style scoped>
/* One flexible information/action stack; eligibility and labels stay page-owned. */
.task-focus-panel.current-task-card {
  /* Match the existing detail customer-card content inset. */
  --task-focus-content-inset: 28rpx;
  box-sizing: border-box; display: flex; flex-direction: column;
  width: 100%; min-width: 0; margin-top: 13px;
  border: 1px solid var(--app-outline-subtle);
  border-radius: var(--app-shape-control);
  background: var(--app-surface-raised); color: var(--app-text-strong);
}
.task-focus-panel__copy { min-width: 0; padding: 10px var(--task-focus-content-inset); }
.task-focus-panel__heading { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.task-focus-panel__eyebrow {
  display: block; flex: 0 1 auto; max-width: 100%; margin-left: auto;
  color: var(--app-content-muted-ink); text-align: right; overflow-wrap: anywhere;
  font-size: var(--app-content-meta-size); line-height: 1.4; font-weight: 500;
}
.task-focus-panel__title {
  display: block; flex: 1 1 auto; min-width: 0; max-width: 100%; overflow-wrap: anywhere;
  font-size: var(--app-journey-title-size); line-height: 1.35; font-weight: 700;
}
.task-focus-panel__note {
  display: block; margin-top: 6px; overflow-wrap: anywhere;
  color: var(--app-content-muted-ink); font-size: var(--app-content-meta-size); line-height: 1.5;
}
.task-focus-panel__actions {
  display: flex; flex-wrap: wrap; gap: 8px; padding: 8px var(--task-focus-content-inset);
  border-top: 1px solid var(--app-color-divider);
}
.task-focus-panel .primary-task-action.task-focus-panel__action {
  box-sizing: border-box; flex: 1 1 160px; min-width: 0; max-width: 100%;
  width: auto; min-height: var(--app-button-height-large); height: auto;
  padding: 10px 16px; margin: 0; display: flex; gap: 8px;
  align-items: center; justify-content: center;
  border: 0; border-radius: var(--app-radius-control);
  color: var(--app-color-surface); background: var(--app-craft-action);
  font-family: inherit; font-size: 15px; font-weight: 650; line-height: 1.4;
  text-align: center; white-space: normal;
  transition: background-color .15s ease, transform .15s ease;
}
.task-focus-panel .primary-task-action.task-focus-panel__action::after { border: 0; }
.task-focus-panel .primary-task-action.task-focus-panel__action--pressed {
  background: var(--app-craft-action-pressed); transform: translateY(1px);
}
.task-focus-panel .primary-task-action.task-focus-panel__action--disabled {
  background: var(--app-button-disabled-bg); color: var(--app-button-disabled-text); opacity: 1;
}
.task-focus-panel__action-label { display: block; min-width: 0; overflow-wrap: anywhere; color: inherit; line-height: 1.4; }
.task-focus-panel__chevron { flex: 0 0 auto; font-size: 18px; font-weight: 400; line-height: 1; color: inherit; }
@media (prefers-reduced-motion: reduce) {
  .task-focus-panel .primary-task-action.task-focus-panel__action { transition: none; }
}
</style>
