<template>
  <AppCascadeSheetField
    :options="options"
    :model-value="modelValue"
    :disabled="disabled"
    title="选择维修部位"
    placeholder="请选择维修部位"
    close-label="关闭维修部位选择"
    test-id-prefix="survey-part-picker"
    option-test-id-prefix="survey-repair-part"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
<script setup lang="ts">
import AppCascadeSheetField from '@shared/ui/AppCascadeSheetField.vue'
/** Compatibility-only alias retained for historical manifest pointers.
 * Do not add behavior here. Active forms use the shared field renderer. */
interface Option {
  readonly value: string
  readonly label: string
  readonly children?: readonly Option[]
}
withDefaults(defineProps<{
  readonly options: readonly Option[]
  readonly modelValue: readonly string[]
  readonly disabled?: boolean
}>(), { disabled: false })
defineEmits<{ (event: 'update:modelValue', value: readonly string[]): void }>()
</script>
