<template>
  <view class="app-choice-group app-choice-group--multi app-cascade-selector">
    <button
      v-for="option in leafOptions"
      :key="option.valuePath.join('/')"
      class="app-choice app-choice--multi"
      :class="{ 'app-choice--selected': isSelected(option.valuePath), 'app-choice--disabled': disabled }"
      :disabled="disabled"
      :aria-pressed="isSelected(option.valuePath)"
      @tap="select(option.valuePath)"
    >
      {{ option.labelPath.join(' / ') }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface CascadeOption {
  readonly value: string
  readonly label: string
  readonly children?: readonly CascadeOption[]
}

interface LeafOption {
  readonly valuePath: readonly string[]
  readonly labelPath: readonly string[]
}

const props = withDefaults(
  defineProps<{
    readonly options: readonly CascadeOption[]
    readonly modelValue: readonly string[]
    readonly disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: readonly string[]): void
}>()

const leafOptions = computed<readonly LeafOption[]>(() => {
  const output: LeafOption[] = []
  const visit = (
    options: readonly CascadeOption[],
    valuePath: readonly string[],
    labelPath: readonly string[],
  ): void => {
    options.forEach((option) => {
      const nextValues = [...valuePath, option.value]
      const nextLabels = [...labelPath, option.label]
      if (option.children?.length) visit(option.children, nextValues, nextLabels)
      else output.push({ valuePath: nextValues, labelPath: nextLabels })
    })
  }
  visit(props.options, [], [])
  return output
})

function isSelected(valuePath: readonly string[]): boolean {
  return valuePath.length === props.modelValue.length
    && valuePath.every((value, index) => String(props.modelValue[index]) === value)
}

function select(valuePath: readonly string[]): void {
  if (!props.disabled) emit('update:modelValue', valuePath)
}
</script>
