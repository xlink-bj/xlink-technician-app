<template>
  <view class="app-choice-group">
    <button
      v-for="option in options"
      :key="option.value"
      class="app-choice"
      :class="{
        'app-choice--selected': modelValue === option.value,
        'app-choice--disabled': disabled,
      }"
      :disabled="disabled"
      @tap="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </view>
</template>

<script setup lang="ts">
import type { FormOption } from '@runtimes/dynamic-form'

defineProps<{
  readonly options: readonly FormOption[]
  readonly modelValue: string
  readonly disabled?: boolean
}>()

defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>
