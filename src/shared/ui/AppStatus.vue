<template>
  <text v-if="message" class="app-status" :class="[`app-status--${tone}`, { 'app-status--quiet': quiet }]" aria-live="polite">{{ message }}</text>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    readonly message?: string
    readonly tone?: 'neutral' | 'success' | 'warning' | 'danger'
    readonly quiet?: boolean
  }>(),
  {
    message: '',
    tone: 'neutral',
    quiet: false,
  },
)
</script>
