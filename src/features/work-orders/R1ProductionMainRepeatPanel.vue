<template>
  <view class="main-repeat" data-testid="production-main-repeat">
    <view class="main-repeat__heading">
      <text class="main-repeat__title">重复提交记录</text>
      <text class="main-repeat__badge">仅查看</text>
    </view>
    <text class="main-repeat__hint">只读取当前工单已核验节点的记录摘要，不显示表单内容。</text>
    <text v-if="!node.runId || !node.formDefinitionId" class="main-repeat__notice"
      data-testid="main-repeat-unavailable">节点缺少已核验的流程或表单身份，暂不能读取。</text>
    <template v-else>
      <AppButton variant="secondary" size="compact" :disabled="read.state === 'loading'"
        :loading="read.state === 'loading'" @tap="$emit('read', String(node.id))"
        data-testid="main-repeat-read-button">
        {{ read.state === 'idle' ? '读取已保存记录（只读）' : '重新读取记录（只读）' }}
      </AppButton>
      <text v-if="read.state === 'idle'" class="main-repeat__hint" data-testid="main-repeat-unknown">
        尚未读取，记录数量未知。
      </text>
      <text v-else-if="read.state === 'loading'" class="main-repeat__hint" data-testid="main-repeat-loading">
        正在读取已保存记录…
      </text>
      <text v-else-if="read.state === 'failed_terminal' || read.state === 'failed_retryable'"
        class="main-repeat__notice" data-testid="main-repeat-error">
        {{ read.error?.category === 'authorization_denied'
          ? '当前身份或节点无权读取，记录未展示。'
          : '记录读取未成功，请稍后重试。' }}
      </text>
      <template v-else-if="read.state === 'succeeded'">
        <text v-if="read.entries.length === 0" class="main-repeat__hint" data-testid="main-repeat-empty">
          服务器明确返回空记录列表。
        </text>
        <template v-else>
          <text class="main-repeat__count" data-testid="main-repeat-count">
            已读取 {{ read.entries.length }} 条{{ read.hasMore ? '，尚有未读取记录' : '' }}
          </text>
          <view v-for="(entry, index) in read.entries" :key="String(entry.id)"
            class="main-repeat__entry" data-testid="main-repeat-record">
            <text class="main-repeat__ordinal">{{ index + 1 }}</text>
            <view class="main-repeat__entry-main">
              <text class="main-repeat__entry-title">{{ entry.title || '未命名记录' }}</text>
              <text class="main-repeat__state">{{ stateLabel(entry.state) }}</text>
            </view>
          </view>
        </template>
      </template>
    </template>
  </view>
</template>

<script setup lang="ts">
import type { R1NodeFormReference, WorkflowNodeRead } from '@shared/ports'
import type { R1RepeatRecordsReadState } from './detail'
import AppButton from '@shared/ui/AppButton.vue'

defineProps<{ readonly node: WorkflowNodeRead; readonly read: R1RepeatRecordsReadState }>()
defineEmits<{ (event: 'read', nodeId: string): void }>()
function stateLabel(state: R1NodeFormReference['state']): string {
  return state === 'active' ? '已保存' : state === 'deleted' ? '已删除' : '状态待核验'
}
</script>

<style scoped>
.main-repeat { background: #fff; border: 1rpx solid #e0e7ef; border-radius: 20rpx; margin-top: 20rpx; padding: 28rpx; }
.main-repeat__heading, .main-repeat__entry { display: flex; align-items: center; gap: 18rpx; }
.main-repeat__heading { justify-content: space-between; }
.main-repeat__title { color: #1d304b; font-size: 33rpx; font-weight: 650; }
.main-repeat__badge { background: #edf4ff; border-radius: 999rpx; color: #2878f2; flex-shrink: 0; font-size: 22rpx; padding: 7rpx 13rpx; }
.main-repeat__hint, .main-repeat__state { color: #68788f; display: block; font-size: 24rpx; line-height: 1.6; margin-top: 14rpx; }
.main-repeat__notice { color: #985919; display: block; font-size: 24rpx; line-height: 1.6; margin-top: 14rpx; }
.main-repeat__count { color: #263b55; display: block; font-size: 26rpx; font-weight: 600; margin-top: 22rpx; }
.main-repeat__entry { border-top: 1rpx solid #e7edf5; min-height: 86rpx; margin-top: 12rpx; padding-top: 12rpx; }
.main-repeat__ordinal { color: #7385a0; font-size: 25rpx; width: 35rpx; }
.main-repeat__entry-main { flex: 1; min-width: 0; }
.main-repeat__entry-title { color: #263b55; display: block; font-size: 28rpx; font-weight: 600; overflow-wrap: anywhere; }
</style>
