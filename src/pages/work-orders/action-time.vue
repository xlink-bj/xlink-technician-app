<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备操作空间" />

  <view v-else-if="!canAccess" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">需要登录</text>
    <text class="workspace-state-copy">登录后才能继续预约。</text>
    <navigator class="workspace-state-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else-if="routeError || workspace.loadState === 'blocked'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">当前操作暂不可用</text>
    <text class="workspace-state-copy">请返回工单详情，按当前任务继续操作。</text>
  </view>

  <AppLoadingState v-else-if="workspace.loadState === 'loading'" variant="workspace" label="正在准备时间选择" />

  <view v-else-if="workspace.loadState === 'failed_retryable'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">暂时无法打开时间选择</text>
    <text class="workspace-state-copy">请检查网络后重试，已保存的本地草稿不会丢失。</text>
    <AppButton class="workspace-state-action" @tap="reload">重新加载</AppButton>
  </view>

  <view v-else-if="workspace.loadState === 'failed_terminal'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">时间选择暂不可用</text>
    <AppButton class="workspace-state-action" @tap="reload">再次尝试</AppButton>
  </view>

  <ActionWorkspaceShell
    v-else-if="workspace.descriptor && workspace.appointmentForm"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="Boolean(selectedOption)"
    :business-feedback="feedback"
    submit-label="确认选择"
  >
    <view class="time-selection-content app-surface">
      <view class="time-selection-heading">
        <text class="time-selection-title">选择上门时间</text>
        <text class="time-selection-copy">请根据与客户确认的安排选择日期和时间</text>
      </view>

      <view class="time-section">
        <text class="time-section-label">预约日期</text>
        <view class="date-shortcuts">
          <button
            v-for="shortcut in dateShortcuts"
            :key="shortcut.key"
            class="date-shortcut"
            :class="{ 'date-shortcut--selected': shortcut.date === selectedDate }"
            @tap="selectDate(shortcut.date)"
          >
            <text class="date-shortcut-label">{{ shortcut.label }}</text>
            <text class="date-shortcut-date">{{ shortcut.date.slice(5) }}</text>
          </button>
          <picker class="date-shortcuts-more" mode="date" :value="selectedDate" @change="handleDateChange">
            <view class="date-shortcut date-shortcut--more">
              <text class="date-shortcut-label">更多日期</text>
              <AppIcon name="chevron-right" :size="16" aria-hidden="true" />
            </view>
          </picker>
        </view>
        <view class="selected-date-card">
          <text class="selected-date-label">已选日期</text>
          <text class="selected-date-value">{{ dateLabelFor(selectedDate) }}</text>
        </view>
      </view>

      <view class="time-section time-section--slots">
        <text class="time-section-label">预约时间</text>
        <view class="time-slots">
          <button
            v-for="option in appointmentTimeOptions"
            :key="option.key"
            class="time-slot"
            :class="{ 'time-slot--selected': selectedOptionKey === option.key }"
            @tap="selectOption(option.key)"
          >
            <text>{{ option.label }}</text>
            <AppIcon v-if="selectedOptionKey === option.key" class="time-slot-check" name="complete" :size="14" color="var(--app-color-surface)" aria-hidden="true" />
          </button>
        </view>
        <text v-if="timeError" class="time-selection-error">{{ timeError }}</text>
      </view>
    </view>

    <template #actions>
      <AppButton class="time-selection-submit" :disabled="!selectedOption" block @tap="confirmSelection">确认选择</AppButton>
    </template>
  </ActionWorkspaceShell>

  <view v-else class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">时间选择暂不可用</text>
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
import {
  appointmentTimeOptions,
  dateLabelFor,
  dateShortcutsFor,
  dateStringFor,
  parseAppointmentDateTime,
} from '@features/work-orders/appointment-time'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import type { OperationError } from '@shared/types'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const routeReady = ref(false)
const routeId = ref<ReturnType<typeof parseActionWorkspaceId>>(null)
const routeNodeId = ref<ReturnType<typeof parseActionWorkspaceNodeId>>(null)
const routeAction = ref<string | undefined>(undefined)
const routeError = ref('')
const selectedDate = ref(dateStringFor())
const selectedOptionKey = ref('')
const timeError = ref('')

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const dateShortcuts = dateShortcutsFor()
const selectedOption = computed(() => appointmentTimeOptions.find((option) => option.key === selectedOptionKey.value))
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

watch(
  () => workspace.appointmentTimeValue,
  (value) => {
    const parsed = parseAppointmentDateTime(value)
    if (!parsed) return
    selectedDate.value = parsed.date
    const match = appointmentTimeOptions.find((option) => option.value === parsed.time)
    if (match) selectedOptionKey.value = match.key
  },
  { immediate: true },
)

