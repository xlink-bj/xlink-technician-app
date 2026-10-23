<template>
  <!-- Decorative record identifier, no business / Workflow semantics. -->
  <view class="app-record-mark" aria-hidden="true">
    <AppIcon :name="icon" :size="size" :color="color" />
  </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { AppIconName } from './icons'
withDefaults(defineProps<{
  readonly icon: AppIconName
  /** Leave caller-sourced icon color intact during the compatibility migration. */
  readonly color?: string
  readonly size?: number
}>(), { size: 19, color: 'var(--app-record-mark-ink)' })
</script>
