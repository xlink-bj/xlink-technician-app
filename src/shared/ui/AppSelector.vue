<template>
  <button
    class="app-selector"
    :class="{ 'app-selector--selected': selected, 'app-selector--disabled': disabled }"
    :disabled="disabled"
    @tap="$emit('tap')"
  >
    <view class="app-selector__content">
      <slot>
        <text v-if="value" class="app-selector__value">{{ value }}</text>
        <text v-else class="app-selector__placeholder">{{ placeholder }}</text>
      </slot>
    </view>
    <AppIcon class="app-selector__chevron" name="chevron-right" :size="18" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(
  defineProps<{
    readonly selected?: boolean
    readonly disabled?: boolean
    readonly value?: string
    readonly placeholder?: string
  }>(),
  {
    selected: false,
    disabled: false,
    value: '',
    placeholder: '请选择',
  },
)

defineEmits<{
  (event: 'tap'): void
}>()
</script>
