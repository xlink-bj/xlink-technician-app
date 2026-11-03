<template>
  <view
    v-if="visible"
    class="survey-leakage-cause"
    :data-testid="testIdPrefix"
  >
    <slot name="heading"><text class="survey-leakage-cause__heading">{{ title }}</text></slot>
    <AppField
      class="survey-leakage-cause__field"
      hide-label
      :label="label"
      :required="required"
      :supporting="readOnly ? readOnlyHint : selectionHint"
    >
      <button
        v-if="!readOnly"
        class="survey-leakage-cause__trigger"
        :data-testid="testIdPrefix + '-trigger'"
        :disabled="!canOpen || submitting"
        @tap="open"
      >
        <view class="survey-leakage-cause__summary">
          <text v-if="selectedCount > 0" class="survey-leakage-cause__count">已选择 {{ selectedCount }} 项</text>
          <text :class="selectedCount > 0 ? 'survey-leakage-cause__selected-text' : 'survey-leakage-cause__empty'">
            {{ selectedCount > 0 ? selectedLabels : placeholder }}
          </text>
        </view>
        <text class="survey-leakage-cause__chevron" aria-hidden="true">›</text>
      </button>
      <view v-else class="survey-leakage-cause__readonly-summary">
        <text v-if="selectedCount > 0" class="survey-leakage-cause__selected-text">{{ selectedLabels }}</text>
        <text v-else class="survey-leakage-cause__empty">{{ emptyLabel }}</text>
      </view>
      <AppStatus
        v-if="selectionError && !isOpen"
        :message="selectionError"
        tone="warning"
        icon="warning"
        quiet
      />

      <view v-if="isOpen" class="survey-leakage-cause__backdrop">
        <view class="survey-leakage-cause__sheet" :data-testid="testIdPrefix + '-panel'">
          <view class="survey-leakage-cause__sheet-header">
            <text class="survey-leakage-cause__sheet-title">{{ sheetTitle }}</text>
            <button class="survey-leakage-cause__close" aria-label="关闭" @tap="close">×</button>
          </view>

          <AppStatus
            v-if="providerState === 'loading'"
            :message="loadingMessage"
            tone="neutral"
            quiet
          />
          <template v-else-if="providerState === 'failed_retryable' || providerState === 'failed_terminal'">
            <AppStatus
              :message="failureMessage"
              tone="warning"
              icon="warning"
              quiet
            />
            <AppButton variant="text" block @tap="retry">重试加载</AppButton>
          </template>
          <AppStatus
            v-else-if="!dependencyReady"
            :message="dependencyMessage"
            tone="neutral"
            quiet
          />
          <AppStatus
            v-else-if="groups.length === 0"
            :message="emptyOptionsMessage"
            tone="neutral"
            quiet
          />
          <template v-else>
            <view class="survey-leakage-cause__sheet-body" :data-testid="testIdPrefix + '-options'">
              <scroll-view class="survey-leakage-cause__groups" scroll-y>
                <text class="survey-leakage-cause__column-title">{{ groupTitle }}</text>
                <button
                  v-for="group in groups"
                  :key="group.value"
                  class="survey-leakage-cause__group"
                  :class="{ 'survey-leakage-cause__group--active': activeGroup?.value === group.value }"
                  :data-testid="testIdPrefix + '-group'"
                  :aria-pressed="activeGroup?.value === group.value"
                  @tap="activeGroupValue = group.value"
                >
                  <text>{{ group.label }}</text>
                  <text v-if="selectedCountFor(group.value) > 0" class="survey-leakage-cause__group-count">
                    {{ selectedCountFor(group.value) }}
                  </text>
                </button>
              </scroll-view>

              <scroll-view class="survey-leakage-cause__options" scroll-y>
                <text class="survey-leakage-cause__column-title">{{ activeGroup?.label || title }}</text>
                <button
                  v-for="option in activeGroup?.children ?? []"
                  :key="option.value"
                  class="survey-leakage-cause__option"
                  :class="{ 'survey-leakage-cause__option--selected': isSelected(option.value) }"
                  :data-testid="testIdPrefix + '-option'"
                  :aria-pressed="isSelected(option.value)"
                  :disabled="submitting"
                  @tap="toggleOption(option.value)"
                >
                  <text class="survey-leakage-cause__option-indicator" aria-hidden="true">{{ isSelected(option.value) ? '✓' : '' }}</text>
                  <text>{{ option.label }}</text>
                </button>
              </scroll-view>
            </view>
            <view class="survey-leakage-cause__selected" :data-testid="testIdPrefix + '-selected'">
              <view class="survey-leakage-cause__selected-header">
                <text>已选 {{ draftIds.length }} 项</text>
                <button class="survey-leakage-cause__clear" :class="{ 'survey-leakage-cause__clear--disabled': draftIds.length === 0 }" :disabled="draftIds.length === 0"
                  @tap="clearDraft">清空</button>
              </view>
              <view v-if="draftChoices.length" class="survey-leakage-cause__chips">
                <button v-for="choice in draftChoices" :key="choice.value"
                  class="survey-leakage-cause__chip" :disabled="submitting"
                  :aria-label="`移除${choice.label}`" @tap="toggleOption(choice.value)">
                  {{ choice.label }} <text aria-hidden="true">×</text>
                </button>
              </view>
              <text v-else class="survey-leakage-cause__selected-empty">{{ emptyLabel }}</text>
            </view>
            <AppStatus
              v-if="selectionError"
              :message="selectionError"
              tone="warning"
              icon="warning"
              quiet
            />
            <AppButton class="survey-leakage-cause__done" variant="primary" block
              :disabled="submitting" @tap="confirm">
              确认选择
            </AppButton>
          </template>
        </view>
      </view>
    </AppField>
  </view>
