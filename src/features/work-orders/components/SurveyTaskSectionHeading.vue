<template>
  <!-- Survey presentation only. Business field requirements and selection state are caller-owned. -->
  <view data-testid="survey-task-section-heading" class="survey-task-heading" :class="`survey-task-heading--${tone}`">
    <view class="survey-task-heading__icon" aria-hidden="true">
      <AppIcon :name="icon" :size="21" color="#fff" />
    </view>
    <text class="survey-task-heading__title">{{ title }}</text>
    <text v-if="required" class="survey-task-heading__required">*</text>
    <text class="survey-task-heading__status" :class="{ 'survey-task-heading__status--selected': selected }">
      {{ status }}
    </text>
  </view>
</template>

<script setup lang="ts">
import AppIcon from '@shared/ui/AppIcon.vue'
import type { AppIconName } from '@shared/ui/icons'

withDefaults(defineProps<{
  readonly icon: AppIconName
  readonly title: string
  readonly status: string
  readonly tone: 'part' | 'measure' | 'media' | 'cause'
  readonly required?: boolean
  readonly selected?: boolean
}>(), { required: false, selected: false })
</script>

<style scoped>
.survey-task-heading {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding-bottom: 14rpx;
  margin-bottom: 12rpx;
  border-bottom: 1rpx solid var(--app-color-divider);
}
.survey-task-heading__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 42rpx;
  height: 42rpx;
  border-radius: 10rpx;
  background: #3989f4;
}
.survey-task-heading--measure .survey-task-heading__icon { background: #438cf5; }
.survey-task-heading--media .survey-task-heading__icon { background: #22ba84; }
.survey-task-heading--cause .survey-task-heading__icon { background: #9a65ec; }
.survey-task-heading__title {
  flex: 1;
  min-width: 0;
  color: var(--app-color-text-primary);
  font-size: var(--app-font-section-title);
  font-weight: 800;
}
.survey-task-heading__required {
  margin-left: -9rpx;
  color: #e47736;
  font-size: 26rpx;
  font-weight: 750;
}
.survey-task-heading__status {
  flex: none;
  background: var(--app-color-control-surface);
  border-radius: 999rpx;
  color: var(--app-color-text-secondary);
  font-size: 21rpx;
  padding: 5rpx 11rpx;
  font-weight: 600;
  white-space: nowrap;
}
.survey-task-heading--cause .survey-task-heading__status { font-weight: 400; }
.survey-task-heading__status--selected {
  background: var(--app-color-success-soft);
  color: var(--app-color-success);
}
</style>
