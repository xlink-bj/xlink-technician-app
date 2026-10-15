<template>
  <button
    class="app-button"
    :class="[
      `app-button--${variant}`,
      `app-button--size-${size}`,
      {
        'app-button--block': block,
        'app-button--disabled': disabled || loading,
        'app-button--loading': loading,
        'app-button--pressed': pressed,
      },
    ]"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || loading"
    :aria-busy="loading"
    :aria-pressed="pressed === undefined ? undefined : pressed"
    @tap="handleTap"
  >
    <view class="app-button__content">
      <view v-if="$slots.leading" class="app-button__leading"><slot name="leading" /></view>
      <view
        v-else
        class="app-button__loading-slot"
        :class="{ 'app-button__loading-slot--active': loading }"
        aria-hidden="true"
      />
      <view class="app-button__label"><slot /></view>
      <view v-if="$slots.trailing" class="app-button__trailing"><slot name="trailing" /></view>
      <view v-else class="app-button__loading-slot app-button__loading-slot--trailing" aria-hidden="true" />
    </view>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    readonly variant?: 'primary' | 'secondary' | 'text'
    /** All sizes retain a >=44px touch area at the 375px mobile viewport. */
    readonly size?: 'compact' | 'regular' | 'large'
    readonly disabled?: boolean
    readonly loading?: boolean
    readonly block?: boolean
    readonly pressed?: boolean
    readonly ariaLabel?: string
  }>(),
  {
    variant: 'primary',
    size: 'regular',
    disabled: false,
    loading: false,
    block: false,
    pressed: undefined,
  },
)

const emit = defineEmits<{ (event: 'tap'): void }>()

function handleTap(): void {
  // Native disabled prevents pointer taps; guard programmatic/synthetic taps
  // too. No business eligibility is determined by this component.
  if (props.disabled || props.loading) return
  emit('tap')
}
</script>
