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

<style scoped>
.app-choice-group {
  flex-wrap: wrap;
}

.app-choice {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  max-width: 100%;
  height: auto;
  min-height: 44px;
  min-height: max(44px, var(--app-control-height));
  line-height: 1.35;
  padding: var(--app-space-sm) var(--app-control-padding-x);
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
