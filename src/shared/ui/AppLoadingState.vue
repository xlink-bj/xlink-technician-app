<template>
  <view
    class="app-loading-state"
    :class="`app-loading-state--${variant}`"
    role="status"
    aria-live="polite"
    aria-busy="true"
    :aria-label="label"
  >
    <view v-if="variant === 'page'" class="app-loading-spinner" aria-hidden="true">
      <view class="app-loading-spinner-core" />
    </view>

    <view v-else-if="variant === 'workspace'" class="app-loading-workspace" aria-hidden="true">
      <view class="app-loading-workspace-body">
        <view class="app-loading-surface app-loading-context app-surface app-surface--compact">
          <view class="app-loading-line app-loading-line--context-label" />
          <view class="app-loading-line app-loading-line--context-title" />
        </view>

        <view class="app-loading-surface app-loading-content app-surface">
          <view class="app-loading-line app-loading-line--heading" />
          <view class="app-loading-line app-loading-line--caption" />
          <view class="app-loading-line app-loading-line--field-label" />
          <view class="app-loading-control" />
          <view class="app-loading-line app-loading-line--field-label app-loading-line--field-label-second" />
          <view class="app-loading-control app-loading-control--large" />
        </view>
      </view>

      <view class="app-loading-footer">
        <view class="app-loading-footer-button" />
      </view>
    </view>

    <view v-else class="app-loading-inline-track" aria-hidden="true">
      <view class="app-loading-inline-indicator" />
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    readonly label?: string
    readonly variant?: 'page' | 'workspace' | 'inline'
  }>(),
  {
    label: '正在加载',
    variant: 'page',
  },
)
</script>

<style>
.app-loading-state {
  box-sizing: border-box;
  color: var(--app-color-primary);
  width: 100%;
}

.app-loading-state--page {
  align-items: center;
  background: var(--app-color-page);
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: var(--app-space-xl);
}

.app-loading-spinner {
  align-items: center;
  border: 6rpx solid var(--app-color-primary-soft);
  border-radius: 50%;
  border-right-color: var(--app-color-primary);
  display: flex;
  height: 56rpx;
  justify-content: center;
  width: 56rpx;
  animation: app-loading-spin var(--app-motion-loading-spinner-duration) linear infinite;
}

.app-loading-spinner-core {
  background: var(--app-color-primary);
  border-radius: 50%;
  height: 8rpx;
  width: 8rpx;
}

.app-loading-state--workspace {
  background: var(--app-color-page);
  min-height: 100vh;
  padding: var(--app-space-lg) var(--app-page-gutter) calc(24rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}

.app-loading-workspace {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  min-height: calc(100vh - var(--app-space-lg) - 24rpx);
  max-width: 960rpx;
  width: 100%;
}

.app-loading-workspace-body {
  flex: 1;
}

.app-loading-surface {
  overflow: hidden;
}

.app-loading-context {
  padding: 22rpx var(--app-card-padding);
}

.app-loading-content {
  margin-top: var(--app-space-md);
  padding: var(--app-card-padding);
}

.app-loading-line,
.app-loading-control,
.app-loading-footer-button {
  animation: app-loading-pulse var(--app-motion-loading-duration) var(--app-motion-loading-easing) infinite;
  background: var(--app-color-control-surface);
  border-radius: 999rpx;
}

.app-loading-line--context-label { height: 20rpx; width: 24%; }
.app-loading-line--context-title { height: 28rpx; margin-top: 14rpx; width: 48%; }
.app-loading-line--heading { height: 30rpx; width: 38%; }
.app-loading-line--caption { height: 20rpx; margin-top: 14rpx; width: 64%; }
.app-loading-line--field-label { height: 20rpx; margin-top: 34rpx; width: 26%; }
.app-loading-line--field-label-second { margin-top: 28rpx; width: 20%; }

.app-loading-control {
  border-radius: var(--app-radius-control);
  height: var(--app-control-height);
  margin-top: 12rpx;
}

.app-loading-control--large {
  height: 132rpx;
}

.app-loading-footer {
  border-top: 1rpx solid var(--app-color-divider);
  margin: var(--app-space-lg) -24rpx 0;
  padding: var(--app-space-sm) var(--app-action-bar-padding-x) 0;
}

.app-loading-footer-button {
  background: var(--app-color-border-soft);
  border-radius: var(--app-radius-control);
  height: var(--app-control-height);
  width: 100%;
}

.app-loading-state--inline {
  align-items: center;
  display: flex;
  height: 48rpx;
  justify-content: center;
  padding: 0 var(--app-page-gutter);
}

.app-loading-inline-track {
  background: var(--app-color-border-soft);
  border-radius: 999rpx;
  height: 4rpx;
  overflow: hidden;
  width: 100%;
}

.app-loading-inline-indicator {
  animation: app-loading-slide var(--app-motion-loading-slide-duration) ease-in-out infinite;
  background: var(--app-color-primary);
  border-radius: inherit;
  height: 100%;
  width: 32%;
}

</style>
