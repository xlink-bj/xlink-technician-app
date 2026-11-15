<template>
  <!-- Generic, presentation-only work-order feedback pattern.
       The page owns all load states and decides whether an action is offered. -->
  <view
    class="app-feedback-state"
    :class="[
      `app-feedback-state--${layout}`,
      `app-feedback-state--${appearance}`,
    ]"
    :role="appearance === 'search-empty' || appearance === 'blocked' ? 'status' : 'alert'"
    data-testid="app-feedback-state"
  >
    <view v-if="appearance === 'search-empty'" class="app-feedback-state__search-illustration" aria-hidden="true">
      <view class="app-feedback-state__search-ring" />
      <view class="app-feedback-state__search-handle" />
    </view>
    <view v-else-if="appearance !== 'blocked'" class="app-feedback-state__icon" aria-hidden="true">!</view>
    <text class="app-feedback-state__title">{{ title }}</text>
    <text class="app-feedback-state__description">{{ description }}</text>
    <button v-if="actionLabel" class="app-feedback-state__action" @tap="emit('action')">{{ actionLabel }}</button>
  </view>
</template>
<script setup lang="ts">
withDefaults(defineProps<{
  readonly layout: 'list' | 'detail'
  readonly appearance?: 'error' | 'retry' | 'search-empty' | 'blocked'
  readonly title: string
  readonly description: string
  readonly actionLabel?: string
}>(), { appearance: 'error', actionLabel: '' })
const emit = defineEmits<{ (event: 'action'): void }>()
</script>
<style scoped lang="scss">
@import "@brand-ui/work-order-feedback.scss";
</style>