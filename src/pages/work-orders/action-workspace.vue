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
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="workspace.canSubmit"
    :business-feedback="feedback"
    submit-label="继续确认"
    @submit="continueToConfirmation"
  >
    <view class="action-workspace-content" :data-field-count="workspace.appointmentFields.length">
      <view class="action-content-heading">
        <view class="action-content-title-row">
          <view class="action-content-icon" aria-hidden="true">▣</view>
          <text class="action-content-title">预约信息</text>
        </view>
        <text class="action-content-caption">请与客户确认上门时间安排</text>
      </view>

      <view v-if="workspace.appointmentChoiceField" class="action-content-field action-content-field--choice">
        <text class="action-content-label">
          {{ workspace.appointmentChoiceField.label }}<text v-if="workspace.appointmentChoiceField.runtime.required" class="action-content-required"> *</text>
        </text>
        <view class="action-content-options">
          <button
            v-for="option in workspace.appointmentChoiceField.options"
            :key="option.value"
            class="action-content-option"
            :class="{ 'action-content-option--selected': String(workspace.appointmentForm.values[workspace.appointmentChoiceField.key] ?? '') === option.value }"
            :disabled="workspace.appointmentChoiceField.runtime.readOnly || workspace.lifecycle === 'submitting'"
            @tap="setField(workspace.appointmentChoiceField.key, option.value)"
          >
            {{ option.label }}
          </button>
        </view>
      </view>

      <view v-if="workspace.appointmentTimeField" class="action-content-field">
        <text class="action-content-label">
          {{ workspace.appointmentTimeField.label }}<text v-if="workspace.appointmentTimeField.runtime.required" class="action-content-required"> *</text>
        </text>
        <button
          class="appointment-time-selector"
          :disabled="workspace.appointmentTimeField.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @tap="openTimeSelection"
        >
          <view v-if="appointmentDisplay" class="appointment-time-selected">
            <text class="appointment-time-selected-date">{{ appointmentDisplay.dateLabel }}</text>
            <text class="appointment-time-selected-value">{{ appointmentDisplay.timeLabel }}</text>
          </view>
          <text v-else class="appointment-time-placeholder">请选择上门时间</text>
          <text class="appointment-time-chevron" aria-hidden="true">›</text>
        </button>
      </view>

      <view v-if="workspace.appointmentNoteField" class="action-content-field action-content-field--note">
        <text class="action-content-label">
          {{ workspace.appointmentNoteField.label }}<text v-if="workspace.appointmentNoteField.runtime.required" class="action-content-required"> *</text><text v-else>（选填）</text>
        </text>
        <textarea
          class="action-content-note"
          :value="String(workspace.appointmentForm.values[workspace.appointmentNoteField.key] ?? '')"
          maxlength="-1"
          :disabled="workspace.appointmentNoteField.runtime.readOnly || workspace.lifecycle === 'submitting'"
          placeholder="请填写与客户沟通的其他信息"
          @input="updateField(workspace.appointmentNoteField.key, $event)"
        />
      </view>

      <view v-for="field in workspace.appointmentExtraFields" :key="field.key" class="action-content-field">
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
          class="action-content-note"
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

  </ActionWorkspaceShell>

  <view v-else class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">操作内容暂不可用</text>
    <button class="workspace-state-action" @tap="exit">返回工单详情</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'

import { hasAuthenticatedSession } from '@features/home/access'
import {
  parseActionWorkspaceId,
  parseActionWorkspaceNodeId,
  useActionWorkspaceStore,
} from '@features/work-orders/action-workspace'
import { appointmentDisplayFor } from '@features/work-orders/appointment-time'
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

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const appointmentDisplay = computed(() => appointmentDisplayFor(workspace.appointmentTimeValue))
const feedback = computed(() => actionErrorCopy(workspace.error))

