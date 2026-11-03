<template>
  <!-- Presentation-only: status, requiredness and selection are caller-owned.
       This heading never reads a FormDef, business Store or Workflow. -->
  <view  :data-testid="testId" class="app-task-heading" :class="`app-task-heading--${tone}`">
    <view class="app-task-heading__icon" aria-hidden="true">
      <AppIcon :name="icon" :size="21" color="#fff" />
    </view>
    <text class="app-task-heading__title">{{ title }}</text>
    <text v-if="required" class="app-task-heading__required">*</text>
    <text class="app-task-heading__status" :class="{ 'app-task-heading__status--selected': selected }">
      {{ status }}
    </text>
  </view>
</template>

<script setup lang="ts">
import AppIcon from '@shared/ui/AppIcon.vue'
import type { AppIconName } from '@shared/ui/icons'

/** Shared task heading: these tones describe a *control family*, never a form
 * purpose. Caller supplies both the status and test identity. The same visual
 * primitive can represent a Survey, inspection, or acceptance field. */

withDefaults(defineProps<{
  readonly icon: AppIconName
  readonly title: string
  readonly status: string
  readonly tone: 'cascade' | 'measure' | 'media' | 'choice'
  readonly required?: boolean
  readonly selected?: boolean
  readonly testId?: string
}>(), { required: false, selected: false, testId: 'app-task-section-heading' })
</script>

<style scoped>
.app-task-heading {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding-bottom: 14rpx;
  margin-bottom: 12rpx;
  border-bottom: 1rpx solid var(--app-color-divider);
}
.app-task-heading__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 42rpx;
  height: 42rpx;
  border-radius: 10rpx;
  background: #3989f4;
}
.app-task-heading--measure .app-task-heading__icon { background: #438cf5; }
.app-task-heading--media .app-task-heading__icon { background: #22ba84; }
.app-task-heading--choice .app-task-heading__icon { background: #9a65ec; }
.app-task-heading__title {
  flex: 1;
  min-width: 0;
  color: var(--app-color-text-primary);
  font-size: var(--app-font-section-title);
  font-weight: 800;
}
.app-task-heading__required {
  margin-left: -9rpx;
  color: #e47736;
  font-size: 26rpx;
  font-weight: 750;
}
.app-task-heading__status {
  flex: none;
  background: var(--app-color-control-surface);
  border-radius: 999rpx;
  color: var(--app-color-text-secondary);
  font-size: 21rpx;
  padding: 5rpx 11rpx;
  font-weight: 600;
  white-space: nowrap;
}
.app-task-heading--choice .app-task-heading__status { font-weight: 400; }
.app-task-heading__status--selected {
  background: var(--app-color-success-soft);
  color: var(--app-color-success);
}
</style>
