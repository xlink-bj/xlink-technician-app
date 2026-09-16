<template>
  <view class="action-workspace-page">
    <view class="action-workspace-header">
      <button class="action-workspace-back" aria-label="返回工单详情" @tap="$emit('exit')">
        <text aria-hidden="true">‹</text>
      </button>
      <text class="action-workspace-header-title">{{ title }}</text>
      <view class="action-workspace-header-spacer" aria-hidden="true" />
    </view>

    <view class="action-workspace-body">
      <view class="action-workspace-context">
        <text class="action-workspace-context-label">当前工单</text>
        <view class="action-workspace-context-row">
          <text class="action-workspace-context-customer">{{ customerName || '工单' }}</text>
          <text v-if="displayNumber" class="action-workspace-context-number">#{{ displayNumber }}</text>
        </view>
      </view>

      <slot />

      <view class="action-workspace-status" aria-live="polite">
        <text v-if="draftStatus === 'saving'">正在保存本地草稿</text>
        <text v-else-if="draftStatus === 'saved_local'">已保存到本地</text>
        <text v-else-if="draftStatus === 'restore_available'">已恢复本地草稿</text>
        <text v-else-if="draftStatus === 'save_failed'">本地草稿保存失败</text>
        <text v-else-if="draftStatus === 'dirty'">编辑未保存</text>
        <text v-else-if="lifecycle === 'submitting'">正在提交</text>
        <text v-else-if="lifecycle === 'succeeded'">已完成</text>
      </view>

      <slot name="feedback" />

      <button
        v-if="lifecycle !== 'succeeded'"
        class="action-workspace-submit"
        :disabled="!canSubmit"
        @tap="$emit('submit')"
      >
        {{ lifecycle === 'submitting' ? '提交中' : submitLabel }}
      </button>
      <view v-else class="action-workspace-success" aria-live="polite">
        <text class="action-workspace-success-title">操作已完成</text>
        <text class="action-workspace-success-copy">{{ successCopy || '工单状态已刷新，即将返回工单详情。' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ActionDraftStatus, ActionLifecycle } from '@runtimes/action'

defineProps<{
  readonly title: string
  readonly customerName?: string
  readonly displayNumber?: string
  readonly lifecycle: ActionLifecycle
  readonly draftStatus: ActionDraftStatus
  readonly canSubmit: boolean
  readonly submitLabel: string
  readonly successCopy?: string
}>()

defineEmits<{
  (event: 'exit'): void
  (event: 'submit'): void
}>()
</script>

<style>
.action-workspace-page {
  background: #f3f6fa;
  box-sizing: border-box;
  min-height: 100vh;
  padding-bottom: calc(46rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.action-workspace-header {
  align-items: center;
  background: #ffffff;
  display: flex;
  height: 96rpx;
  justify-content: space-between;
  padding: 0 24rpx;
  position: relative;
}

.action-workspace-back {
  align-items: center;
  background: transparent;
  color: #172239;
  display: flex;
  font-size: 58rpx;
  height: 72rpx;
  justify-content: flex-start;
  line-height: 72rpx;
  margin: 0;
  padding: 0;
  width: 72rpx;
}

.action-workspace-back::after { border: 0; }

.action-workspace-header-title {
  color: #172239;
  font-size: 30rpx;
  font-weight: 800;
  left: 50%;
  position: absolute;
  transform: translateX(-50%);
}

.action-workspace-header-spacer { width: 72rpx; }

.action-workspace-body {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 960rpx;
  padding: 22rpx 24rpx 0;
}

.action-workspace-context,
.action-workspace-content {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 34rpx rgba(32, 55, 90, 0.07);
}

.action-workspace-context { padding: 22rpx 24rpx; }

.action-workspace-context-label {
  color: #8290a4;
  display: block;
  font-size: 20rpx;
}

.action-workspace-context-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-top: 8rpx;
}

.action-workspace-context-customer {
  color: #172239;
  font-size: 26rpx;
  font-weight: 800;
  max-width: 72%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-workspace-context-number {
  color: #627492;
  font-size: 22rpx;
  font-weight: 800;
}

.action-workspace-status {
  color: #7e8da4;
  font-size: 20rpx;
  min-height: 32rpx;
  padding: 12rpx 4rpx 0;
  text-align: center;
}

.action-workspace-submit {
  background: #2878f2;
  border-radius: 14rpx;
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 800;
  height: 76rpx;
  line-height: 76rpx;
  margin: 18rpx 0 0;
  width: 100%;
}

.action-workspace-submit[disabled] { opacity: 0.48; }
.action-workspace-submit::after { border: 0; }

.action-workspace-success {
  align-items: center;
  background: #f7fffa;
  border: 1rpx solid #ccefdc;
  border-radius: 18rpx;
  display: flex;
  flex-direction: column;
  margin-top: 14rpx;
  padding: 22rpx;
  text-align: center;
}

.action-workspace-success-title {
  color: #18ae65;
  font-size: 26rpx;
  font-weight: 800;
}

.action-workspace-success-copy {
  color: #6f8098;
  font-size: 20rpx;
  margin-top: 8rpx;
}
</style>
