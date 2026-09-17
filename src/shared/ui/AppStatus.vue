<template>
  <view
    v-if="message"
    class="app-status"
    :class="[
      `app-status--${tone}`,
      `app-status--${variant}`,
      { 'app-status--quiet': quiet },
    ]"
    role="status"
    aria-live="polite"
  >
    <AppIcon v-if="icon" class="app-status__icon" :name="icon" :size="16" :color="iconColor" aria-hidden="true" />
    <text class="app-status__message">{{ message }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from './AppIcon.vue'
import type { AppIconName } from './icons'

const props = withDefaults(
  defineProps<{
    readonly message?: string
    readonly tone?: 'neutral' | 'success' | 'warning' | 'danger'
    readonly quiet?: boolean
    readonly variant?: 'text' | 'strip'
    readonly icon?: AppIconName
  }>(),
  {
    message: '',
    tone: 'neutral',
    quiet: false,
    variant: 'text',
  },
)

const iconColor = computed(() => {
  switch (props.tone) {
    case 'success':
      return 'var(--app-color-success)'
    case 'warning':
      return 'var(--app-color-warning)'
    case 'danger':
      return 'var(--app-color-danger)'
    default:
      return 'var(--app-color-text-secondary)'
  }
})
</script>
