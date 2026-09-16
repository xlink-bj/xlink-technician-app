<template>
  <view class="app-field" :class="{ 'app-field--error': Boolean(error) }">
    <text class="app-field__label">
      {{ label }}<text v-if="required" class="app-field__required"> *</text><text v-else-if="optional" class="app-field__optional">（选填）</text>
    </text>
    <slot />
    <text v-if="supporting" class="app-field__supporting">{{ supporting }}</text>
    <text v-if="error" class="app-field__error" aria-live="polite">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  readonly label: string
  readonly required?: boolean
  readonly optional?: boolean
  readonly supporting?: string
  readonly error?: string
}>()
</script>