</template>


<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { OperationSnapshot } from '@shared/types'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'
import AppStatus from './AppStatus.vue'
import { countGroupedChoices, toggleGroupedChoice, type GroupedChoiceGroup } from './grouped-choice'

/**
 * Presentation-only field control. It has no knowledge of Survey, FormDef,
 * backend collections, Workflow or persisted value keys. Callers bind an
 * identity-checked field + verified provider; onConfirm only changes local
 * form state. Saving and completing a node belong to Action Workspace.
 *
 * R1 compatibility: the selected dependency chooses the *initial group*,
 * not a filter that deletes other provider groups.
 */
const props = withDefaults(defineProps<{
  readonly visible: boolean
  readonly title: string
  readonly label: string
  readonly required: boolean
  readonly selectedIds: readonly string[]
  readonly selectedLabels: readonly string[]
  readonly groups: readonly GroupedChoiceGroup[]
  readonly readOnly: boolean
  readonly canOpen: boolean
  readonly dependencyReady: boolean
  readonly submitting: boolean
  readonly providerState: 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
  readonly loadOptions: () => Promise<OperationSnapshot<unknown>>
  readonly applySelection: (ids: readonly string[]) => OperationSnapshot<void>
  readonly testIdPrefix?: string
  readonly readOnlyHint?: string
  readonly selectionHint?: string
  readonly placeholder?: string
  readonly emptyLabel?: string
  readonly loadingMessage?: string
  readonly failureMessage?: string
  readonly dependencyMessage?: string
  readonly emptyOptionsMessage?: string
  readonly groupTitle?: string
  readonly sheetTitle?: string
}>(), {
  testIdPrefix: 'grouped-multi-select',
  readOnlyHint: '仅查看已保存的选择',
  selectionHint: '请选择一个或多个选项',
  placeholder: '请选择',
  emptyLabel: '尚未选择',
  loadingMessage: '正在加载选项',
  failureMessage: '选项暂时无法加载，已保存选择不会被清除',
  dependencyMessage: '请先选择关联字段',
  emptyOptionsMessage: '暂无可选项',
  groupTitle: '分类',
  sheetTitle: '选择',
})
const isOpen = ref(false)
const draftIds = ref<readonly string[]>([])
const selectionError = ref<string | null>(null)
const activeGroupValue = ref<string | undefined>()
const selectedCount = computed(() => props.selectedIds.length)
const selectedLabels = computed(() => props.selectedLabels.join('、'))
const draftChoices = computed(() => {
  const chosen = new Set(draftIds.value)
  return props.groups.flatMap(group => group.children).filter(option => chosen.has(option.value))
})
const activeGroup = computed(() => props.groups.find(group => group.value === activeGroupValue.value) ?? props.groups[0])

watch(() => props.groups, groups => {
  if (groups.length && !groups.some(group => group.value === activeGroupValue.value)) activeGroupValue.value = groups[0].value
}, { immediate: true })

