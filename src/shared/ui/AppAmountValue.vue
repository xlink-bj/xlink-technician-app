<template>
  <!-- Display only. The caller provides its already-authorized, already-formatted
       amount or truthful fallback; no pricing, currency or status inference. -->
  <text
    class="app-amount-value"
    :class="[`app-amount-value--${size}`, `app-amount-value--${tone}`]"
  >{{ value }}</text>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  readonly value: string
  readonly size?: 'compact' | 'regular' | 'prominent'
  readonly tone?: 'strong' | 'primary' | 'muted'
}>(), { size: 'regular', tone: 'strong' })
</script>
