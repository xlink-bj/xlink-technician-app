<template>
  <view v-if="session.status === 'unknown'" class="loading-page">
    <text class="eyebrow">Technician App</text>
    <text class="title">Preparing secure session</text>
    <text class="subtitle">Checking access to Work Order detail…</text>
  </view>

  <view v-else-if="!canAccess" class="guard-page">
    <text class="eyebrow">Technician App</text>
    <text class="title">Sign in required</text>
    <text class="subtitle">Return to Home to start an authenticated session.</text>
    <navigator class="back-link" url="/pages/index/index">Return to sign in</navigator>
  </view>

  <view v-else class="detail-page">
    <view class="detail-header">
      <navigator class="back-link" url="/pages/work-orders/work-orders">Back to Work Orders</navigator>
      <text class="eyebrow">Role-visible Work Orders</text>
      <text class="title">Work Order Detail</text>
    </view>

    <view v-if="workOrder.loadState === 'loading'" class="detail-state">
      <text class="state-title">Loading Work Order detail…</text>
    </view>

    <view v-else-if="workOrder.loadState === 'failed_retryable'" class="detail-state">
      <text class="state-title">Work Order detail is temporarily unavailable.</text>
      <text class="state-detail">{{ workOrder.error?.message }}</text>
      <button class="action" @tap="retry">Try again</button>
    </view>

    <view v-else-if="workOrder.loadState === 'failed_terminal'" class="detail-state">
      <text class="state-title">Work Order detail could not be loaded.</text>
      <text class="state-detail">{{ workOrder.error?.message }}</text>
      <button class="action" @tap="retry">Retry</button>
    </view>

    <view v-else-if="workOrder.loadState === 'succeeded' && workOrder.detail" class="detail-content">
      <view class="information-card">
        <text class="card-label">Work Order number</text>
        <text class="card-value">{{ workOrder.detail.displayNumber ?? String(workOrder.detail.id) }}</text>

        <view v-if="workOrder.detail.customerName" class="detail-row">
          <text class="card-label">Customer</text>
          <text class="card-value">{{ workOrder.detail.customerName }}</text>
        </view>

        <view v-if="workOrder.detail.serviceAddress" class="detail-row">
          <text class="card-label">Service address</text>
          <text class="card-value">{{ workOrder.detail.serviceAddress }}</text>
        </view>

        <view v-if="workOrder.detail.contact?.displayMask" class="detail-row">
          <text class="card-label">Customer contact</text>
          <text class="card-value">{{ workOrder.detail.contact.displayMask }}</text>
        </view>
      </view>

      <view class="quick-action-region">
        <text class="section-label">Quick actions</text>
        <button v-if="canDial" class="action" :disabled="workOrder.contactInFlight" @tap="dialContact">
          {{ workOrder.contactInFlight ? 'Opening phone…' : 'Call customer' }}
        </button>
        <text v-else-if="workOrder.detail.contact" class="state-detail">
          Direct phone contact is not available.
        </text>
        <text v-if="contactFeedback" class="state-detail">{{ contactFeedback }}</text>
      </view>
    </view>

    <view v-else class="detail-state">
      <text class="state-title">Preparing Work Order detail…</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

import { hasAuthenticatedSession } from '@features/home/access'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useSessionStore } from '@shared/state'

const session = useSessionStore()
const workOrder = useWorkOrderDetailStore()
const routeReady = ref(false)
const routeValue = ref<unknown>(undefined)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const canDial = computed(() => Boolean(workOrder.detail?.contact?.normalizedPhone))
const contactFeedback = computed(() => {
  switch (workOrder.contactState) {
    case 'granted':
      return 'Phone action opened.'
    case 'cancelled':
      return 'Phone action cancelled.'
    case 'unsupported_platform':
      return 'Phone contact is not supported on this platform.'
    case 'unavailable':
      return 'Phone contact is currently unavailable.'
    case 'denied':
    case 'denied_permanently_or_settings':
    case 'error_retryable':
      return workOrder.contactReason ?? 'Phone contact could not be opened.'
    default:
      return ''
  }
})

function loadForAuthenticatedSession(): void {
  if (routeReady.value && session.status === 'authenticated') {
    void workOrder.loadFromRoute(routeValue.value)
  }
}

onLoad((options) => {
  routeValue.value = options?.id
  routeReady.value = true
  loadForAuthenticatedSession()
})

watch(
  [() => session.status, routeReady],
  ([status, ready]) => {
    if (ready && status === 'authenticated') loadForAuthenticatedSession()
    if (status !== 'authenticated' && status !== 'unknown') workOrder.clear()
  },
  { immediate: true },
)

async function retry(): Promise<void> {
  await workOrder.retry()
}

async function dialContact(): Promise<void> {
  await workOrder.dialContact()
}
</script>

<style>
.detail-page,
.guard-page,
.loading-page {
  background: #f5f7fb;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 32rpx;
}

.detail-header,
.detail-content,
.detail-state,
.guard-page,
.loading-page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin: 0 auto;
  max-width: 960rpx;
}

.detail-header {
  margin: 12rpx auto 28rpx;
}

.detail-state,
.guard-page,
.loading-page {
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

.information-card,
.quick-action-region {
  background: #ffffff;
  border-radius: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 32rpx;
}

.quick-action-region {
  border: 1rpx solid #dbe5ff;
  background: #f8faff;
}

.detail-row {
  border-top: 1rpx solid #eaecf0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding-top: 16rpx;
}

.eyebrow,
.state-detail,
.card-label,
.section-label {
  color: #667085;
  font-size: 26rpx;
}

.section-label {
  color: #344054;
  font-weight: 600;
}

.title {
  color: #101828;
  font-size: 48rpx;
  font-weight: 700;
}

.subtitle {
  color: #667085;
  font-size: 30rpx;
}

.state-title {
  color: #344054;
  font-size: 32rpx;
}

.card-value {
  color: #101828;
  font-size: 32rpx;
}

.action {
  background: #155eef;
  border-radius: 12rpx;
  color: #ffffff;
  font-size: 28rpx;
  margin: 0;
}

.action[disabled] {
  opacity: 0.55;
}

.back-link {
  color: #155eef;
  font-size: 30rpx;
}
</style>
