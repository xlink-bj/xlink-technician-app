<template>
  <uni-icons :type="appIconTypeFor(name)" :size="size" :color="color" />
</template>

<script setup lang="ts">
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

import { appIconTypeFor, type AppIconName } from './icons'

withDefaults(
  defineProps<{
    name: AppIconName
    size?: number | string
    color?: string
  }>(),
  {
    size: 18,
    color: 'var(--app-color-text-secondary)',
  },
)
</script>
