<template>
  <view class="local-draft-panel home-surface">
    <view class="local-draft-heading">
      <view class="local-draft-heading-copy">
        <text class="local-draft-title">本地草稿</text>
        <text class="local-draft-subtitle">开发诊断 · 仅显示草稿元数据</text>
      </view>
      <text class="local-draft-count">{{ unfinishedTotal }} 个未完成</text>
    </view>

    <view class="local-draft-actions">
      <button class="local-draft-action" :disabled="loading" @tap="emit('refresh')">
        {{ loading ? '读取中…' : '刷新' }}
      </button>
      <button
        v-if="seedAvailable"
        class="local-draft-action local-draft-action-primary"
        :disabled="loading"
        @tap="emit('seed')"
      >
        生成 Mock 草稿
      </button>
      <button
        v-if="cleanupAvailable"
        class="local-draft-action local-draft-action-danger"
        :disabled="loading"
        @tap="emit('clear')"
      >
        清除 Mock 草稿
      </button>
    </view>

    <view v-if="error" class="local-draft-message local-draft-message-error">
      本地草稿读取失败，请重试
    </view>
    <view v-else-if="entries.length === 0" class="local-draft-message">
      暂无本地草稿
    </view>
    <view v-else class="local-draft-list">
      <view
        v-for="entry in entries"
        :key="entryKey(entry)"
        class="local-draft-entry"
      >
        <view class="local-draft-entry-copy">
          <text class="local-draft-entry-title">
            {{ entry.identity.workOrderId }} · {{ actionLabel(entry.identity.actionIntent) }}
          </text>
          <text class="local-draft-entry-meta">
            {{ entry.identity.workflowNodeId }} · {{ contentLabel(entry.identity.contentKind) }} · {{ entry.status === 'unfinished' ? '未完成' : '已完成' }}
          </text>
          <text class="local-draft-entry-time">最近保存：{{ entry.updatedAt }}</text>
        </view>
        <navigator v-if="entry.openRoute" class="local-draft-open" :url="entry.openRoute">
          打开
        </navigator>
      </view>
    </view>

    <text v-if="invalidTotal > 0" class="local-draft-invalid">
      发现 {{ invalidTotal }} 条不可识别记录，已安全忽略
    </text>
  </view>
</template>

<script setup lang="ts">
import type { LocalDraftDiagnosticEntry } from '@features/home/draft-diagnostics'

defineProps<{
  readonly mockMode: 'off' | 'data' | 'empty'
  readonly loading: boolean
  readonly entries: readonly LocalDraftDiagnosticEntry[]
  readonly unfinishedTotal: number
  readonly invalidTotal: number
  readonly error: unknown
  readonly seedAvailable: boolean
  readonly cleanupAvailable: boolean
}>()

const emit = defineEmits<{
  refresh: []
  seed: []
  clear: []
}>()

function entryKey(entry: LocalDraftDiagnosticEntry): string {
  const identity = entry.identity
  return [
    identity.userId,
    identity.workOrderId,
    identity.workflowNodeId,
    identity.actionIntent,
    identity.contentKind,
    identity.contentIdentity ?? 'none',
  ].join(':')
}

function actionLabel(intent: string): string {
  const labels: Record<string, string> = {
    set_appointment: '预约上门',
    interact_with_form: '填写表单',
    quotation: '报价',
  }
  return labels[intent] ?? '其他 Action'
}

function contentLabel(kind: string): string {
  const labels: Record<string, string> = {
    dynamic_form: '动态表单',
    quotation: '报价内容',
    contract: '合同内容',
    media_signature: '媒体/签名',
    composite: '组合内容',
    unsupported: '暂不支持',
  }
  return labels[kind] ?? '未知内容'
}
</script>

<style>
.local-draft-panel {
  border: 1rpx solid rgba(23, 105, 223, 0.22);
  box-shadow: 0 12rpx 28rpx rgba(28, 66, 117, 0.05);
}

.local-draft-heading {
  align-items: flex-start;
  display: flex;
  gap: 16rpx;
  justify-content: space-between;
}

.local-draft-heading-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.local-draft-title {
  color: #1d3154;
  font-size: 28rpx;
  font-weight: 800;
}

.local-draft-subtitle,
.local-draft-entry-meta,
.local-draft-entry-time {
  color: #8a98ad;
  font-size: 21rpx;
  line-height: 1.5;
  margin-top: 6rpx;
}

.local-draft-count {
  background: #eef4ff;
  border: 1rpx solid #cbdcff;
  border-radius: 999rpx;
  color: #296bcf;
  flex: 0 0 auto;
  font-size: 21rpx;
  font-weight: 800;
  padding: 10rpx 14rpx;
}

.local-draft-actions {
  border-top: 1rpx solid #edf1f7;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
  padding-top: 20rpx;
}

.local-draft-action {
  background: #f4f7fc;
  border: 1rpx solid #d9e3f2;
  border-radius: 999rpx;
  color: #637593;
  font-size: 22rpx;
  line-height: 1;
  margin: 0;
  min-height: 56rpx;
  padding: 0 18rpx;
}

.local-draft-action::after {
  border: 0;
}

.local-draft-action-primary {
  background: #eaf2ff;
  border-color: #a9c6fb;
  color: #1769df;
}

.local-draft-action-danger {
  background: #fff4f1;
  border-color: #ffd1c8;
  color: #d65a48;
}

.local-draft-message {
  color: #71829e;
  font-size: 23rpx;
  padding: 24rpx 0 4rpx;
  text-align: center;
}

.local-draft-message-error,
.local-draft-invalid {
  color: #bf6b31;
}

.local-draft-list {
  display: flex;
  flex-direction: column;
}

.local-draft-entry {
  align-items: center;
  border-top: 1rpx solid #f0f3f8;
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
}

.local-draft-entry-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.local-draft-entry-title {
  color: #243858;
  font-size: 23rpx;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-draft-entry-time {
  font-size: 20rpx;
}

.local-draft-open {
  border: 1rpx solid #a9c6fb;
  border-radius: 999rpx;
  color: #1769df;
  flex: 0 0 auto;
  font-size: 22rpx;
  padding: 10rpx 16rpx;
}

.local-draft-invalid {
  display: block;
  font-size: 20rpx;
  margin-top: 16rpx;
}
</style>
