<template>
  <span
    class="review-uni-icons"
    :aria-label="type"
    :style="{ color, fontSize: `${size}px` }"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: string
    color?: string
    size?: number | string
  }>(),
  {
    type: '',
    color: 'currentColor',
    size: 16,
  },
)
</script>

<style scoped>
.review-uni-icons {
  display: inline-block;
  line-height: 1;
  text-align: center;
}
</style>
