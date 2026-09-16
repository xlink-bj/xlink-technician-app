<template>
  <view class="action-workspace-page">
    <scroll-view class="action-workspace-scroll" scroll-y enable-flex>
      <view class="action-workspace-body">
        <view class="action-workspace-context">
          <text class="action-workspace-context-label">当前工单</text>
          <view class="action-workspace-context-row">
            <text class="action-workspace-context-customer">{{ customerName || '工单' }}</text>
            <text v-if="displayNumber" class="action-workspace-context-number">#{{ displayNumber }}</text>
          </view>
        </view>

        <template v-if="lifecycle !== 'succeeded'">
          <slot />
        </template>
        <template v-else>
          <slot name="success" />
        </template>

        <view v-if="draftStatus !== 'clean'" class="action-workspace-draft-status" aria-live="polite">
          <text v-if="draftStatus === 'saving'">正在保存本地草稿</text>
          <text v-else-if="draftStatus === 'saved_local'">已保存到本地</text>
          <text v-else-if="draftStatus === 'restore_available'">已恢复本地草稿</text>
          <text v-else-if="draftStatus === 'save_failed'">本地草稿保存失败</text>
          <text v-else-if="draftStatus === 'dirty'">编辑未保存</text>
        </view>

        <view v-if="businessFeedback" class="action-workspace-business-feedback" aria-live="polite">
          <text>{{ businessFeedback }}</text>
        </view>

        <view v-if="lifecycle === 'submitting'" class="action-workspace-operation-status" aria-live="polite">
          <text>正在提交</text>
        </view>
      </view>
    </scroll-view>

    <view class="action-workspace-footer">
      <view class="action-workspace-footer-inner">
        <template v-if="lifecycle !== 'succeeded'">
          <slot name="actions">
            <button
              class="action-workspace-submit"
              :class="{ 'action-workspace-submit--disabled': !canSubmit }"
              :disabled="!canSubmit"
              @tap="$emit('submit')"
            >
              {{ lifecycle === 'submitting' ? '提交中' : submitLabel }}
            </button>
          </slot>
        </template>
        <template v-else>
          <slot name="success-actions" />
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ActionDraftStatus, ActionLifecycle } from '@runtimes/action'

defineProps<{
  readonly customerName?: string
  readonly displayNumber?: string
  readonly lifecycle: ActionLifecycle
  readonly draftStatus: ActionDraftStatus
  readonly canSubmit: boolean
  readonly submitLabel: string
  readonly businessFeedback?: string
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
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 100%;
  overflow: hidden;
  width: 100%;
}

.action-workspace-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
}

.action-workspace-body {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 960rpx;
  padding: 22rpx 24rpx 28rpx;
  width: 100%;
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

.action-workspace-draft-status,
.action-workspace-business-feedback,
.action-workspace-operation-status {
  color: #7e8da4;
  display: block;
  font-size: 20rpx;
  padding: 12rpx 4rpx 0;
  text-align: center;
}

.action-workspace-business-feedback { color: #f06445; font-size: 21rpx; line-height: 1.5; }
.action-workspace-operation-status { padding-top: 8rpx; }

.action-workspace-submit {
  background: #2878f2;
  border-radius: 14rpx;
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 800;
  height: 76rpx;
  line-height: 76rpx;
  margin: 0;
  width: 100%;
}

.action-workspace-footer {
  background: #f3f6fa;
  border-top: 1rpx solid #e4eaf2;
  box-sizing: border-box;
  flex-shrink: 0;
  padding: 12rpx 24rpx calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.action-workspace-footer-inner { margin: 0 auto; max-width: 960rpx; width: 100%; }

.action-workspace-submit--disabled { opacity: 0.48; }
.action-workspace-submit::after { border: 0; }
</style>
