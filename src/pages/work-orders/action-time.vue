<template>
  <view v-if="session.status === 'unknown'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">正在准备操作空间</text>
  </view>

  <view v-else-if="!canAccess" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">需要登录</text>
    <text class="workspace-state-copy">登录后才能继续预约。</text>
    <navigator class="workspace-state-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else-if="routeError || workspace.loadState === 'blocked'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">当前操作暂不可用</text>
    <text class="workspace-state-copy">请返回工单详情，按当前任务继续操作。</text>
  </view>

  <view v-else-if="workspace.loadState === 'loading'" class="workspace-state workspace-state--centered">
    <view class="workspace-loading-card" aria-hidden="true" />
    <text class="workspace-state-title">正在准备时间选择</text>
  </view>

  <view v-else-if="workspace.loadState === 'failed_retryable'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">暂时无法打开时间选择</text>
    <text class="workspace-state-copy">请检查网络后重试，已保存的本地草稿不会丢失。</text>
    <button class="workspace-state-action" @tap="reload">重新加载</button>
  </view>

  <view v-else-if="workspace.loadState === 'failed_terminal'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">时间选择暂不可用</text>
    <button class="workspace-state-action" @tap="reload">再次尝试</button>
  </view>

  <ActionWorkspaceShell
    v-else-if="workspace.descriptor && workspace.appointmentForm"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="Boolean(selectedSlot)"
    submit-label="确认选择"
  >
    <view class="time-selection-content">
      <view class="time-selection-heading">
        <text class="time-selection-title">选择上门时间</text>
        <text class="time-selection-copy">请根据与客户确认的安排选择日期和时间段</text>
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
              <text class="date-shortcut-date">⌄</text>
            </view>
          </picker>
        </view>
        <view class="selected-date-card">
          <text class="selected-date-label">已选日期</text>
          <text class="selected-date-value">{{ dateLabelFor(selectedDate) }}</text>
        </view>
      </view>

      <view class="time-section time-section--slots">
        <text class="time-section-label">预约时间段</text>
        <view class="time-slots">
          <button
            v-for="slot in appointmentTimeSlots"
            :key="slot.key"
            class="time-slot"
            :class="{ 'time-slot--selected': selectedSlotKey === slot.key }"
            @tap="selectSlot(slot.key)"
          >
            <text>{{ slot.label }}</text>
            <text v-if="selectedSlotKey === slot.key" class="time-slot-check">✓</text>
          </button>
        </view>
        <text v-if="timeError" class="time-selection-error">{{ timeError }}</text>
      </view>
    </view>

    <template #feedback>
      <text v-if="feedback" class="action-workspace-feedback">{{ feedback }}</text>
      <text v-if="workspace.draftMessage" class="action-workspace-draft-message">{{ workspace.draftMessage }}</text>
    </template>

    <template #actions>
      <button class="time-selection-submit" :class="{ 'time-selection-submit--disabled': !selectedSlot }" :disabled="!selectedSlot" @tap="confirmSelection">确认选择</button>
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
  appointmentTimeSlots,
  dateLabelFor,
  dateShortcutsFor,
  dateStringFor,
  parseAppointmentDateTime,
} from '@features/work-orders/appointment-time'
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
const selectedDate = ref(dateStringFor())
const selectedSlotKey = ref('')
const timeError = ref('')

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const dateShortcuts = dateShortcutsFor()
const selectedSlot = computed(() => appointmentTimeSlots.find((slot) => slot.key === selectedSlotKey.value))
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
    const match = appointmentTimeSlots.find((slot) => slot.start === parsed.time.slice(0, 5))
    if (match) selectedSlotKey.value = match.key
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

function selectSlot(key: string): void {
  selectedSlotKey.value = key
  timeError.value = ''
}

