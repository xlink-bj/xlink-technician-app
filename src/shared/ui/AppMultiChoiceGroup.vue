<template>
  <view class="app-choice-group app-choice-group--multi">
    <button
      v-for="option in options"
      :key="option.value"
      class="app-choice app-choice--multi"
      :class="{
        'app-choice--selected': selectedValues.has(option.value),
        'app-choice--disabled': disabled || option.disabled,
      }"
      :disabled="disabled || option.disabled"
      :aria-pressed="selectedValues.has(option.value)"
      @tap="toggle(option)"
    >
      <text class="app-choice__indicator" aria-hidden="true">{{ selectedValues.has(option.value) ? '✓' : '' }}</text>
      {{ option.label }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppChoiceOption } from './types'

const props = withDefaults(
  defineProps<{
    readonly options: readonly AppChoiceOption[]
    readonly modelValue: readonly string[]
    readonly disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: readonly string[]): void
}>()

const selectedValues = computed(() => new Set(props.modelValue.map(String)))

function toggle(option: AppChoiceOption): void {
  if (props.disabled || option.disabled) return
  const next = new Set(selectedValues.value)
  if (next.has(option.value)) next.delete(option.value)
  else next.add(option.value)
  emit('update:modelValue', props.options.map((item) => item.value).filter((value) => next.has(value)))
}
</script>
