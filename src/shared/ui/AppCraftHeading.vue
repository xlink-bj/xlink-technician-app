<template>
  <!-- Shared presentation only: order/quotation/signing screen identity is caller-owned. -->
  <view class="xl-craft-heading">
    <text v-if="eyebrow" class="xl-craft__eyebrow">{{ eyebrow }}</text>
    <text class="xl-craft__title"><slot name="title">{{ title }}</slot></text>
    <text v-if="subtitle" class="xl-craft__subtitle">{{ subtitle }}</text>
  </view>
</template>
<script setup lang="ts">
withDefaults(defineProps<{
  readonly eyebrow?: string
  readonly title: string
  readonly subtitle?: string
}>(), { eyebrow: '', subtitle: '' })
</script>
<style scoped>
.xl-craft-heading { display: flex; flex-direction: column; align-items: stretch; gap: 0; }
.xl-craft-heading .xl-craft__title { margin: 1px 0 7px; }
</style>
