<template>
<view class="list-state empty-state" data-testid="work-order-empty-state">
        <view class="empty-state-card">
          <view class="empty-illustration" aria-hidden="true">
            <view class="empty-illustration-shadow" />
            <view class="empty-illustration-spark empty-illustration-spark-left" />
            <view class="empty-illustration-spark empty-illustration-spark-right" />
            <view class="empty-clipboard">
              <view class="empty-clipboard-sheet">
                <view class="empty-clipboard-line empty-clipboard-line-long" />
                <view class="empty-clipboard-line empty-clipboard-line-medium" />
                <view class="empty-clipboard-line empty-clipboard-line-short" />
              </view>
              <view class="empty-clipboard-clip"><view class="empty-clipboard-clip-hole" /></view>
              <view class="empty-clipboard-badge"><view class="empty-clipboard-minus" /></view>
            </view>
          </view>
          <text class="empty-state-title">{{ title }}</text>
          <text class="empty-state-detail">{{ description }}</text>
          <button class="empty-state-action" @tap="emit('action')">
            <AppIcon name="refresh" :size="18" color="#ffffff" aria-hidden="true" />
            <text>{{ actionLabel }}</text>
          </button>
        </view>
      </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
withDefaults(defineProps<{
  readonly title?: string
  readonly description?: string
  readonly actionLabel?: string
}>(), {
  title: '当前暂无工单',
  description: '当前角色暂时没有可处理的工单，可稍后刷新再试。',
  actionLabel: '刷新工单',
})
const emit = defineEmits<{ (event: 'action'): void }>()
</script>
<style scoped>
.list-state {
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1rpx solid #e2e8f1;
  border-radius: 28rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 400rpx;
  padding: 48rpx 36rpx;
  text-align: center;
}


.empty-state {
  align-items: stretch;
  background: transparent;
  border: 0;
  border-radius: 0;
  min-height: 0;
  margin: 32rpx 8rpx 0;
  padding: 0;
  width: auto;
}

.empty-state-card {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #e7edf6;
  border-radius: 28rpx;
  box-shadow: 0 14rpx 34rpx rgba(48, 89, 150, 0.08);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 660rpx;
  padding: 46rpx 24rpx 40rpx;
  text-align: center;
  width: 100%;
}

.empty-illustration {
  height: 280rpx;
  position: relative;
  width: 320rpx;
}

.empty-illustration-shadow {
  background: #eef5ff;
  border-radius: 50%;
  bottom: 30rpx;
  height: 24rpx;
  left: 54rpx;
  position: absolute;
  width: 214rpx;
}

.empty-illustration-spark {
  background: #9dc4ff;
  border-radius: 999rpx;
  height: 30rpx;
  position: absolute;
  width: 7rpx;
}

.empty-illustration-spark::after {
  background: inherit;
  border-radius: inherit;
  content: '';
  height: 7rpx;
  position: absolute;
  width: 22rpx;
}

.empty-illustration-spark-left {
  left: 46rpx;
  top: 124rpx;
  transform: rotate(-38deg);
}

.empty-illustration-spark-left::after {
  left: -7rpx;
  top: 31rpx;
}

.empty-illustration-spark-right {
  right: 62rpx;
  top: 44rpx;
  transform: rotate(8deg);
}

.empty-illustration-spark-right::after {
  left: 13rpx;
  top: 31rpx;
  transform: rotate(45deg);
}

.empty-clipboard {
  bottom: 48rpx;
  height: 194rpx;
  left: 68rpx;
  position: absolute;
  width: 184rpx;
}

.empty-clipboard-sheet {
  background: #ffffff;
  border: 12rpx solid #dceaff;
  border-radius: 16rpx;
  bottom: 0;
  box-sizing: border-box;
  height: 180rpx;
  left: 12rpx;
  position: absolute;
  width: 158rpx;
}

.empty-clipboard-clip {
  background: #6fa6fb;
  border-radius: 10rpx;
  height: 28rpx;
  left: 55rpx;
  position: absolute;
  top: 0;
  width: 66rpx;
}

.empty-clipboard-clip-hole {
  background: #dceaff;
  border-radius: 50%;
  height: 12rpx;
  left: 27rpx;
  position: absolute;
  top: -7rpx;
  width: 12rpx;
}

.empty-clipboard-line {
  background: #d5e3f9;
  border-radius: 999rpx;
  height: 9rpx;
  left: 26rpx;
  position: absolute;
}

.empty-clipboard-line-long {
  top: 48rpx;
  width: 92rpx;
}

.empty-clipboard-line-medium {
  top: 78rpx;
  width: 98rpx;
}

.empty-clipboard-line-short {
  top: 108rpx;
  width: 70rpx;
}

.empty-clipboard-badge {
  align-items: center;
  background: #89b8ff;
  border-radius: 50%;
  bottom: -8rpx;
  display: flex;
  height: 82rpx;
  justify-content: center;
  position: absolute;
  right: -10rpx;
  width: 82rpx;
}

.empty-clipboard-minus {
  background: #ffffff;
  border-radius: 999rpx;
  height: 8rpx;
  width: 30rpx;
}

.empty-state-title {
  color: #1b2940;
  font-size: 38rpx;
  font-weight: 850;
  line-height: 1.35;
  margin-top: 4rpx;
}

.empty-state-detail {
  color: #7c8ba2;
  font-size: 26rpx;
  line-height: 1.6;
  margin-top: 14rpx;
  max-width: 620rpx;
}

.empty-state-action {
  align-items: center;
  background: #2878f2;
  border-radius: 20rpx;
  box-shadow: 0 12rpx 24rpx rgba(40, 120, 242, 0.22);
  color: #ffffff;
  display: flex;
  font-size: 28rpx;
  font-weight: 800;
  gap: 12rpx;
  height: 84rpx;
  justify-content: center;
  line-height: 1;
  margin: 32rpx 0 0;
  padding: 0;
  width: 320rpx;
}

.empty-state-action::after {
  border: 0;
}


</style>