<template>
  <view v-if="parents.length" class="child-forms" data-testid="production-child-form-view">
    <view class="child-forms__header">
      <text class="child-forms__heading">子流程节点</text>
      <text class="child-forms__readonly">仅查看</text>
    </view>
    <text class="child-forms__hint">查看当前工单的子流程进度。此处仅供查看，暂不支持编辑或提交。</text>

    <view v-for="parent in parents" :key="String(parent.id)" class="child-forms__parent">
      <view class="child-forms__parent-main">
        <text class="child-forms__name">{{ parent.displayName || '子流程' }}</text>
        <AppButton size="compact" variant="secondary" :disabled="state === 'loading'"
          @tap="$emit('load-child', String(parent.id))">
          {{ selectedParentId === String(parent.id) ? '重新读取' : '查看节点' }}
        </AppButton>
      </view>
    </view>

    <view v-if="selectedParentId" class="child-forms__results">
      <text v-if="state === 'loading'" class="child-forms__hint" data-testid="child-form-loading">正在读取子流程…</text>
      <text v-else-if="state === 'failed_terminal' || state === 'failed_retryable'"
        class="child-forms__notice" data-testid="child-form-error">
        {{ error?.category === 'authorization_denied' ? '当前角色无权读取该子流程。' : '子流程读取未成功，可重新尝试。' }}
      </text>
      <template v-else-if="state === 'succeeded'">
        <text v-if="!nodes.length" class="child-forms__hint" data-testid="child-form-empty">
          当前子流程响应没有节点记录。
        </text>
        <view v-for="node in nodes" :key="String(node.id)" class="child-forms__node"
          data-testid="child-form-node">
          <view class="child-forms__node-heading">
            <text class="child-forms__name">{{ node.displayName || (node.sourceNodeType === 'repeat' ? '重复表单' : node.sourceNodeType === 'forms' ? '多表单' : '子流程步骤') }}</text>
            <text class="child-forms__type">{{ node.sourceNodeType === 'repeat' ? '重复记录' : node.sourceNodeType === 'forms' ? '表单集合' : '类型未定义' }}</text>
          </view>

          <text v-if="node.lifecycle === 'inactive'" class="child-forms__notice">该节点已取消，仅供核对历史流程。</text>

          <template v-if="node.sourceNodeType === 'forms'">
            <text v-if="!node.formList" class="child-forms__hint">节点尚未提供表单列表；不能据此判断记录数。</text>
            <text v-else-if="node.formList.evidence !== 'available'" class="child-forms__notice">表单列表结构待核验。</text>
            <template v-else>
              <text class="child-forms__hint">已提供 {{ node.formList.entries.length }} 条引用{{ node.formList.truncated ? '（列表截断）' : '' }}</text>
              <view v-for="(entry, index) in node.formList.entries" :key="String(entry.id)"
                class="child-forms__entry" data-testid="child-form-record">
                <text class="child-forms__ordinal">{{ index + 1 }}</text>
                <view class="child-forms__entry-main">
                  <text class="child-forms__entry-title">{{ entry.title || '未命名表单' }}</text>
                  <text class="child-forms__hint">{{ stateLabel(entry.state) }}</text>
                </view>
              </view>
              <text v-if="!node.formList.entries.length" class="child-forms__hint">节点明确返回空列表。</text>
            </template>
          </template>

          <template v-else-if="node.sourceNodeType === 'repeat'">
            <text v-if="!node.runId || !node.formDefinitionId" class="child-forms__notice">
              缺少服务端流程或表单定义身份，不能读取记录。
            </text>
            <template v-else>
              <AppButton size="compact" variant="secondary" :disabled="repeatByNode[String(node.id)]?.state === 'loading'"
                @tap="$emit('load-repeat', String(node.id))">读取前 20 条已保存记录</AppButton>
              <text v-if="repeatByNode[String(node.id)]?.state === 'loading'" class="child-forms__hint"
                data-testid="child-repeat-loading">正在读取重复表单记录…</text>
              <text v-else-if="isFailure(repeatByNode[String(node.id)]?.state)" class="child-forms__notice"
                data-testid="child-repeat-error">记录读取未成功；已保留只读保护，可重新尝试。</text>
              <template v-else-if="repeatByNode[String(node.id)]?.state === 'succeeded'">
                <view v-for="(entry, index) in repeatByNode[String(node.id)]?.entries ?? []" :key="String(entry.id)"
                  class="child-forms__entry" data-testid="child-repeat-record">
                  <text class="child-forms__ordinal">{{ index + 1 }}</text>
                  <view class="child-forms__entry-main">
                    <text class="child-forms__entry-title">{{ entry.title || '未命名记录' }}</text>
                    <text class="child-forms__hint">{{ stateLabel(entry.state) }}</text>
                  </view>
                </view>
                <text v-if="!repeatByNode[String(node.id)]?.entries.length" class="child-forms__hint">服务器明确返回空记录列表。</text>
                <text v-if="repeatByNode[String(node.id)]?.hasMore" class="child-forms__hint">当前只读列表未证实包含全部记录；更多记录尚未读取。</text>
              </template>
            </template>
          </template>
          <template v-else>
            <text v-if="node.formDefinitionId && node.formDefinitionIdEvidence" class="child-forms__hint" data-testid="child-form-generic-reference">
              已识别关联表单定义的只读身份；具体表单内容尚未读取。
            </text>
            <text v-else class="child-forms__hint">该节点未提供可信的表单定义引用。</text>
            <text class="child-forms__notice" data-testid="child-form-untyped-guard">来源没有 forms/repeat 动作类型，不能据此读取重复记录或启用表单操作。</text>
          </template>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { WorkflowNodeRead, R1NodeFormReference } from '@shared/ports'