async function open(): Promise<void> {
  if (props.readOnly || !props.canOpen || props.submitting) return
  selectionError.value = null
  draftIds.value = [...props.selectedIds]
  isOpen.value = true
  const result = await props.loadOptions()
  if (isOpen.value && result.state === 'succeeded') activeGroupValue.value = props.groups[0]?.value
}
function close(): void {
  isOpen.value = false
  draftIds.value = []
  selectionError.value = null
}
function clearDraft(): void {
  if (!props.submitting) draftIds.value = []
}
function confirm(): void {
  // Native double-tap after close must not apply an emptied draft twice.
  if (!isOpen.value || props.submitting || props.readOnly) return
  const result = props.applySelection(draftIds.value)
  if (result.state !== 'succeeded') {
    if (result.error?.category === 'session_invalid') {
      close()
      selectionError.value = '账号或角色已变化，请重新进入工单后继续。'
    } else {
      selectionError.value = '所选内容未能应用。当前选择仍保留，请检查后重试。'
    }
    return
  }
  close()
}
async function retry(): Promise<void> {
  const result = await props.loadOptions()
  if (isOpen.value && result.state === 'succeeded') activeGroupValue.value = props.groups[0]?.value
}
function selectedCountFor(groupValue: string): number {
  return countGroupedChoices(props.groups, groupValue, draftIds.value)
}
function isSelected(value: string): boolean {
  return draftIds.value.includes(value)
}
function toggleOption(value: string): void {
  if (props.submitting) return
  selectionError.value = null
  draftIds.value = toggleGroupedChoice(props.groups, draftIds.value, value)
}
</script>
<style>
/* Legacy survey-* CSS selectors are retained temporarily for the approved S01–S05
 * screenshot parity; they are not business identity or form schema selectors. */
.survey-leakage-cause__heading { display:block; font-size:var(--app-font-section-title); font-weight:750; }

