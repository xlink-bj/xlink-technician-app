<template>
  <button
    class="app-button"
    :class="[
      `app-button--${variant}`,
      {
        'app-button--block': block,
        'app-button--disabled': disabled,
        'app-button--loading': loading,
        'app-button--pressed': pressed,
      },
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading"
    :aria-pressed="pressed === undefined ? undefined : pressed"
    @tap="$emit('tap')"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    readonly variant?: 'primary' | 'secondary' | 'text'
    readonly disabled?: boolean
    readonly loading?: boolean
    readonly block?: boolean
    readonly pressed?: boolean
  }>(),
  {
    variant: 'primary',
    disabled: false,
    loading: false,
    block: false,
    pressed: undefined,
  },
)

defineEmits<{
  (event: 'tap'): void
}>()
</script>
