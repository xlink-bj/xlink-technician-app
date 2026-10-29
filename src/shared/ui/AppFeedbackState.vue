<template>
  <!-- Generic, presentation-only work-order feedback pattern.
       The page owns all load states and decides whether an action is offered. -->
  <view
    class="app-feedback-state"
    :class="[
      `app-feedback-state--${layout}`,
      `app-feedback-state--${appearance}`,
    ]"
    :role="appearance === 'search-empty' || appearance === 'blocked' ? 'status' : 'alert'"
    data-testid="app-feedback-state"
  >
    <view v-if="appearance === 'search-empty'" class="app-feedback-state__search-illustration" aria-hidden="true">
      <view class="app-feedback-state__search-ring" />
      <view class="app-feedback-state__search-handle" />
    </view>
    <view v-else-if="appearance !== 'blocked'" class="app-feedback-state__icon" aria-hidden="true">!</view>
    <text class="app-feedback-state__title">{{ title }}</text>
    <text class="app-feedback-state__description">{{ description }}</text>
    <button v-if="actionLabel" class="app-feedback-state__action" @tap="emit('action')">{{ actionLabel }}</button>
  </view>
</template>
<script setup lang="ts">
withDefaults(defineProps<{
  readonly layout: 'list' | 'detail'
  readonly appearance?: 'error' | 'retry' | 'search-empty' | 'blocked'
  readonly title: string
  readonly description: string
  readonly actionLabel?: string
}>(), { appearance: 'error', actionLabel: '' })
const emit = defineEmits<{ (event: 'action'): void }>()
</script>
<style scoped>
.app-feedback-state {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.app-feedback-state--list {
  background: rgba(255, 255, 255, 0.92);
  border: 1rpx solid #e2e8f1;
  border-radius: 28rpx;
  min-height: 400rpx;
  padding: 48rpx 36rpx;
}
 .app-feedback-state--detail {
  min-height: 58vh;
  margin: 0 auto;
  max-width: 960rpx;
}
.app-feedback-state__icon {
  align-items: center;
  border-radius: 50%;
  display: flex;
  justify-content: center;
}
.app-feedback-state--list .app-feedback-state__icon {
  background: #fff0ef;
  color: #d64545;
  font-size: 40rpx;
  font-weight: 900;
  height: 96rpx;
  width: 96rpx;
}
.app-feedback-state--detail .app-feedback-state__icon {
  background: #fff0f0;
  color: #e05252;
  font-size: 26rpx;
  font-weight: 800;
  height: 74rpx;
  width: 74rpx;
  margin-bottom: 22rpx;
}
.app-feedback-state--detail.app-feedback-state--retry .app-feedback-state__icon {
  background: #fff7e7;
  color: #e28a19;
}
.app-feedback-state__title { display: block; }
.app-feedback-state--list .app-feedback-state__title {
  color: #1b2940; font-size: 32rpx;
  font-weight: 850; line-height: 1.4; margin-top: 24rpx;
}
.app-feedback-state--detail .app-feedback-state__title {
  color: #172033; font-size: 30rpx; font-weight: 800;
}
.app-feedback-state__description { display: block; line-height: 1.6; margin-top: 10rpx; }
.app-feedback-state--list .app-feedback-state__description {
  color: #7c8ba2; font-size: 25rpx; margin-top: 12rpx;
}
.app-feedback-state--detail .app-feedback-state__description {
  color: #8290a4; font-size: 24rpx;
}
.app-feedback-state__action {
  background: #2878f2; color: #ffffff;
  font-weight: 800; margin: 28rpx 0 0;
}
.app-feedback-state__action::after { border: 0; }
.app-feedback-state--list .app-feedback-state__action {
  border-radius: 16rpx; font-size: 27rpx;
  line-height: 1; min-height: 76rpx; padding: 0 34rpx;
}
.app-feedback-state--detail .app-feedback-state__action {
  border-radius: 14rpx; font-size: 24rpx; min-width: 260rpx;
}
.app-feedback-state__search-illustration {
  height: 112rpx; position: relative; width: 164rpx;
}
.app-feedback-state__search-ring {
  border: 7rpx solid #c7dcff;
  border-radius: 50%; height: 54rpx; left: 48rpx;
  position: absolute; top: 16rpx; width: 54rpx;
}
.app-feedback-state__search-handle {
  background: #78a8f6; border-radius: 999rpx; height: 8rpx;
  left: 98rpx; position: absolute; top: 72rpx;
  transform: rotate(45deg); width: 34rpx;
}
</style>