import type { OperationError } from '@shared/types'
import type { R1RepeatRecordsReadState, WorkOrderDetailLoadState } from './detail'
import AppButton from '@shared/ui/AppButton.vue'

defineProps<{
  readonly parents: readonly WorkflowNodeRead[]
  readonly selectedParentId: string | null
  readonly nodes: readonly WorkflowNodeRead[]
  readonly state: WorkOrderDetailLoadState
  readonly error: OperationError | null
  readonly repeatByNode: Readonly<Record<string, R1RepeatRecordsReadState>>
}>()
defineEmits<{
  (event: 'load-child', id: string): void
  (event: 'load-repeat', id: string): void
}>()
function stateLabel(state: R1NodeFormReference['state']): string {
  return state === 'active' ? '已保存' : state === 'deleted' ? '已删除' : '状态待核验'
}
function isFailure(state?: WorkOrderDetailLoadState): boolean {
  return state === 'failed_terminal' || state === 'failed_retryable'
}
</script>

<style scoped>
.child-forms { background: #fff; border: 1rpx solid #e0e7ef; border-radius: 20rpx; margin-top: 20rpx; padding: 28rpx 28rpx 24rpx; }
.child-forms__header, .child-forms__parent-main, .child-forms__node-heading, .child-forms__entry { display: flex; align-items: center; gap: 18rpx; }
.child-forms__header, .child-forms__parent-main, .child-forms__node-heading { justify-content: space-between; }
.child-forms__heading { color: #1d304b; font-size: 33rpx; font-weight: 720; }
.child-forms__readonly, .child-forms__type { background: #edf4ff; border-radius: 999rpx; color: #2878f2; flex-shrink: 0; font-size: 22rpx; padding: 7rpx 13rpx; }
.child-forms__hint { color: #68788f; display: block; font-size: 24rpx; line-height: 1.6; margin-top: 14rpx; }
.child-forms__notice { color: #985919; display: block; font-size: 24rpx; line-height: 1.6; margin-top: 14rpx; }
.child-forms__parent { border-top: 1rpx solid #eef1f5; margin-top: 20rpx; padding-top: 18rpx; }
.child-forms__name { color: #263b55; flex: 1; font-size: 28rpx; font-weight: 650; min-width: 0; }
.child-forms__results { border-top: 1rpx solid #e6edf5; margin-top: 22rpx; padding-top: 14rpx; }
.child-forms__node { background: #f8fafd; border: 1rpx solid #e6edf6; border-radius: 16rpx; margin-top: 16rpx; padding: 20rpx; }
.child-forms__entry { border-top: 1rpx solid #e7edf5; min-height: 86rpx; margin-top: 12rpx; padding-top: 12rpx; }
.child-forms__ordinal { color: #7385a0; font-size: 25rpx; width: 35rpx; }
.child-forms__entry-main { flex: 1; min-width: 0; }
.child-forms__entry-title { color: #263b55; display: block; font-size: 28rpx; font-weight: 600; word-break: break-all; }
</style>