function selectDate(date: string): void {
  selectedDate.value = date
  timeError.value = ''
}

function handleDateChange(event: unknown): void {
  const input = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
  const detail = typeof input.detail === 'object' && input.detail !== null
    ? input.detail as Record<string, unknown>
    : {}
  if (typeof detail.value === 'string' && detail.value) selectDate(detail.value)
}

function selectOption(key: string): void {
  selectedOptionKey.value = key
  timeError.value = ''
}

async function confirmSelection(): Promise<void> {
  const option = selectedOption.value
  if (!option) {
    timeError.value = '请选择预约时间。'
    return
  }
  const updated = workspace.setAppointmentTime(`${selectedDate.value} ${option.value}`)
  if (updated.state !== 'succeeded') {
    timeError.value = '预约时间暂时无法保存，请重试。'
    return
  }
  await workspace.openConfirmation()
}

function reload(): void {
  loadWorkspace()
}

function actionErrorCopy(error: OperationError | null): string {
  if (!error) return ''
  switch (error.category) {
    case 'network_retryable':
      return '网络暂时不可用，输入已保留，请稍后重试。'
    case 'session_invalid':
      return '登录状态已失效，请重新登录。'
    default:
      return '操作暂时失败，输入已保留，请稍后重试。'
  }
}
</script>

<style>
.workspace-state {
  align-items: center;
  background: var(--app-color-page);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  padding: var(--app-space-lg);
  text-align: center;
  width: 100%;
}

.workspace-state-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.workspace-state-copy { color: var(--app-color-text-secondary); font-size: var(--app-font-field-label); line-height: 1.6; margin-top: var(--app-space-sm); }
.workspace-state-link { color: var(--app-color-primary); font-size: var(--app-font-body); font-weight: 700; margin-top: var(--app-space-lg); }

.workspace-state-action,
.time-selection-submit {
  margin-top: var(--app-space-lg);
  width: 300rpx;
}

.workspace-state-action::after,
.time-selection-submit::after { border: 0; }
.time-selection-content {
  margin-top: var(--app-space-md);
  padding: var(--app-card-padding);
}

.time-selection-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.time-selection-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.time-selection-copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }
.time-section { margin-top: var(--app-section-gap); }
.time-section--slots { border-top: 1rpx solid var(--app-color-divider); padding-top: var(--app-section-gap); }
.time-section-label { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; margin-bottom: var(--app-space-sm); }

.date-shortcuts { display: flex; gap: 10rpx; }
.date-shortcuts-more { flex: 1; }

.date-shortcut {
  align-items: center;
  background: var(--app-color-control-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  box-sizing: border-box;
  color: var(--app-color-text-secondary);
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: var(--app-touch-target);
  justify-content: center;
  margin: 0;
  padding: 0 4rpx;
}

.date-shortcut::after { border: 0; }
.date-shortcut--selected { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); color: var(--app-color-primary); }
.date-shortcut-label { font-size: var(--app-font-field-label); font-weight: 700; }
.date-shortcut-date { font-size: 18rpx; margin-top: 4rpx; }
.date-shortcut--more { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }

.selected-date-card {
  align-items: center;
  background: var(--app-color-control-surface);
  border-radius: var(--app-radius-control);
  display: flex;
  justify-content: space-between;
  margin-top: var(--app-space-sm);
  padding: var(--app-space-md) 18rpx;
}

.selected-date-label { color: var(--app-color-text-secondary); font-size: var(--app-font-status); }
.selected-date-value { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 700; }
.time-slots { display: flex; flex-direction: column; gap: var(--app-control-gap); }

.time-slot {
  align-items: center;
  background: var(--app-color-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-primary);
  display: flex;
  font-size: var(--app-font-body);
  justify-content: space-between;
  line-height: 1;
  margin: 0;
  min-height: var(--app-touch-target);
  padding: 0 20rpx;
  text-align: left;
}

.time-slot::after { border: 0; }
.time-slot--selected { background: var(--app-color-primary-soft); border-color: var(--app-color-primary); color: var(--app-color-primary); }
.time-slot-check { background: var(--app-color-primary); border-radius: 50%; color: var(--app-color-surface); height: 32rpx; padding: 0; text-align: center; width: 32rpx; }
.time-selection-error { color: var(--app-color-danger); display: block; font-size: var(--app-font-status); margin-top: var(--app-space-sm); }
.time-selection-submit { margin: 0; width: 100%; }
</style>
