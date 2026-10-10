<template>
  <view class="app-tree-choice-group">
    <view v-for="group in options" :key="group.value" class="app-tree-choice-group__section">
      <text class="app-tree-choice-group__label">{{ group.label }}</text>
      <view class="app-tree-choice-group__children">
        <button
          v-for="option in group.children"
          :key="option.value"
          class="app-choice app-choice--multi app-tree-choice-group__option"
          :class="{ 'app-choice--selected': selectedValues.has(option.value), 'app-choice--disabled': disabled }"
          :disabled="disabled"
          :aria-pressed="selectedValues.has(option.value)"
          @tap="toggle(option.value)"
        >
          <text class="app-choice__indicator" aria-hidden="true">{{ selectedValues.has(option.value) ? '✓' : '' }}</text>
          {{ option.label }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface TreeOption {
  readonly value: string
  readonly label: string
  readonly children: readonly { readonly value: string; readonly label: string }[]
}

const props = withDefaults(defineProps<{
  readonly options: readonly TreeOption[]
  readonly modelValue: readonly string[]
  readonly disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  (event: 'update:modelValue', value: readonly string[]): void
}>()

const selectedValues = computed(() => new Set(props.modelValue.map(String)))

function toggle(value: string): void {
  if (props.disabled) return
  const next = new Set(selectedValues.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  const ordered = props.options.flatMap((group) => group.children.map((child) => child.value))
  emit('update:modelValue', ordered.filter((candidate) => next.has(candidate)))
}
</script>

<style>
.app-tree-choice-group__section { margin-top: var(--app-space-md); }
.app-tree-choice-group__label { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); font-weight: 700; margin-bottom: var(--app-space-xs); }
.app-tree-choice-group__children { display: flex; flex-direction: column; gap: var(--app-control-gap); }
.app-tree-choice-group__option { text-align: left; }
</style>
