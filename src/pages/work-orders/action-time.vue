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
    v-else-if="workspace.descriptor && workspace.appointmentForm && workspace.appointmentDatetimeApplicable"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :transitioning="isNavigating"
    :can-submit="Boolean(selectedOption)"
    :business-feedback="feedback"
    submit-label="确认选择"
  >
    <AppointmentTimeSelectionContent :selected-date="selectedDate" :selected-option-key="selectedOptionKey"
      :date-shortcuts="dateShortcuts" :time-options="appointmentTimeOptions" :time-error="timeError"
      :disabled="isNavigating" @select-date="selectDate" @select-option="selectOption" />

    <template #actions>
      <AppButton class="time-selection-submit" :disabled="!selectedOption || isNavigating" :loading="isNavigating" block @tap="confirmSelection">确认选择</AppButton>
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
  dateShortcutsFor,
  dateStringFor,
  parseAppointmentDateTime,
} from '@features/work-orders/appointment-time'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppointmentTimeSelectionContent from '@features/work-orders/components/AppointmentTimeSelectionContent.vue'
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
const isNavigating = ref(false)

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

function selectOption(key: string): void {
  selectedOptionKey.value = key
  timeError.value = ''
}

async function confirmSelection(): Promise<void> {
  if (isNavigating.value) return
  const option = selectedOption.value
  if (!option) {
    timeError.value = '请选择预约时间。'
    return
  }
  isNavigating.value = true
  const updated = workspace.setAppointmentTime(`${selectedDate.value} ${option.value}`)
  if (updated.state !== 'succeeded') {
    isNavigating.value = false
    timeError.value = '预约时间暂时无法保存，请重试。'
    return
  }
  const result = await workspace.openConfirmation()
  if (result.state !== 'succeeded') isNavigating.value = false
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
.time-selection-submit { margin: 0; width: 100%; }
</style>
