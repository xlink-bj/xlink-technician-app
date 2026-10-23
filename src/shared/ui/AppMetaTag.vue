<template>
  <!-- Service-part, proximity and descriptive metadata are *not* approval
       or Workflow-status indicators; the tone is a visual role only. -->
  <view class="app-meta-tag" :class="`app-meta-tag--${tone}`">
    <text class="app-meta-tag__label">{{ label }}</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  readonly label: string
  readonly tone?: 'neutral' | 'info' | 'success' | 'warning'
}>(), { tone: 'neutral' })
</script>
