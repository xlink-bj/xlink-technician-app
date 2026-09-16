<template>
  <view v-if="session.status === 'unknown'" class="workspace-state workspace-state--centered">
    <view class="workspace-state-mark" aria-hidden="true" />
    <text class="workspace-state-title">正在准备操作空间</text>
  </view>

  <view v-else-if="!canAccess" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">需要登录</text>
    <text class="workspace-state-copy">登录后才能处理当前工单。</text>
    <navigator class="workspace-state-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else-if="routeError || workspace.loadState === 'blocked'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">当前操作暂不可用</text>
    <text class="workspace-state-copy">请返回工单详情，按当前任务继续操作。</text>
    <button class="workspace-state-action" @tap="exit">返回工单详情</button>
  </view>

  <view v-else-if="workspace.loadState === 'loading'" class="workspace-state workspace-state--centered">
    <view class="workspace-loading-card" aria-hidden="true">
      <view class="workspace-loading-line workspace-loading-line--short" />
      <view class="workspace-loading-line workspace-loading-line--long" />
      <view class="workspace-loading-block" />
      <view class="workspace-loading-block workspace-loading-block--tall" />
    </view>
    <text class="workspace-state-title">正在准备操作内容</text>
  </view>

  <view v-else-if="workspace.loadState === 'failed_retryable'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">暂时无法打开操作</text>
    <text class="workspace-state-copy">请检查网络后重试，已保存的本地草稿不会丢失。</text>
    <button class="workspace-state-action" @tap="reload">重新加载</button>
  </view>

  <view v-else-if="workspace.loadState === 'failed_terminal'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">操作内容暂不可用</text>
    <text class="workspace-state-copy">请返回工单详情后再次尝试。</text>
    <button class="workspace-state-action" @tap="reload">再次尝试</button>
  </view>

  <ActionWorkspaceShell
    v-else-if="workspace.descriptor && workspace.appointmentForm"
    :title="workspace.descriptor.title"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="workspace.canSubmit"
    :success-copy="successCopy"
    submit-label="确认预约"
    @exit="exit"
    @submit="submit"
  >
    <view class="action-workspace-content">
      <view class="action-content-heading">
        <text class="action-content-title">{{ workspace.descriptor.title }}</text>
        <text class="action-content-caption">请填写客户确认的上门安排</text>
      </view>

      <view v-for="field in workspace.appointmentFields" :key="field.key" class="action-content-field">
        <text class="action-content-label">
          {{ field.label }}<text v-if="field.runtime.required" class="action-content-required"> *</text>
        </text>
        <view v-if="field.options?.length" class="action-content-options">
          <button
            v-for="option in field.options"
            :key="option.value"
            class="action-content-option"
            :class="{ 'action-content-option--selected': String(workspace.appointmentForm.values[field.key] ?? '') === option.value }"
            :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
            @tap="setField(field.key, option.value)"
          >
            {{ option.label }}
          </button>
        </view>
        <textarea
          v-else-if="field.type === 'textarea'"
          class="action-content-textarea"
          :value="String(workspace.appointmentForm.values[field.key] ?? '')"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @input="updateField(field.key, $event)"
        />
        <input
          v-else
          class="action-content-input"
          :value="String(workspace.appointmentForm.values[field.key] ?? '')"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @input="updateField(field.key, $event)"
        />
      </view>
    </view>

    <template #feedback>
      <text v-if="feedback" class="action-workspace-feedback" :class="{ 'action-workspace-feedback--success': workspace.lifecycle === 'succeeded' }">
        {{ feedback }}
      </text>
      <text v-if="workspace.draftMessage" class="action-workspace-draft-message">{{ workspace.draftMessage }}</text>
    </template>
  </ActionWorkspaceShell>

  <view v-else class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">操作内容暂不可用</text>
    <button class="workspace-state-action" @tap="exit">返回工单详情</button>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'

import { hasAuthenticatedSession } from '@features/home/access'
import {
  parseActionWorkspaceId,
  parseActionWorkspaceNodeId,
  useActionWorkspaceStore,
} from '@features/work-orders/action-workspace'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import type { OperationError } from '@shared/types'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const routeReady = ref(false)
const routeId = ref<ReturnType<typeof parseActionWorkspaceId>>(null)
const routeNodeId = ref<ReturnType<typeof parseActionWorkspaceNodeId>>(null)
const routeAction = ref<string | undefined>(undefined)
const routeError = ref('')
let successTimer: ReturnType<typeof setTimeout> | undefined

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const feedback = computed(() => {
  if (workspace.lifecycle === 'succeeded') {
    if (workspace.refreshStatus === 'pending') return '预约已提交，工单状态刷新暂不可用，请稍后查看。'
    if (workspace.draftFinalization === 'pending') return '预约已提交，本地草稿清理待完成。'
    return '预约已提交'
  }
  return actionErrorCopy(workspace.error)
})
const successCopy = computed(() => workspace.refreshStatus === 'pending'
  ? '预约已提交，状态刷新暂不可用，请稍后返回工单详情。'
  : workspace.draftFinalization === 'pending'
    ? '工单状态已刷新，本地草稿清理待完成。'
    : '工单状态已刷新，即将返回工单详情。')

function loadWorkspace(): void {
  if (!routeReady.value || session.status !== 'authenticated') return
  if (!routeId.value || !routeNodeId.value) {
    routeError.value = 'invalid-route'
    workspace.clear()
    return
  }
  routeError.value = ''
  void workspace.load({
    workOrderId: routeId.value,
    workflowNodeId: routeNodeId.value,
    ...(routeAction.value ? { actionIntent: routeAction.value } : {}),
  })
}

