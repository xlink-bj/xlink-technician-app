<template>
  <!-- Presentation only. Parent Workspace owns action eligibility, submission
       and keyboard-aware placement; this component never dispatches business. -->
  <view
    class="app-action-bar"
    :class="[`app-action-bar--${layout}`, { 'app-action-bar--preview': preview, 'app-action-bar--elevated': elevated }]"
    role="group"
    :aria-label="label"
    data-testid="app-action-bar"
  >
    <view class="app-action-bar__inner"><slot /></view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  readonly layout?: 'single' | 'dual' | 'split' | 'trailing'
  readonly elevated?: boolean
  readonly preview?: boolean
  readonly label?: string
}>(), {
  layout: 'single',
  preview: false,
  elevated: false,
  label: '当前工作区操作',
})
</script>
