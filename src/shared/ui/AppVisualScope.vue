<template>
  <!-- Presentation-only opt-in. No workflow, no default retheme. -->
  <view class="app-visual-scope" :class="{ 'app-visual-scope--craft': mode === 'craft' }">
    <slot />
  </view>
</template>
<script setup lang="ts">
withDefaults(defineProps<{
  /** Standard preserves current App UI; Craft is a DS-07 review candidate. */
  readonly mode?: 'standard' | 'craft'
}>(), { mode: 'standard' })
</script>