function loadWorkspace(): void {
  if (!routeReady.value || session.status !== 'authenticated') return
  if (!routeId.value || !routeNodeId.value) {
    routeError.value = 'invalid-route'
    workspace.clear()
    return
  }
  routeError.value = ''
  void workspace.ensureLoaded({
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

async function exit(): Promise<void> {
  const result = await workspace.exit()
  if (result.state !== 'succeeded') routeError.value = 'draft-save-failed'
}

function reload(): void {
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

async function openTimeSelection(): Promise<void> {
  await workspace.openAppointmentTimeSelection()
}

async function continueToConfirmation(): Promise<void> {
  await workspace.continueToConfirmation()
}

function actionErrorCopy(error: OperationError | null): string {
  if (!error) return ''
  switch (error.category) {
    case 'validation':
      return '请补充必填信息后再继续。'
    case 'network_retryable':
      return '网络暂时不可用，输入已保留，请稍后重试。'
    case 'unsupported_capability':
      return '当前操作暂不可用。'
    case 'session_invalid':
      return '登录状态已失效，请重新登录。'
    default:
      return '操作暂时失败，输入已保留，请稍后重试。'
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

.workspace-state-title { color: #1d2b40; font-size: 28rpx; font-weight: 800; }

.workspace-state-copy {
  color: #7e8da4;
  font-size: 22rpx;
  line-height: 1.6;
  margin-top: 10rpx;
  max-width: 620rpx;
}

.workspace-state-link { color: #2878f2; font-size: 24rpx; font-weight: 700; margin-top: 22rpx; }

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

.action-content-heading { border-bottom: 1rpx solid #edf1f6; padding-bottom: 22rpx; }
.action-content-title-row { align-items: center; display: flex; }

.action-content-icon {
  align-items: center;
  background: #eaf2ff;
  border-radius: 10rpx;
  color: #2878f2;
  display: flex;
  font-size: 22rpx;
  height: 42rpx;
  justify-content: center;
  margin-right: 12rpx;
  width: 42rpx;
}

.action-content-title { color: #1d2b40; font-size: 30rpx; font-weight: 800; }
.action-content-caption, .action-content-label { color: #7b8aa1; font-size: 22rpx; }
.action-content-caption { display: block; margin-top: 8rpx; }
.action-content-field { margin-top: 26rpx; }
.action-content-field--choice { margin-top: 24rpx; }
.action-content-label { display: block; font-weight: 600; margin-bottom: 12rpx; }
.action-content-required { color: #f06445; }

.action-content-options { display: flex; gap: 14rpx; }

.action-content-option {
  background: #f8fafc;
  border: 1rpx solid #dfe7f1;
  border-radius: 14rpx;
  color: #61728e;
  flex: 1;
  font-size: 24rpx;
  font-weight: 600;
  height: 76rpx;
  line-height: 76rpx;
  margin: 0;
  padding: 0 12rpx;
}

.action-content-option--selected { background: #edf4ff; border-color: #2878f2; color: #2878f2; }
.action-content-option::after { border: 0; }

.appointment-time-selector {
  align-items: center;
  background: #f8fafc;
  border: 1rpx solid #dfe7f1;
  border-radius: 14rpx;
  box-sizing: border-box;
  color: #1d2b40;
  display: flex;
  justify-content: space-between;
  margin: 0;
  min-height: 88rpx;
  padding: 12rpx 20rpx;
  text-align: left;
  width: 100%;
}

.appointment-time-selector::after { border: 0; }
.appointment-time-placeholder { color: #9aa8ba; font-size: 24rpx; }
.appointment-time-selected { display: flex; flex-direction: column; gap: 4rpx; }
.appointment-time-selected-date { color: #1d2b40; font-size: 25rpx; font-weight: 800; }
.appointment-time-selected-value { color: #2878f2; font-size: 22rpx; font-weight: 700; }
.appointment-time-chevron { color: #7f90a8; font-size: 42rpx; line-height: 1; }

.action-content-note,
.action-content-input {
  background: #f8fafc;
  border: 1rpx solid #dfe7f1;
  border-radius: 14rpx;
  box-sizing: border-box;
  color: #1d2b40;
  font-size: 24rpx;
  padding: 16rpx 18rpx;
  width: 100%;
}

.action-content-note { min-height: 112rpx; }
.action-content-input { height: 72rpx; padding-bottom: 0; padding-top: 0; }

@keyframes workspace-pulse {
  0%, 100% { opacity: 0.56; }
  50% { opacity: 1; }
}
</style>