async function confirmSelection(): Promise<void> {
  const slot = selectedSlot.value
  if (!slot) {
    timeError.value = '请选择预约时间段。'
    return
  }
  const updated = workspace.setAppointmentTime(`${selectedDate.value} ${slot.start}`)
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
  background: #f3f6fa;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  padding: 24rpx;
  text-align: center;
  width: 100%;
}

.workspace-state-title { color: #1d2b40; font-size: 28rpx; font-weight: 800; }
.workspace-state-copy { color: #7e8da4; font-size: 22rpx; line-height: 1.6; margin-top: 10rpx; }
.workspace-state-link { color: #2878f2; font-size: 24rpx; font-weight: 700; margin-top: 22rpx; }

.workspace-state-action,
.time-selection-submit {
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

.workspace-state-action::after,
.time-selection-submit::after { border: 0; }
.workspace-loading-card { background: #ffffff; border-radius: 24rpx; height: 260rpx; margin-bottom: 22rpx; width: 100%; }

.time-selection-content {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 34rpx rgba(32, 55, 90, 0.07);
  margin-top: 18rpx;
  padding: 26rpx;
}

.time-selection-heading { border-bottom: 1rpx solid #edf1f6; padding-bottom: 22rpx; }
.time-selection-title { color: #1d2b40; display: block; font-size: 30rpx; font-weight: 800; }
.time-selection-copy { color: #7b8aa1; display: block; font-size: 22rpx; margin-top: 8rpx; }
.time-section { margin-top: 26rpx; }
.time-section--slots { border-top: 1rpx solid #edf1f6; padding-top: 26rpx; }
.time-section-label { color: #1d2b40; display: block; font-size: 24rpx; font-weight: 800; margin-bottom: 14rpx; }

.date-shortcuts { display: flex; gap: 10rpx; }
.date-shortcuts-more { flex: 1; }

.date-shortcut {
  align-items: center;
  background: #f8fafc;
  border: 1rpx solid #e1e8f1;
  border-radius: 14rpx;
  box-sizing: border-box;
  color: #627492;
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 82rpx;
  justify-content: center;
  margin: 0;
  padding: 0 4rpx;
}

.date-shortcut::after { border: 0; }
.date-shortcut--selected { background: #edf4ff; border-color: #2878f2; color: #2878f2; }
.date-shortcut-label { font-size: 22rpx; font-weight: 700; }
.date-shortcut-date { font-size: 18rpx; margin-top: 4rpx; }
.date-shortcut--more { color: #627492; font-size: 20rpx; }

.selected-date-card {
  align-items: center;
  background: #f8fafc;
  border-radius: 12rpx;
  display: flex;
  justify-content: space-between;
  margin-top: 14rpx;
  padding: 16rpx 18rpx;
}

.selected-date-label { color: #8998ad; font-size: 21rpx; }
.selected-date-value { color: #1d2b40; font-size: 23rpx; font-weight: 700; }
.time-slots { display: flex; flex-direction: column; gap: 12rpx; }

.time-slot {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #e1e8f1;
  border-radius: 14rpx;
  color: #1d2b40;
  display: flex;
  font-size: 24rpx;
  justify-content: space-between;
  line-height: 1;
  margin: 0;
  min-height: 72rpx;
  padding: 0 20rpx;
  text-align: left;
}

.time-slot::after { border: 0; }
.time-slot--selected { background: #edf4ff; border-color: #2878f2; color: #2878f2; }
.time-slot-check { background: #2878f2; border-radius: 50%; color: #ffffff; font-size: 20rpx; height: 32rpx; line-height: 32rpx; text-align: center; width: 32rpx; }
.time-selection-error { color: #f06445; display: block; font-size: 21rpx; margin-top: 14rpx; }
.action-workspace-feedback, .action-workspace-draft-message { color: #f06445; display: block; font-size: 21rpx; line-height: 1.5; margin-top: 12rpx; text-align: center; }
.action-workspace-draft-message { color: #7e8da4; }
.time-selection-submit { margin: 0; width: 100%; }
.time-selection-submit--disabled { opacity: 0.48; }
</style>
