<template>
  <view class="app-choice-group">
    <button
      v-for="option in options"
      :key="option.value"
      class="app-choice"
      :class="{
        'app-choice--selected': modelValue === option.value,
        'app-choice--disabled': disabled || option.disabled,
      }"
      :disabled="disabled || option.disabled"
      :aria-pressed="modelValue === option.value"
      @tap="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </view>
</template>

<script setup lang="ts">
import type { AppChoiceOption } from './types'

defineProps<{
  readonly options: readonly AppChoiceOption[]
  readonly modelValue: string
  readonly disabled?: boolean
}>()

defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>
