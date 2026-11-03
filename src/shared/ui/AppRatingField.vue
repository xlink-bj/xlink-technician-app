<template>
  <view class="app-rating-field" :data-testid="testId" role="group" :aria-label="label">
    <button
      v-for="score in 5"
      :key="score"
      class="app-rating-field__star"
      :class="{ 'app-rating-field__star--active': score <= selected }"
      :disabled="disabled"
      :aria-label="`${score} 星`"
      :aria-pressed="selected === score"
      @tap="choose(score)"
    >★</button>
    <text class="app-rating-field__value">{{ selected ? selected + ' / 5' : '未评分' }}</text>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue'
/**
 * R1 inspectionAppointment.vue uses van-rate with default max=5.
 * Ratings are scalar 1..5, never arbitrary strings or multiselections.
 * This is a field UI only: Runtime validates range and Workflow readonly;
 * no domain Store, provider or persisted value is managed here.
 */
const props = withDefaults(defineProps<{
  readonly modelValue?: string | number | null
  readonly disabled?: boolean
  readonly label?: string
  readonly testId?: string
}>(), { modelValue: null, disabled: false, label: '评分', testId: 'app-rating-field' })
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>()
const selected = computed(() => {
  const n = Number(props.modelValue)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0
})
function choose(score: number): void {
  if (props.disabled || !Number.isInteger(score) || score < 1 || score > 5) return
  emit('update:modelValue', score)
}
</script>
<style>
.app-rating-field { display:flex; align-items:center; gap:4px; min-height:48px; }
.app-rating-field__star { flex:none; margin:0; padding:0; width:40px; height:44px; border:0; background:transparent; color:var(--app-color-text-muted); font-size:30px; line-height:44px; text-align:center; }
.app-rating-field__star--active { color:var(--app-color-primary); }
.app-rating-field__star::after { border:none; }
.app-rating-field__value { margin-left:8px; font-size:var(--app-font-meta); color:var(--app-color-text-secondary); }
</style>
