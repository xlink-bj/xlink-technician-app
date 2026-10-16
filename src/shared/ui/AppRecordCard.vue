<template>
  <!-- A semantic presentation-only card. The caller owns navigation, content,
       identity, statuses and all workflow/permission decisions. -->
  <view
    class="app-record-card"
    :class="[
      `app-record-card--${layout}`,
      `app-record-card--tone-${tone}`,
      { 'app-record-card--interactive': interactive },
    ]"
  >
    <slot />
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  readonly layout?: 'vertical' | 'horizontal'
  readonly tone?: 'neutral' | 'blue' | 'red' | 'orange' | 'purple' | 'green' | 'gray'
  readonly interactive?: boolean
}>(), { layout: 'vertical', tone: 'neutral', interactive: false })
</script>