onLoad((options) => {
  routeId.value = parseActionWorkspaceId(options?.id)
  routeNodeId.value = parseActionWorkspaceNodeId(options?.node)
  routeAction.value = typeof options?.action === 'string' ? options.action : undefined
  routeReady.value = true
})

onUnload(() => {
  void workspace.flushDraft()
})

watch(
  [() => session.status, routeReady],
  ([status, ready]) => {
    if (ready && status === 'authenticated') loadWorkspace()
    if (status !== 'authenticated' && status !== 'unknown') workspace.clear()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (successTimer) clearTimeout(successTimer)
})

async function exit(): Promise<void> {
  const result = await workspace.exit()
  if (result.state !== 'succeeded') routeError.value = 'draft-save-failed'
}

async function reload(): Promise<void> {
  loadWorkspace()
}

function setField(key: string, value: string): void {
  workspace.setField(key, value)
}

function updateField(key: string, event: unknown): void {
  const input = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
  const detail = typeof input.detail === 'object' && input.detail !== null
    ? input.detail as Record<string, unknown>
    : {}
  workspace.setField(key, typeof detail.value === 'string' ? detail.value : '')
}

async function submit(): Promise<void> {
  const result = await workspace.submit()
  if (result.state === 'succeeded' && workspace.refreshStatus === 'refreshed' && workspace.draftFinalization === 'completed') {
    successTimer = setTimeout(() => { void workspace.exit() }, 520)
  }
}

function actionErrorCopy(error: OperationError | null): string {
  if (!error) return ''
  switch (error.category) {
    case 'validation':
      return '请补充必填信息后再提交。'
    case 'network_retryable':
      return '网络暂时不可用，输入已保留，请重试。'
    case 'unsupported_capability':
      return '当前操作暂不可用。'
    case 'session_invalid':
      return '登录状态已失效，请重新登录。'
    default:
      return '提交失败，输入已保留，请稍后重试。'
  }
}

</script>

<style>
.workspace-state {
  background: #f3f6fa;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx;
  width: 100%;
}

.workspace-state--centered {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.workspace-state-mark {
  background: #dce9ff;
  border-radius: 50%;
  height: 64rpx;
  margin-bottom: 20rpx;
  width: 64rpx;
}

.workspace-state-title {
  color: #1d2b40;
  font-size: 28rpx;
  font-weight: 800;
}

.workspace-state-copy {
  color: #7e8da4;
  font-size: 22rpx;
  line-height: 1.6;
  margin-top: 10rpx;
  max-width: 620rpx;
}

.workspace-state-link {
  color: #2878f2;
  font-size: 24rpx;
  font-weight: 700;
  margin-top: 22rpx;
}

.workspace-state-action {
  background: #2878f2;
  border-radius: 14rpx;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 800;
  height: 70rpx;
  line-height: 70rpx;
  margin-top: 24rpx;
  width: 300rpx;
}

.workspace-state-action::after { border: 0; }

.workspace-loading-card {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-sizing: border-box;
  margin-bottom: 22rpx;
  padding: 26rpx;
  width: 100%;
}

.workspace-loading-line,
.workspace-loading-block {
  animation: workspace-pulse 1.5s ease-in-out infinite;
  background: #edf2f7;
  border-radius: 999rpx;
}

.workspace-loading-line { height: 24rpx; }
.workspace-loading-line--short { width: 30%; }
.workspace-loading-line--long { margin-top: 18rpx; width: 56%; }
.workspace-loading-block { border-radius: 14rpx; height: 72rpx; margin-top: 26rpx; }
.workspace-loading-block--tall { height: 160rpx; margin-top: 16rpx; }

.action-workspace-content {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 34rpx rgba(32, 55, 90, 0.07);
  margin-top: 18rpx;
  padding: 26rpx;
}

.action-content-heading {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.action-content-title {
  color: #1d2b40;
  font-size: 28rpx;
  font-weight: 800;
}

.action-content-caption,
.action-content-label {
  color: #7b8aa1;
  font-size: 21rpx;
}

.action-content-field { margin-top: 22rpx; }

.action-content-label {
  display: block;
  margin-bottom: 10rpx;
}

.action-content-required { color: #f06445; }

.action-content-input,
.action-content-textarea {
  background: #f8fafc;
  border: 1rpx solid #e1e8f1;
  border-radius: 12rpx;
  box-sizing: border-box;
  color: #1d2b40;
  font-size: 24rpx;
  padding: 0 18rpx;
  width: 100%;
}

.action-content-input { height: 72rpx; }
.action-content-textarea { min-height: 132rpx; padding-top: 16rpx; }

.action-content-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.action-content-option {
  background: #f5f8fc;
  border: 1rpx solid #e1e8f1;
  border-radius: 999rpx;
  color: #61728e;
  font-size: 22rpx;
  line-height: 58rpx;
  margin: 0;
  min-height: 58rpx;
  padding: 0 22rpx;
}

.action-content-option--selected {
  background: #edf4ff;
  border-color: #8db9ff;
  color: #2878f2;
}

.action-content-option::after { border: 0; }

.action-workspace-feedback,
.action-workspace-draft-message {
  color: #f06445;
  display: block;
  font-size: 21rpx;
  line-height: 1.5;
  margin-top: 12rpx;
  text-align: center;
}

.action-workspace-draft-message { color: #7e8da4; }
.action-workspace-feedback--success { color: #18ae65; }

@keyframes workspace-pulse {
  0%, 100% { opacity: 0.56; }
  50% { opacity: 1; }
}
</style>
