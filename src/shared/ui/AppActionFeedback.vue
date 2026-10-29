<template>
  <!-- Strictly presentational: callers provide the *confirmed* business
       lifecycle. It neither infers success nor emits a workflow action. -->
  <view
    class="app-action-feedback"
    :class="`app-action-feedback--${state}`"
    role="status"
    :aria-live="state === 'error' ? 'assertive' : 'polite'"
    :aria-busy="state === 'busy'"
    data-testid="app-action-feedback"
  >
    <view v-if="state === 'busy'" class="app-action-feedback__spinner" aria-hidden="true" />
    <view v-else-if="state === 'success'" class="app-action-feedback__icon" aria-hidden="true">
      <AppIcon name="complete" :size="18" color="#ffffff" />
    </view>
    <view v-else-if="state === 'error'" class="app-action-feedback__icon" aria-hidden="true">
      <AppIcon name="warning" :size="18" color="#ffffff" />
    </view>
    <text class="app-action-feedback__label">{{ label }}</text>
  </view>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{
  readonly state?: 'idle' | 'busy' | 'success' | 'error'
  readonly label: string
}>(), { state: 'idle' })
</script>
