<template>
  <AppMultiChoiceGroup v-if="control === 'multi-choice'" :options="field.options"
    :model-value="listValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
  <AppCascadeSelector leaf-layout-for-deep-trees v-else-if="control === 'cascade-inline'" :options="field.options"
    :model-value="listValue" :disabled="disabled"
    :hierarchical="field.options.some(option => Boolean(option.children?.length))"
    @update:model-value="emit('update:modelValue', $event)" />
  <AppChoiceGroup v-else-if="control === 'single-choice' || control === 'binary'"
    :options="control === 'binary' ? switchOptions : field.options"
    :model-value="scalarValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
  <AppRatingField v-else-if="control === 'rating'" :label="field.label"
    :model-value="typeof modelValue === 'number' ? modelValue : undefined" :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)" />
  <AppDateTimeField v-else-if="control === 'date' || control === 'time' || control === 'datetime'"
    :mode="control" :model-value="scalarValue" :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)" />
  <AppTextarea v-else-if="control === 'textarea'" :model-value="scalarValue"
    :maxlength="4000" :disabled="disabled" placeholder="请填写现场信息"
    @update:model-value="emit('update:modelValue', $event)" />
  <AppInput v-else :model-value="scalarValue" :disabled="disabled" placeholder="请填写信息"
    @update:model-value="emit('update:modelValue', $event)" />
  <AppButton v-if="!field.required && scalarValue && (control === 'rating' || control === 'date' || control === 'time' || control === 'datetime')"
    variant="text" size="compact" :disabled="disabled" @tap="emit('update:modelValue', '')">清空</AppButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { R1LocalField, R1LocalFieldValue } from './r1-local-form-fields'
import { fieldControlFor } from './field-control-registry'
import AppInput from '@shared/ui/AppInput.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppMultiChoiceGroup from '@shared/ui/AppMultiChoiceGroup.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppDateTimeField from '@shared/ui/AppDateTimeField.vue'
import AppRatingField from '@shared/ui/AppRatingField.vue'
import AppButton from '@shared/ui/AppButton.vue'

/** Local and transaction editors share controls; the host retains validation,
 * identity, draft persistence and command ownership. No transport here. */
const props = defineProps<{ readonly field: R1LocalField; readonly modelValue?: R1LocalFieldValue;
  readonly disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: R1LocalFieldValue): void }>()
const control = computed(() => fieldControlFor(props.field, 'standard'))
const listValue = computed(() => Array.isArray(props.modelValue) ? props.modelValue as readonly string[] : [])
const scalarValue = computed(() => props.modelValue === undefined || Array.isArray(props.modelValue) ? '' : String(props.modelValue))
const switchOptions = [{ value: '1', label: '是' }, { value: '0', label: '否' }] as const
</script>
