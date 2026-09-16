<template>
  <textarea
    class="app-textarea"
    :class="{
      'app-textarea--disabled': disabled,
      'app-textarea--readonly': readOnly,
      'app-textarea--error': error,
    }"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readOnly"
    :maxlength="maxlength"
    :aria-invalid="error"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    readonly modelValue?: string
    readonly placeholder?: string
    readonly disabled?: boolean
    readonly readOnly?: boolean
    readonly error?: boolean
    readonly maxlength?: number
  }>(),
  {
    modelValue: '',
    placeholder: '',
    disabled: false,
    readOnly: false,
    error: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

function handleInput(event: unknown): void {
  const input = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
  const detail = typeof input.detail === 'object' && input.detail !== null
    ? input.detail as Record<string, unknown>
    : {}
  emit('update:modelValue', typeof detail.value === 'string' ? detail.value : '')
}
</script>
