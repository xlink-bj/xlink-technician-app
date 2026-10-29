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
    <view v-if="accent" class="app-record-card__accent" aria-hidden="true" />
    <slot />
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  readonly layout?: 'vertical' | 'horizontal'
  readonly tone?: 'neutral' | 'blue' | 'red' | 'orange' | 'purple' | 'green' | 'gray'
  readonly interactive?: boolean
  /** Optional decorative accent, driven by the shared tone palette. */
  readonly accent?: boolean
}>(), { layout: 'vertical', tone: 'neutral', interactive: false, accent: false })
</script>