.survey-leakage-cause__field { margin-top: var(--app-space-lg); }
.survey-leakage-cause__trigger,
.survey-leakage-cause__readonly-summary {
  align-items: center;
  background: var(--app-color-control-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  min-height: var(--app-touch-target);
  padding: var(--app-control-padding-y) var(--app-control-padding-x);
  text-align: left;
  width: 100%;
}
.survey-leakage-cause__trigger::after { border: 0; }
.survey-leakage-cause__trigger:active { opacity: 0.9; }
.survey-leakage-cause__summary { flex: 1; min-width: 0; }
.survey-leakage-cause__count { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 700; }
.survey-leakage-cause__selected-text { color: var(--app-color-text-secondary); display: block; line-height: 1.5; margin-top: var(--app-space-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.survey-leakage-cause__empty { color: var(--app-color-text-muted); line-height: 1.5; }
.survey-leakage-cause__chevron { color: var(--app-color-text-secondary); font-size: 36rpx; line-height: 1; margin-left: var(--app-space-sm); }
.survey-leakage-cause__backdrop { background: rgba(16, 31, 53, 0.42); bottom: 0; left: 0; position: fixed; right: 0; top: 0; z-index: 100; }
.survey-leakage-cause__sheet { background: var(--app-color-surface); border-radius: 24rpx 24rpx 0 0; bottom: 0; box-sizing: border-box; display: flex; flex-direction: column; left: 0; max-height: 82vh; padding: var(--app-space-lg) var(--app-page-gutter) calc(var(--app-space-md) + env(safe-area-inset-bottom)); position: absolute; right: 0; }
.survey-leakage-cause__sheet-header { align-items: center; display: flex; justify-content: space-between; }
.survey-leakage-cause__sheet-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.survey-leakage-cause__close { background: transparent; border: 0; color: var(--app-color-text-secondary); font-size: 42rpx; height: 56rpx; line-height: 48rpx; margin: -8rpx -8rpx 0 0; padding: 0; width: 56rpx; }
.survey-leakage-cause__close::after { border: 0; }
.survey-leakage-cause__sheet-body { border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); display: flex; height: 48vh; margin-top: var(--app-space-md); min-height: 300rpx; overflow: hidden; }
.survey-leakage-cause__groups { background: var(--app-color-page); border-right: 1rpx solid var(--app-color-border); box-sizing: border-box; flex: 0 0 34%; height: 100%; padding: var(--app-space-sm); }
.survey-leakage-cause__options { box-sizing: border-box; flex: 1; height: 100%; padding: var(--app-space-sm) var(--app-space-md); }
.survey-leakage-cause__column-title { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); font-weight: 700; margin-bottom: var(--app-space-xs); }
.survey-leakage-cause__group { align-items: center; background: transparent; border: 0; border-left: 4rpx solid transparent; border-radius: 0; color: var(--app-color-text-secondary); display: flex; font-size: var(--app-font-body); justify-content: space-between; margin: 0; min-height: var(--app-touch-target); padding: var(--app-space-sm) var(--app-space-xs); text-align: left; width: 100%; }
.survey-leakage-cause__group::after { border: 0; }
.survey-leakage-cause__group--active { background: var(--app-color-surface); border-left-color: var(--app-color-primary); color: var(--app-color-primary); font-weight: 700; }
.survey-leakage-cause__group-count { background: var(--app-color-primary-soft); border-radius: 999px; color: var(--app-color-primary); font-size: var(--app-font-caption); min-width: 30rpx; padding: 2rpx 6rpx; text-align: center; }
.survey-leakage-cause__option { align-items: center; background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); color: var(--app-color-text-primary); display: flex; font-size: var(--app-font-body); justify-content: flex-start; margin: var(--app-space-sm) 0 0; min-height: var(--app-touch-target); padding: var(--app-space-sm) var(--app-space-md); text-align: left; width: 100%; }
.survey-leakage-cause__option::after { border: 0; }
.survey-leakage-cause__option--selected { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); color: var(--app-color-primary); font-weight: 700; }
.survey-leakage-cause__option-indicator { align-items: center; border: 2rpx solid var(--app-color-border-control); border-radius: 50%; display: inline-flex; height: 32rpx; justify-content: center; margin-right: var(--app-space-sm); width: 32rpx; }
.survey-leakage-cause__option--selected .survey-leakage-cause__option-indicator { background: var(--app-color-primary); border-color: var(--app-color-primary); color: #fff; }
.survey-leakage-cause__done { margin-top: var(--app-space-md); }
.survey-leakage-cause__readonly-summary { background: var(--app-color-disabled-surface); }
/* Keep the approved S03 visual geometry stable across business forms. */
.survey-leakage-cause { border:1rpx solid var(--app-color-border); background:var(--app-color-surface);
  border-radius:var(--app-radius-card); padding:20rpx 22rpx; margin-top:14rpx; box-shadow:0 5rpx 18rpx rgba(25,50,81,.035); }
.survey-leakage-cause__field { margin:0; }
.survey-leakage-cause__field .app-field__label { font-size:var(--app-font-section-title); font-weight:750; }
.survey-leakage-cause__trigger { background:var(--app-color-surface); border:0; padding-left:0; padding-right:0; }
.survey-leakage-cause__sheet { max-height:84vh; border-radius:30rpx 30rpx 0 0; }
.survey-leakage-cause__option { border-radius:12rpx; }
.survey-leakage-cause__option-indicator { border-radius:8rpx; }
.survey-leakage-cause__group { min-height:74rpx; }
/* This focused picker may be hosted by any identity-checked form field. */
.survey-leakage-cause { padding:18rpx 18rpx 20rpx; border-radius:22rpx; margin:0 0 16rpx; box-shadow:0 5rpx 18rpx rgba(25,50,81,.035); }
.survey-leakage-cause__field .app-field__label { display:none; }
.survey-leakage-cause__trigger { min-height:86rpx; padding:12rpx 2rpx; }
.survey-leakage-cause__summary { flex:1; min-width:0; }
/* S03: draft selection and visible chips; closing the panel cancels
   provisional edits, only Confirm updates the existing Form Runtime. */
.survey-leakage-cause__sheet-body { flex:1 1 auto; min-height:240rpx; height:min(41vh,610rpx); }
.survey-leakage-cause__selected { border-top:1rpx solid var(--app-color-divider);
  padding:13rpx 2rpx 3rpx; margin-top:13rpx; flex:none; }
.survey-leakage-cause__selected-header { display:flex; align-items:center; justify-content:space-between;
  color:var(--app-color-text-secondary); font-size:22rpx; font-weight:650; }
.survey-leakage-cause__clear { background:transparent; border:0; color:var(--app-color-primary);
  font-size:22rpx; min-height:54rpx; padding:0 12rpx; margin:0; }
.survey-leakage-cause__clear::after, .survey-leakage-cause__chip::after { border:0; }
.survey-leakage-cause__clear--disabled { color:var(--app-color-text-muted); }
.survey-leakage-cause__chips { display:flex; flex-wrap:wrap; gap:9rpx; max-height:116rpx; overflow-y:auto; margin-top:4rpx; }
.survey-leakage-cause__chip { display:flex; align-items:center; gap:8rpx; background:var(--app-color-primary-soft);
  color:var(--app-color-primary); border:0; border-radius:999rpx; padding:8rpx 14rpx;
  margin:0; font-size:21rpx; min-height:52rpx; max-width:100%; }
.survey-leakage-cause__selected-empty { color:var(--app-color-text-muted); font-size:21rpx; display:block; padding:7rpx 0; }
.survey-leakage-cause__done { margin-top:12rpx; flex:none; }
</style>
