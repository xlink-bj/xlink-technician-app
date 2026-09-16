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
    <text class="workspace-state-title">正在准备预约信息</text>
  </view>

  <view v-else-if="workspace.loadState === 'failed_retryable'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">暂时无法打开确认页</text>
    <text class="workspace-state-copy">请检查网络后重试，已保存的本地草稿不会丢失。</text>
    <button class="workspace-state-action" @tap="reload">重新加载</button>
  </view>

  <view v-else-if="workspace.loadState === 'failed_terminal'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">预约信息暂不可用</text>
    <button class="workspace-state-action" @tap="reload">再次尝试</button>
  </view>

  <ActionWorkspaceShell
    v-else-if="workspace.descriptor && workspace.appointmentForm"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="workspace.canSubmit"
    submit-label="确认预约"
  >
    <view v-if="!isSuccess" class="confirmation-content">
      <view class="confirmation-card">
        <view class="confirmation-card-heading">
          <view class="confirmation-card-icon" aria-hidden="true">▣</view>
          <text class="confirmation-card-title">预约信息</text>
        </view>
        <view class="confirmation-row">
          <text class="confirmation-label">预约日期</text>
          <text class="confirmation-value">{{ appointmentDisplay?.dateLabel || '—' }}</text>
        </view>
        <view class="confirmation-row">
          <text class="confirmation-label">预约时间</text>
          <text class="confirmation-value">{{ appointmentDisplay?.timeLabel || '—' }}</text>
        </view>
      </view>

      <view class="confirmation-card">
        <view class="confirmation-card-heading">
          <view class="confirmation-card-icon confirmation-card-icon--customer" aria-hidden="true">●</view>
          <text class="confirmation-card-title">客户信息</text>
        </view>
        <view v-if="workspace.detail?.customerName" class="confirmation-row">
          <text class="confirmation-label">客户姓名</text>
          <text class="confirmation-value">{{ workspace.detail.customerName }}</text>
        </view>
        <view v-if="workspace.detail?.contact?.displayMask" class="confirmation-row">
          <text class="confirmation-label">联系电话</text>
          <text class="confirmation-value">{{ workspace.detail.contact.displayMask }}</text>
        </view>
        <view v-if="customerServiceAddress" class="confirmation-row confirmation-row--address">
          <text class="confirmation-label">服务地址</text>
          <text class="confirmation-value confirmation-value--address">{{ customerServiceAddress }}</text>
        </view>
      </view>

      <view v-if="noteValue" class="confirmation-card">
        <view class="confirmation-card-heading">
          <view class="confirmation-card-icon" aria-hidden="true">≡</view>
          <text class="confirmation-card-title">备注</text>
        </view>
        <text class="confirmation-note">{{ noteValue }}</text>
      </view>
    </view>

    <template #feedback>
      <text v-if="!isSuccess && feedback" class="action-workspace-feedback">{{ feedback }}</text>
      <text v-if="!isSuccess && workspace.draftMessage" class="action-workspace-draft-message">{{ workspace.draftMessage }}</text>
    </template>

    <template #actions v-if="!isSuccess">
      <view class="confirmation-actions">
        <button class="confirmation-action confirmation-action--secondary" @tap="backToEdit">返回修改</button>
        <button class="confirmation-action confirmation-action--primary" :class="{ 'confirmation-action--disabled': !workspace.canSubmit }" :disabled="!workspace.canSubmit" @tap="confirmAppointment">
          {{ workspace.lifecycle === 'submitting' ? '提交中' : '确认预约' }}
        </button>
      </view>
    </template>

    <template #success>
      <view class="appointment-success" aria-live="polite">
        <view class="appointment-success-mark" aria-hidden="true">✓</view>
        <text class="appointment-success-title">预约成功</text>
        <text class="appointment-success-copy">已成功为客户预约上门时间</text>
        <view class="appointment-success-time">
          <text class="appointment-success-date">{{ appointmentDisplay?.dateLabel || '预约日期已提交' }}</text>
          <text class="appointment-success-range">{{ appointmentDisplay?.timeLabel || '预约时间已提交' }}</text>
        </view>
        <text v-if="postSuccessWarning" class="appointment-success-warning">{{ postSuccessWarning }}</text>
        <button class="appointment-success-primary" @tap="viewDetail">查看工单详情</button>
        <button class="appointment-success-secondary" @tap="viewList">返回工单列表</button>
      </view>
    </template>
  </ActionWorkspaceShell>

  <view v-else class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">预约信息暂不可用</text>
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
const isSuccess = computed(() => workspace.lifecycle === 'succeeded' && workspace.businessResult === 'succeeded')
const appointmentDisplay = computed(() => appointmentDisplayFor(workspace.appointmentTimeValue))
const customerServiceAddress = computed(() => {
  const district = workspace.detail?.serviceDistrict?.trim()
  const address = workspace.detail?.serviceAddress?.trim()
  return [district, address].filter(Boolean).join(' ')
})
const noteValue = computed(() => {
  const key = workspace.appointmentNoteField?.key
  const value = key ? workspace.appointmentForm?.values[key] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})
