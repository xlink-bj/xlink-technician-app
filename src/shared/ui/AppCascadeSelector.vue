<template>
  <view
    class="app-choice-group app-choice-group--multi app-cascade-selector"
    :class="{ 'app-cascade-selector--hierarchical': hierarchical }"
    :data-testid="hierarchical ? 'survey-repair-part-selector' : undefined"
  >
    <template v-if="hierarchical">
      <view class="app-cascade-selector__parents" data-testid="survey-repair-part-parents">
        <button
          v-for="option in options"
          :key="option.value"
          class="app-choice app-choice--multi app-cascade-selector__parent"
          :class="{ 'app-choice--selected': isParentSelected(option), 'app-cascade-selector__parent--active': activeParentValue === option.value }"
          :disabled="disabled"
          :aria-pressed="isParentSelected(option)"
          :aria-expanded="option.children?.length ? activeParentValue === option.value : undefined"
          @tap="selectParent(option)"
        >
          {{ option.label }}
          <text v-if="option.children?.length" class="app-cascade-selector__parent-indicator" aria-hidden="true">›</text>
        </button>
      </view>

      <view v-if="activeParent?.children?.length" class="app-cascade-selector__children" data-testid="survey-repair-part-children">
        <view class="app-cascade-selector__children-heading">
          <text class="app-cascade-selector__children-title">{{ activeParent.label }}</text>
          <text class="app-cascade-selector__children-caption">选择具体部位</text>
        </view>
        <view class="app-cascade-selector__children-options">
          <button
            v-for="option in activeParent.children"
            :key="option.value"
            class="app-choice app-choice--multi app-cascade-selector__child"
            :class="{ 'app-choice--selected': isSelected([activeParent.value, option.value]) }"
            :disabled="disabled"
            :aria-pressed="isSelected([activeParent.value, option.value])"
            @tap="select([activeParent.value, option.value])"
          >
            {{ option.label }}
          </button>
        </view>
      </view>
    </template>

    <button
      v-else
      v-for="option in leafOptions"
      :key="option.valuePath.join('/')"
      class="app-choice app-choice--multi"
      :class="{ 'app-choice--selected': isSelected(option.valuePath), 'app-choice--disabled': disabled }"
      :disabled="disabled"
      :aria-pressed="isSelected(option.valuePath)"
      @tap="select(option.valuePath)"
    >
      {{ option.labelPath.join(' / ') }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface CascadeOption {
  readonly value: string
  readonly label: string
  readonly children?: readonly CascadeOption[]
}

interface LeafOption {
  readonly valuePath: readonly string[]
  readonly labelPath: readonly string[]
}

const props = withDefaults(
  defineProps<{
    readonly options: readonly CascadeOption[]
    readonly modelValue: readonly string[]
    readonly disabled?: boolean
    /** Survey uses a readable parent -> child presentation; value paths stay unchanged. */
    readonly hierarchical?: boolean
  }>(),
  { disabled: false, hierarchical: false },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: readonly string[]): void
}>()

const leafOptions = computed<readonly LeafOption[]>(() => {
  const output: LeafOption[] = []
  const visit = (
    options: readonly CascadeOption[],
    valuePath: readonly string[],
    labelPath: readonly string[],
  ): void => {
    options.forEach((option) => {
      const nextValues = [...valuePath, option.value]
      const nextLabels = [...labelPath, option.label]
      if (option.children?.length) visit(option.children, nextValues, nextLabels)
      else output.push({ valuePath: nextValues, labelPath: nextLabels })
    })
  }
  visit(props.options, [], [])
  return output
})

const activeParentValue = ref<string | undefined>(undefined)
const activeParent = computed(() => props.options.find((option) => option.value === activeParentValue.value))

watch(
  () => props.modelValue[0],
  (value) => {
    if (!value || !props.options.some((option) => option.value === value)) {
      activeParentValue.value = undefined
      return
    }
    activeParentValue.value = value
  },
  { immediate: true },
)

function isSelected(valuePath: readonly string[]): boolean {
  return valuePath.length === props.modelValue.length
    && valuePath.every((value, index) => String(props.modelValue[index]) === value)
}

function isParentSelected(option: CascadeOption): boolean {
  return isSelected([option.value])
    || Boolean(option.children?.length && props.modelValue[0] === option.value)
}

function selectParent(option: CascadeOption): void {
  if (props.disabled) return
  if (option.children?.length) {
    activeParentValue.value = option.value
    return
  }
  select([option.value])
}

function select(valuePath: readonly string[]): void {
  if (!props.disabled) emit('update:modelValue', valuePath)
}
</script>

<style>
.app-cascade-selector--hierarchical {
  display: block;
}

.app-cascade-selector__parents,
.app-cascade-selector__children-options {
  display: grid;
  gap: var(--app-control-gap);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.app-cascade-selector__parent,
.app-cascade-selector__child {
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
  white-space: normal;
  word-break: keep-all;
}

.app-cascade-selector__parent {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: var(--app-control-height);
  padding-left: var(--app-space-sm);
  padding-right: var(--app-space-sm);
}

.app-cascade-selector__parent-indicator {
  color: currentColor;
  font-size: 20px;
  line-height: 1;
  margin-left: var(--app-space-xs);
}

.app-cascade-selector__parent--active {
  background: var(--app-color-primary-soft);
  border-color: var(--app-color-primary);
  color: var(--app-color-primary);
}

.app-cascade-selector__children {
  background: var(--app-color-page);
  border: 1rpx solid var(--app-color-divider);
  border-radius: var(--app-radius-control);
  margin-top: var(--app-space-md);
  padding: var(--app-space-md);
}

.app-cascade-selector__children-heading {
  align-items: baseline;
  display: flex;
  gap: var(--app-space-sm);
  margin-bottom: var(--app-space-sm);
}

.app-cascade-selector__children-title {
  color: var(--app-color-text-primary);
  font-size: var(--app-font-body);
  font-weight: 800;
}

.app-cascade-selector__children-caption {
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-caption);
}

.app-cascade-selector__child {
  min-height: var(--app-control-height);
  padding-bottom: var(--app-space-sm);
  padding-top: var(--app-space-sm);
}
</style>
