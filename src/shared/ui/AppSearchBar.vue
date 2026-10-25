<template>
  <!-- All appearance owned here. Search semantics & data remain caller-owned. -->
  <view class="search-band" data-testid="app-search-bar">
    <view class="search-input-shell">
      <AppIcon class="search-icon" name="search" :size="17" color="#71829e" aria-hidden="true" />
      <input
        :value="modelValue"
        class="search-input"
        :placeholder="placeholder"
        placeholder-class="search-placeholder"
        confirm-type="search"
        :disabled="disabled"
        @input="handleInput"
        @confirm="emit('search')"
      />
    </view>
    <button class="search-button" :class="{ 'search-button--disabled': disabled }"
      :disabled="disabled" @tap="emit('search')">{{ actionLabel }}</button>
  </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
withDefaults(defineProps<{
  readonly modelValue: string
  readonly placeholder?: string
  readonly actionLabel?: string
  readonly disabled?: boolean
}>(), { placeholder: '搜索', actionLabel: '搜索', disabled: false })
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'search'): void
}>()
function handleInput(event: Event): void {
  // uni-app's native input sends detail.value at runtime, whereas Vue's
  // template type declares Event. Normalize both without changing input timing.
  const native = event as Event & { detail?: { value?: string } }
  const value = native.detail?.value ?? (event.target as HTMLInputElement | null)?.value ?? ''
  emit('update:modelValue', value)
}
</script>
<style scoped>
.search-band {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  gap: 16rpx;
  margin: 12rpx 8rpx 0;
  padding: 0;
  width: auto;
}

.search-input-shell {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #e1e7f0;
  border-radius: 24rpx;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  gap: 12rpx;
  height: 88rpx;
  min-width: 0;
  padding: 0 22rpx;
}

.search-icon {
  color: #71819b;
  flex: 0 0 auto;
  font-size: 32rpx;
  line-height: 1;
  transform: rotate(-18deg);
}

.search-input {
  color: #17243a;
  flex: 1;
  font-size: 26rpx;
  height: 88rpx;
  line-height: 88rpx;
  min-width: 0;
}

.search-placeholder {
  color: #98a6ba;
}

.search-button {
  background: #2878f2;
  border-radius: 24rpx;
  color: #ffffff;
  flex: 0 0 128rpx;
  font-size: 28rpx;
  font-weight: 800;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  padding: 0;
}

.search-button--disabled {
  opacity: 0.58;
}
</style>
