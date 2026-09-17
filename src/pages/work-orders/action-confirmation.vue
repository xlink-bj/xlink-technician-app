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

  <AppLoadingState v-else-if="workspace.loadState === 'loading'" variant="workspace" label="正在准备预约信息" />

  <view v-else-if="workspace.loadState === 'failed_retryable'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">暂时无法打开确认页</text>
    <text class="workspace-state-copy">请检查网络后重试，已保存的本地草稿不会丢失。</text>
    <AppButton class="workspace-state-action" @tap="reload">重新加载</AppButton>
  </view>

  <view v-else-if="workspace.loadState === 'failed_terminal'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">预约信息暂不可用</text>
    <AppButton class="workspace-state-action" @tap="reload">再次尝试</AppButton>
  </view>

  <ActionWorkspaceShell
    v-else-if="workspace.descriptor && workspace.appointmentForm"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :transitioning="isNavigating"
    :can-submit="workspace.canSubmit"
    :business-feedback="isSuccess ? '' : feedback"
    submit-label="确认预约"
  >
    <view v-if="!isSuccess" class="confirmation-content">
      <view class="confirmation-card app-surface app-surface--compact">
        <view class="confirmation-card-heading">
          <view class="confirmation-card-icon" aria-hidden="true"><AppIcon name="appointment" :size="20" color="var(--app-color-primary)" /></view>
          <text class="confirmation-card-title">{{ isVisitDeferred ? '安排信息' : '预约信息' }}</text>
        </view>
        <AppInformationRow class="confirmation-row">
          <template #label>上门安排</template>
          <template #value>{{ visitIntentLabel }}</template>
        </AppInformationRow>
        <template v-if="workspace.appointmentDatetimeApplicable">
          <AppInformationRow class="confirmation-row">
            <template #label>预约日期</template>
            <template #value>{{ appointmentDisplay?.dateLabel || '—' }}</template>
          </AppInformationRow>
          <AppInformationRow class="confirmation-row">
            <template #label>预约时间</template>
            <template #value>{{ appointmentDisplay?.timeLabel || '—' }}</template>
          </AppInformationRow>
        </template>
      </view>

      <view class="confirmation-card app-surface app-surface--compact">
        <view class="confirmation-card-heading">
          <view class="confirmation-card-icon confirmation-card-icon--customer" aria-hidden="true"><AppIcon name="contact" :size="20" color="var(--app-color-primary)" /></view>
          <text class="confirmation-card-title">客户信息</text>
        </view>
        <AppInformationRow v-if="workspace.detail?.customerName" class="confirmation-row">
          <template #label>客户姓名</template>
          <template #value>{{ workspace.detail.customerName }}</template>
        </AppInformationRow>
        <AppInformationRow v-if="workspace.detail?.contact?.displayMask" class="confirmation-row">
          <template #label>联系电话</template>
          <template #value>{{ workspace.detail.contact.displayMask }}</template>
        </AppInformationRow>
        <AppInformationRow v-if="customerServiceAddress" class="confirmation-row confirmation-row--address">
          <template #label>服务地址</template>
          <template #value><text class="confirmation-value--address">{{ customerServiceAddress }}</text></template>
        </AppInformationRow>
      </view>

      <view v-if="noteValue" class="confirmation-card app-surface app-surface--compact">
        <view class="confirmation-card-heading">
          <view class="confirmation-card-icon" aria-hidden="true"><AppIcon name="order" :size="20" color="var(--app-color-primary)" /></view>
          <text class="confirmation-card-title">备注</text>
        </view>
        <text class="confirmation-note">{{ noteValue }}</text>
      </view>
    </view>

    <template #actions v-if="!isSuccess">
      <view class="confirmation-actions">
        <AppButton variant="secondary" class="confirmation-action" @tap="backToEdit">返回修改</AppButton>
        <AppButton class="confirmation-action" :disabled="!workspace.canSubmit" :loading="workspace.lifecycle === 'submitting'" @tap="confirmAppointment">
          {{ workspace.lifecycle === 'submitting' ? '提交中' : '确认预约' }}
        </AppButton>
      </view>
    </template>

    <template #success>
      <view class="appointment-success" aria-live="polite">
        <view class="appointment-success-mark" aria-hidden="true"><AppIcon name="complete" :size="42" color="var(--app-color-success)" /></view>
        <template v-if="isVisitDeferred">
          <text class="appointment-success-title">已确认暂不上门</text>
          <text class="appointment-success-copy">操作已完成，当前上门安排已确认</text>
        </template>
        <template v-else>
          <text class="appointment-success-title">预约成功</text>
          <text class="appointment-success-copy">已成功为客户预约上门时间</text>
          <view class="appointment-success-time">
            <text class="appointment-success-date">{{ appointmentDisplay?.dateLabel || '预约日期已提交' }}</text>
            <text class="appointment-success-time-value">{{ appointmentDisplay?.timeLabel || '预约时间已提交' }}</text>
          </view>
        </template>
        <text v-if="postSuccessWarning" class="appointment-success-warning">{{ postSuccessWarning }}</text>
      </view>
    </template>

    <template #success-actions>
      <view class="confirmation-success-actions">
        <AppButton class="appointment-success-primary" block @tap="viewDetail">查看工单详情</AppButton>
        <AppButton variant="secondary" class="appointment-success-secondary" block @tap="viewList">返回工单列表</AppButton>
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
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import type { OperationError } from '@shared/types'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const routeReady = ref(false)
const routeId = ref<ReturnType<typeof parseActionWorkspaceId>>(null)
const routeNodeId = ref<ReturnType<typeof parseActionWorkspaceNodeId>>(null)
const routeAction = ref<string | undefined>(undefined)
const routeError = ref('')
const isNavigating = ref(false)

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const isSuccess = computed(() => workspace.lifecycle === 'succeeded' && workspace.businessResult === 'succeeded')
const isVisitDeferred = computed(() => workspace.appointmentVisitIntent === 'visit_deferred')
const appointmentDisplay = computed(() => appointmentDisplayFor(workspace.appointmentTimeValue))
const visitIntentLabel = computed(() => {
  const field = workspace.appointmentChoiceField
  const key = field?.valueKey
  const value = key ? workspace.appointmentForm?.values[key] : undefined
  return field?.options?.find((option) => option.value === String(value ?? ''))?.label ?? '当前安排'
})
const customerServiceAddress = computed(() => {
  const district = workspace.detail?.serviceDistrict?.trim()
  const address = workspace.detail?.serviceAddress?.trim()
  return [district, address].filter(Boolean).join(' ')
})
const noteValue = computed(() => {
  const key = workspace.appointmentNoteField?.valueKey
  const value = key ? workspace.appointmentForm?.values[key] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})
