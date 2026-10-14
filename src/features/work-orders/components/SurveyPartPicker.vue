<template>
  <view class="survey-part-picker" data-testid="survey-part-picker">
    <button
      class="survey-part-picker__trigger"
      data-testid="survey-part-picker-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      @tap="showPicker"
    >
      <view class="survey-part-picker__value">
        <text v-if="selectedLabels.length" class="survey-part-picker__parent">{{ selectedLabels[0] }}</text>
        <text v-if="selectedLabels.length" class="survey-part-picker__selection">{{ selectedLabels.slice(1).join(' / ') || selectedLabels[0] }}</text>
        <text v-else class="survey-part-picker__placeholder">请选择维修部位</text>
      </view>
      <text class="survey-part-picker__arrow" aria-hidden="true">›</text>
    </button>

    <view v-if="open" class="survey-part-picker__backdrop" data-testid="survey-part-picker-backdrop">
      <view class="survey-part-picker__sheet" data-testid="survey-part-picker-panel">
        <view class="survey-part-picker__header">
          <text class="survey-part-picker__title">选择维修部位</text>
          <button class="survey-part-picker__close" aria-label="关闭维修部位选择" @tap="closePicker">×</button>
        </view>
        <view class="survey-part-picker__current" data-testid="survey-part-picker-current">
          <text class="survey-part-picker__meta">当前选择</text>
          <text class="survey-part-picker__current-label">{{ draftLabels.join(' / ') || '尚未选择' }}</text>
        </view>
        <scroll-view scroll-y class="survey-part-picker__options">
          <AppCascadeSelector
            :options="options"
            :model-value="draft"
            :disabled="disabled"
            hierarchical
            @update:model-value="selectDraft"
          />
        </scroll-view>
        <button class="survey-part-picker__confirm"
          data-testid="survey-part-picker-confirm"
          :disabled="disabled || !draft.length"
          @tap="commitPicker">确认选择</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'

interface Option {
  readonly value: string
  readonly label: string
  readonly children?: readonly Option[]
}
const props = withDefaults(defineProps<{
  readonly options: readonly Option[]
  readonly modelValue: readonly string[]
  readonly disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{
  (event: 'update:modelValue', value: readonly string[]): void
}>()
const open = ref(false)
const draft = ref<readonly string[]>([])
function labelsFor(path: readonly string[]): readonly string[] {
  let choices: readonly Option[] = props.options
  const labels: string[] = []
  for (const value of path) {
    const item = choices.find(option => option.value === value)
    if (!item) break
    labels.push(item.label)
    choices = item.children ?? []
  }
  return labels
}
const selectedLabels = computed(() => labelsFor(props.modelValue))
const draftLabels = computed(() => labelsFor(draft.value))
function showPicker(): void {
  if (props.disabled) return
  draft.value = [...props.modelValue]
  open.value = true
}
function closePicker(): void { open.value = false }
function selectDraft(value: readonly string[]): void { draft.value = value }
function commitPicker(): void {
  if (props.disabled || !draft.value.length) return
  emit('update:modelValue', draft.value)
  closePicker()
}
</script>

<style>
.survey-part-picker__trigger { display:flex; align-items:center; justify-content:space-between;
  box-sizing:border-box; width:100%; min-height:82rpx; text-align:left; padding:18rpx 8rpx;
  margin:0; border:0; background:var(--app-color-surface); }
.survey-part-picker__trigger::after, .survey-part-picker__close::after { border:0; }
.survey-part-picker__value { display:flex; flex-direction:column; gap:5rpx; min-width:0; }
.survey-part-picker__parent { color:var(--app-color-text-secondary); font-size:var(--app-font-meta); }
.survey-part-picker__selection { color:var(--app-color-text-primary); font-weight:800; font-size:var(--app-font-value); }
.survey-part-picker__placeholder { color:var(--app-color-text-muted); font-size:var(--app-font-body); }
.survey-part-picker__arrow { color:var(--app-color-text-secondary); font-size:40rpx; margin-left:12rpx; }
.survey-part-picker__backdrop { position:fixed; z-index:130; inset:0; background:rgba(14,29,49,.47); }
.survey-part-picker__sheet { position:absolute; bottom:0; left:0; right:0; display:flex; flex-direction:column;
  max-height:84vh; box-sizing:border-box; background:var(--app-color-surface);
  border-radius:30rpx 30rpx 0 0; padding:24rpx var(--app-page-gutter) calc(18rpx + env(safe-area-inset-bottom)); }
.survey-part-picker__header { display:flex; align-items:center; justify-content:center; position:relative; min-height:54rpx; }
.survey-part-picker__title { color:var(--app-color-text-primary); font-size:var(--app-font-section-title); font-weight:800; }
.survey-part-picker__close { position:absolute; right:0; top:0; padding:0; width:52rpx; height:52rpx;
  background:transparent; color:var(--app-color-text-secondary); border:0; font-size:36rpx; line-height:48rpx; }
.survey-part-picker__current { display:flex; align-items:center; gap:18rpx; padding:16rpx 18rpx; margin-top:18rpx;
  background:var(--app-color-primary-soft); border-radius:12rpx; }
.survey-part-picker__meta { color:var(--app-color-text-secondary); font-size:var(--app-font-meta); }
.survey-part-picker__current-label { font-weight:750; color:var(--app-color-text-primary); flex:1; }
.survey-part-picker__options { height:51vh; min-height:270rpx; margin:16rpx 0; }
.survey-part-picker__sheet .app-cascade-selector--hierarchical { display:flex; align-items:flex-start; gap:12rpx; }
.survey-part-picker__sheet .app-cascade-selector__parents { display:flex; flex:0 0 28%; flex-direction:column; min-width:0; gap:4rpx; }
.survey-part-picker__sheet .app-cascade-selector__parent { justify-content:flex-start; border:0; border-left:4rpx solid transparent;
  border-radius:8rpx; background:transparent; font-size:var(--app-font-body); text-align:left; }
.survey-part-picker__sheet .app-cascade-selector__parent--active { border-left-color:var(--app-color-primary);
  background:var(--app-color-primary-soft); color:var(--app-color-primary); }
.survey-part-picker__sheet .app-cascade-selector__children { flex:1; margin-top:0; padding:6rpx;
  min-width:0; background:var(--app-color-surface); border:0; }
.survey-part-picker__sheet .app-cascade-selector__children-options { grid-template-columns:1fr; gap:6rpx; }
.survey-part-picker__sheet .app-cascade-selector__child { text-align:left; border-color:var(--app-color-border);
  background:var(--app-color-control-surface); min-height:74rpx; }
.survey-part-picker__sheet .app-cascade-selector__child.app-choice--selected { background:var(--app-color-primary-soft);
  border-color:var(--app-color-primary); }
.survey-part-picker__confirm { width:100%; flex-shrink:0; border:0; color:white; font-size:var(--app-font-body);
  font-weight:800; background:var(--app-color-primary); border-radius:12rpx; min-height:88rpx;
  display:flex; align-items:center; justify-content:center; }
.survey-part-picker__confirm[disabled] { background:var(--app-color-disabled-surface); color:var(--app-color-text-muted); }
.survey-part-picker__confirm::after { border:0; }
</style>
