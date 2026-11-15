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
<style scoped lang="scss">
@import "@brand-ui/task-focus.scss";
</style>
