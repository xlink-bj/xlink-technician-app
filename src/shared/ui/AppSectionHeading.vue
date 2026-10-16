<template>
  <view class="app-section-heading">
    <view class="app-section-heading__copy">
      <text class="app-section-heading__title">{{ title }}</text>
      <text v-if="subtitle" class="app-section-heading__subtitle">{{ subtitle }}</text>
    </view>
    <view v-if="$slots.trailing" class="app-section-heading__trailing">
      <slot name="trailing" />
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  readonly title: string
  readonly subtitle?: string
}>(), { subtitle: '' })
</script>