const postSuccessWarning = computed(() => {
  if (workspace.refreshStatus === 'pending') return '预约已提交，工单状态刷新暂不可用，请稍后查看。'
  if (workspace.draftFinalization === 'pending') return '预约已提交，本地草稿清理待完成。'
  return ''
})
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

async function backToEdit(): Promise<void> {
  await workspace.backToAppointmentWorkspace()
}

async function confirmAppointment(): Promise<void> {
  await workspace.submit()
}

async function viewDetail(): Promise<void> {
  await workspace.navigateToDetail()
}

async function viewList(): Promise<void> {
  await workspace.navigateToList()
}

function reload(): void {
  loadWorkspace()
}

function actionErrorCopy(error: OperationError | null): string {
  if (!error) return ''
  switch (error.category) {
    case 'validation':
      return '请返回修改并补充必填信息。'
    case 'network_retryable':
      return '网络暂时不可用，输入已保留，请稍后重试。'
    case 'session_invalid':
      return '登录状态已失效，请重新登录。'
    default:
      return '预约提交失败，输入已保留，请稍后重试。'
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
.workspace-state-copy { color: #7e8da4; font-size: 22rpx; margin-top: 10rpx; }
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
.workspace-loading-card { background: #ffffff; border-radius: 24rpx; height: 260rpx; margin-bottom: 22rpx; width: 100%; }

.confirmation-content { margin-top: 18rpx; }

.confirmation-card {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 26rpx rgba(32, 55, 90, 0.05);
  margin-bottom: 16rpx;
  padding: 24rpx;
}

.confirmation-card-heading { align-items: center; border-bottom: 1rpx solid #edf1f6; display: flex; padding-bottom: 16rpx; }
.confirmation-card-icon { align-items: center; background: #eaf2ff; border-radius: 9rpx; color: #2878f2; display: flex; font-size: 20rpx; height: 38rpx; justify-content: center; margin-right: 10rpx; width: 38rpx; }
.confirmation-card-icon--customer { font-size: 18rpx; }
.confirmation-card-title { color: #1d2b40; font-size: 26rpx; font-weight: 800; }

.confirmation-row { align-items: center; display: flex; justify-content: space-between; min-height: 66rpx; }
.confirmation-row + .confirmation-row { border-top: 1rpx solid #f0f3f7; }
.confirmation-row--address { align-items: flex-start; padding-top: 16rpx; }
.confirmation-label { color: #8190a5; font-size: 22rpx; }
.confirmation-value { color: #1d2b40; font-size: 23rpx; font-weight: 700; text-align: right; }
.confirmation-value--address { line-height: 1.5; max-width: 68%; }
.confirmation-note { color: #4d607e; display: block; font-size: 23rpx; line-height: 1.6; margin-top: 16rpx; }

.action-workspace-feedback, .action-workspace-draft-message { color: #f06445; display: block; font-size: 21rpx; line-height: 1.5; margin-top: 12rpx; text-align: center; }
.action-workspace-draft-message { color: #7e8da4; }

.confirmation-actions { display: flex; gap: 14rpx; }
.confirmation-action { border-radius: 14rpx; box-sizing: border-box; flex: 1; font-size: 24rpx; font-weight: 800; height: 76rpx; line-height: 76rpx; margin: 0; }
.confirmation-action::after { border: 0; }
.confirmation-action--secondary { background: #ffffff; border: 1rpx solid #9fc3ff; color: #2878f2; }
.confirmation-action--primary { background: #2878f2; color: #ffffff; }
.confirmation-action--disabled { opacity: 0.48; }

.appointment-success { align-items: center; display: flex; flex-direction: column; padding: 34rpx 12rpx 12rpx; text-align: center; }
.appointment-success-mark { align-items: center; background: #dff8eb; border-radius: 50%; color: #18ae65; display: flex; font-size: 54rpx; font-weight: 800; height: 116rpx; justify-content: center; width: 116rpx; }
.appointment-success-title { color: #1d2b40; font-size: 34rpx; font-weight: 800; margin-top: 24rpx; }
.appointment-success-copy { color: #7a8ca7; font-size: 22rpx; margin-top: 10rpx; }
.appointment-success-time { background: #f7faff; border: 1rpx solid #e2ecfb; border-radius: 16rpx; margin-top: 28rpx; padding: 20rpx 34rpx; }
.appointment-success-date { color: #1d2b40; display: block; font-size: 26rpx; font-weight: 800; }
.appointment-success-range { color: #2878f2; display: block; font-size: 24rpx; font-weight: 700; margin-top: 8rpx; }
.appointment-success-warning { color: #bf7b16; font-size: 20rpx; line-height: 1.5; margin-top: 16rpx; }
.appointment-success-primary, .appointment-success-secondary { border-radius: 14rpx; box-sizing: border-box; font-size: 24rpx; font-weight: 800; height: 74rpx; line-height: 74rpx; margin: 28rpx 0 0; width: 100%; }
.appointment-success-primary { background: #2878f2; color: #ffffff; }
.appointment-success-secondary { background: #ffffff; color: #2878f2; margin-top: 12rpx; }
.appointment-success-primary::after, .appointment-success-secondary::after { border: 0; }
</style>