const postSuccessWarning = computed(() => {
  const actionCopy = isVisitDeferred.value ? '操作已完成' : '预约已提交'
  if (workspace.refreshStatus === 'pending') return `${actionCopy}，工单状态刷新暂不可用，请稍后查看。`
  if (workspace.draftFinalization === 'pending') return `${actionCopy}，本地草稿清理待完成。`
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
  if (isNavigating.value) return
  isNavigating.value = true
  const result = await workspace.backToAppointmentWorkspace()
  if (result.state !== 'succeeded') isNavigating.value = false
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
.workspace-state-copy { color: var(--app-color-text-secondary); font-size: var(--app-font-field-label); margin-top: var(--app-space-sm); }
.workspace-state-link { color: var(--app-color-primary); font-size: var(--app-font-body); font-weight: 700; margin-top: var(--app-space-lg); }

.workspace-state-action {
  margin-top: var(--app-space-lg);
  width: 300rpx;
}

.workspace-state-action::after { border: 0; }
.confirmation-content { margin-top: var(--app-space-md); }

.confirmation-card {
  margin-bottom: var(--app-space-md);
  padding: var(--app-card-padding);
}

.confirmation-card-heading { align-items: center; border-bottom: 1rpx solid var(--app-color-divider); display: flex; padding-bottom: var(--app-space-md); }
.confirmation-card-icon { align-items: center; background: var(--app-color-primary-soft); border-radius: 9rpx; color: var(--app-color-primary); display: flex; height: 38rpx; justify-content: center; margin-right: var(--app-space-sm); width: 38rpx; }
.confirmation-card-title { color: var(--app-color-text-primary); font-size: 26rpx; font-weight: 800; }

.confirmation-row--address { align-items: flex-start; padding-top: 16rpx; }
.confirmation-value--address { line-height: 1.5; max-width: 68%; }
.confirmation-note { color: var(--app-color-text-body); display: block; font-size: var(--app-font-value); line-height: 1.6; margin-top: var(--app-space-md); }

.confirmation-actions { display: flex; gap: var(--app-action-bar-gap); }
.confirmation-action { flex: 1; }

.appointment-success { align-items: center; display: flex; flex-direction: column; padding: 34rpx 12rpx 12rpx; text-align: center; }
.appointment-success-mark { align-items: center; background: var(--app-color-success-soft); border-radius: 50%; display: flex; height: 116rpx; justify-content: center; width: 116rpx; }
.appointment-success-title { color: var(--app-color-text-primary); font-size: var(--app-font-major-title); font-weight: 800; margin-top: var(--app-space-lg); }
.appointment-success-copy { color: var(--app-color-text-secondary); font-size: var(--app-font-field-label); margin-top: var(--app-space-sm); }
.appointment-success-time { background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-border-soft); border-radius: var(--app-radius-control); margin-top: 28rpx; padding: 20rpx 34rpx; }
.appointment-success-date { color: var(--app-color-text-primary); display: block; font-size: 26rpx; font-weight: 800; }
.appointment-success-time-value { color: var(--app-color-primary); display: block; font-size: var(--app-font-body); font-weight: 700; margin-top: var(--app-space-xs); }
.appointment-success-warning { color: var(--app-color-warning); font-size: var(--app-font-meta); line-height: 1.5; margin-top: var(--app-space-md); }
.confirmation-success-actions { display: flex; flex-direction: column; gap: var(--app-action-bar-gap); }
.appointment-success-primary, .appointment-success-secondary { width: 100%; }
</style>
