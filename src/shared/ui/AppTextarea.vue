<template>
  <textarea
    class="app-textarea"
    :class="{
      'app-textarea--disabled': disabled,
      'app-textarea--readonly': readOnly,
      'app-textarea--focused': focused,
      'app-textarea--error': error,
    }"
    :value="modelValue"
    :placeholder="placeholder"
    :placeholder-class="placeholderClass"
    :placeholder-style="placeholderStyle"
    :disabled="nativeDisabled"
    :maxlength="maxlength"
    :auto-height="autoHeight"
    :aria-invalid="error"
    @input="handleInput"
    @focus="handleFocus"
    @blur="handleBlur"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    readonly modelValue?: string
    readonly placeholder?: string
    readonly placeholderClass?: string
    readonly placeholderStyle?: string
    readonly disabled?: boolean
    readonly readOnly?: boolean
    readonly error?: boolean
    readonly maxlength?: number
    readonly autoHeight?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: '',
    placeholderClass: 'app-textarea__placeholder',
    disabled: false,
    readOnly: false,
    error: false,
    autoHeight: true,
  },
)

const focused = ref(false)
const nativeDisabled = computed(() => props.disabled || props.readOnly)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

function handleFocus(): void {
  focused.value = true
}

function handleBlur(): void {
  focused.value = false
}

function handleInput(event: unknown): void {
  const input = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
  const detail = typeof input.detail === 'object' && input.detail !== null
    ? input.detail as Record<string, unknown>
    : {}
  emit('update:modelValue', typeof detail.value === 'string' ? detail.value : '')
}
</script>
