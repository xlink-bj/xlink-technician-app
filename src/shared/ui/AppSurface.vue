<template>
  <view class="app-surface" :class="{ 'app-surface--compact': compact }">
    <slot />
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    readonly compact?: boolean
  }>(),
  { compact: false },
)
</script>
