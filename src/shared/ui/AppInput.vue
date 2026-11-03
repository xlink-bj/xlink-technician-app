<template>
  <input
    class="app-input"
    :class="{
      'app-input--disabled': disabled,
      'app-input--readonly': readOnly,
      'app-input--focused': focused,
      'app-input--error': error,
    }"
    :value="modelValue"
    :type="inputType"
    :placeholder="placeholder"
    :placeholder-class="placeholderClass"
    :placeholder-style="placeholderStyle"
    :disabled="nativeDisabled"
    :maxlength="maxlength"
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
    /** Native uni-input keyboard hint only. Never coerce its string value:
     * phone/IDNumber must preserve leading zeros; number/digit normalization
     * and safe precision checks belong to the Form Runtime. */
    readonly inputType?: 'text' | 'number' | 'digit'
  }>(),
  {
    modelValue: '',
    placeholder: '',
    placeholderClass: 'app-input__placeholder',
    disabled: false,
    readOnly: false,
    error: false,
    inputType: 'text',
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
