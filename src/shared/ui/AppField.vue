<template>
  <view class="app-field" :class="{ 'app-field--error': Boolean(error) }">
    <text v-if="!hideLabel" class="app-field__label">
      {{ label }}<text v-if="required" class="app-field__required"> *</text><text v-else-if="showOptional" class="app-field__optional">（选填）</text>
    </text>
    <slot />
    <text v-if="supporting" class="app-field__supporting">{{ supporting }}</text>
    <text v-if="error" class="app-field__error" aria-live="polite">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  readonly label: string
  readonly hideLabel?: boolean
  readonly required?: boolean
  readonly optional?: boolean
  readonly supporting?: string
  readonly error?: string
}>()

const showOptional = computed(() => Boolean(props.optional) && !props.required)
</script>
