<template>
  <view v-if="mode === 'datetime'" class="app-date-time-field app-date-time-field--datetime" :data-testid="testId">
    <picker class="app-date-time-field__picker" mode="date" :value="draftDate" :disabled="disabled" @change="chooseDate">
      <view class="app-date-time-field__value" :class="{ 'app-date-time-field__value--empty': !draftDate, 'app-date-time-field__value--disabled': disabled }">
        <text>{{ draftDate || '请选择日期' }}</text>
        <text class="app-date-time-field__arrow" aria-hidden="true">›</text>
      </view>
    </picker>
    <picker class="app-date-time-field__picker" mode="time" :value="draftTime" :disabled="disabled" @change="chooseTime">
      <view class="app-date-time-field__value" :class="{ 'app-date-time-field__value--empty': !draftTime, 'app-date-time-field__value--disabled': disabled }">
        <text>{{ draftTime || '请选择时间' }}</text>
        <text class="app-date-time-field__arrow" aria-hidden="true">›</text>
      </view>
    </picker>
  </view>
  <picker v-else class="app-date-time-field" :mode="mode === 'date' ? 'date' : 'time'" :value="modelValue" :disabled="disabled" :data-testid="testId" @change="handleChange">
    <view class="app-date-time-field__value" :class="{ 'app-date-time-field__value--empty': !modelValue, 'app-date-time-field__value--disabled': disabled }">
      <text>{{ modelValue || (mode === 'date' ? '请选择日期' : '请选择时间') }}</text>
      <text class="app-date-time-field__arrow" aria-hidden="true">›</text>
    </view>
  </picker>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { dateTimeParts, dateTimeWire } from './date-time-wire'

/**
 * One native field renderer for date/time/datetime on MP/App/H5.
 * R1 date: YYYY-MM-DD; time: HH:mm; datetime: YYYY-MM-DD HH:mm:ss
 * (local wall clock, NOT UTC). The host owns FormData, draft and Workflow.
 *
 * Important: a half-filled datetime is NOT committed to business values.
 * The second picker emits the complete, source-shaped value once both parts
 * are selected. R1 timezone authority is intentionally not reinvented.
 */
const props = withDefaults(defineProps<{
  readonly mode: 'date' | 'time' | 'datetime'
  readonly modelValue?: string
  readonly disabled?: boolean
  readonly testId?: string
}>(), { modelValue: '', disabled: false, testId: 'app-date-time-field' })
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const draftDate = ref('')
const draftTime = ref('')
watch(() => props.modelValue, value => {
  const parts = dateTimeParts(value)
  draftDate.value = parts.date
  draftTime.value = parts.time
}, { immediate: true })

function pickerValue(event: unknown): string | undefined {
  if (typeof event !== 'object' || event === null) return undefined
  const detail = (event as { detail?: { value?: unknown } }).detail
  return typeof detail?.value === 'string' ? detail.value : undefined
}
function handleChange(event: unknown): void {
  if (props.disabled) return
  const value = pickerValue(event)
  if (value !== undefined) emit('update:modelValue', value)
}
function commitDateTime(): void {
  const wire = dateTimeWire(draftDate.value, draftTime.value, props.modelValue)
  if (wire) emit('update:modelValue', wire)
}
function chooseDate(event: unknown): void {
  if (props.disabled) return
  const next = pickerValue(event)
  if (!next) return
  draftDate.value = next
  commitDateTime()
}
function chooseTime(event: unknown): void {
  if (props.disabled) return
  const next = pickerValue(event)
  if (!next) return
  draftTime.value = next
  commitDateTime()
}
</script>

<style>
.app-date-time-field { width: 100%; }
.app-date-time-field--datetime { display: flex; align-items: stretch; gap: 10px; }
.app-date-time-field__picker { flex: 1; min-width: 0; }
.app-date-time-field__value {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 48px; padding: 0 14px;
  border: 1px solid var(--app-color-border); border-radius: 10px;
  font-size: var(--app-font-body); color: var(--app-color-text-primary);
}
.app-date-time-field__value--empty { color: var(--app-color-text-secondary); }
.app-date-time-field__value--disabled { opacity: 0.55; }
.app-date-time-field__arrow { margin-left: 8px; font-size: 22px; color: var(--app-color-text-secondary); }
</style>
