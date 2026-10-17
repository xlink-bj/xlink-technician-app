<template>
  <view class="app-action-content-heading" :class="{ 'app-action-content-heading--survey': variant === 'survey' }">
    <view class="app-action-content-heading__row">
      <view v-if="variant !== 'survey'" class="app-action-content-heading__icon" aria-hidden="true">
        <AppIcon :name="icon" :size="20" />
      </view>
      <text class="app-action-content-heading__title">{{ title }}</text>
    </view>
    <text class="app-action-content-heading__caption">{{ caption }}</text>
    <text v-if="variant === 'survey' && requiredNote" class="app-action-content-heading__required">* 必填</text>
  </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { AppIconName } from './icons'
withDefaults(defineProps<{ title: string; caption: string; icon: AppIconName; variant?: 'default' | 'survey'; requiredNote?: boolean }>(), {
  variant: 'default', requiredNote: false,
})
</script>
<style>
/* Display-only reuse; scheduling, dynamic form and workflow ownership stay in their callers. */
.app-action-content-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.app-action-content-heading__row { align-items: center; display: flex; }
.app-action-content-heading__icon {
  align-items: center; background: var(--app-color-primary-soft); border-radius: 10rpx;
  color: var(--app-color-primary); display: flex; height: 42rpx;
  justify-content: center; margin-right: var(--app-space-sm); width: 42rpx;
}
.app-action-content-heading__title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.app-action-content-heading__caption { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }
.app-action-content-heading--survey {
  border-bottom: 0; padding: 0 2rpx 13rpx; display: flex;
  flex-wrap: wrap; align-items: flex-end; column-gap: 12rpx;
}
.app-action-content-heading--survey .app-action-content-heading__row { flex: 1 1 100%; gap: 0; }
.app-action-content-heading--survey .app-action-content-heading__title { font-size: 38rpx; line-height: 1.35; font-weight: 800; }
.app-action-content-heading--survey .app-action-content-heading__caption { flex: 1; margin-top: 6rpx; font-size: var(--app-font-body); }
.app-action-content-heading__required { display: none; }
.app-action-content-heading--survey .app-action-content-heading__required {
  display: block; font-size: 21rpx; color: #e47736; font-weight: 650; padding-bottom: 2rpx;
}
</style>
