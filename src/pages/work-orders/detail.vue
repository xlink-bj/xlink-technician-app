<template>
  <view v-if="session.status === 'unknown'" class="loading-page">
    <view class="loading-mark" aria-hidden="true" />
    <text class="loading-title">正在准备工单详情</text>
    <text class="loading-copy">正在确认登录状态</text>
  </view>

  <view v-else-if="!canAccess" class="guard-page">
    <view class="guard-mark" aria-hidden="true"><AppIcon name="contact" :size="24" color="#2f72ec" /></view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单详情。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="detail-page">
    <view v-if="showLoadingSkeleton" class="detail-state detail-loading-state" aria-label="正在加载工单详情">
      <view class="detail-skeleton" aria-hidden="true">
        <view class="skeleton-surface skeleton-summary">
          <view class="skeleton-summary-top">
            <view class="skeleton-line skeleton-line--customer" />
            <view class="skeleton-line skeleton-line--number" />
          </view>
          <view class="skeleton-line skeleton-line--location" />
          <view class="skeleton-actions skeleton-actions--summary">
            <view /><view /><view /><view />
          </view>
        </view>

        <view class="skeleton-surface skeleton-task">
          <view class="skeleton-line skeleton-line--eyebrow" />
          <view class="skeleton-line skeleton-line--task-title" />
          <view class="skeleton-button" />
        </view>

        <view class="skeleton-surface skeleton-information">
          <view class="skeleton-tabs"><view /><view /><view /><view /></view>
          <view class="skeleton-information-row"><view /><view /></view>
          <view class="skeleton-information-row"><view /><view /></view>
        </view>
      </view>
    </view>

    <view v-else-if="workOrder.loadState === 'failed_retryable'" class="detail-state">
      <view class="state-icon state-icon--retry" aria-hidden="true">!</view>
      <text class="state-title">暂时无法加载详情</text>
      <text class="state-detail">请检查网络后重试。</text>
      <button class="state-action" @tap="retry">重新加载</button>
    </view>

    <view v-else-if="workOrder.loadState === 'failed_terminal'" class="detail-state">
      <view class="state-icon" aria-hidden="true">!</view>
      <text class="state-title">工单详情暂不可用</text>
      <text class="state-detail">{{ failureCopy }}</text>
      <button class="state-action" @tap="retry">再次尝试</button>
    </view>

    <view v-else-if="workOrder.loadState === 'succeeded' && detail" class="detail-content">
      <view class="summary-card">
        <view class="summary-top-row">
          <view class="summary-identity">
            <view class="summary-copy">
              <view v-if="detail.customerName || detail.servicePartLabel" class="summary-title-row">
                <text v-if="detail.customerName" class="summary-customer">{{ detail.customerName }}</text>
                <text v-if="detail.servicePartLabel" class="part-badge">{{ detail.servicePartLabel }}</text>
              </view>
            </view>
          </view>
          <text v-if="detail.displayNumber" class="summary-number">#{{ detail.displayNumber }}</text>
        </view>

        <view
          v-if="detail.serviceDistrict || detail.serviceAddress || detail.distanceText"
          class="location-row"
        >
          <text v-if="detail.serviceDistrict" class="location-district">{{ detail.serviceDistrict }}</text>
          <text v-if="detail.serviceDistrict && detail.serviceAddress" class="location-space"> </text>
          <text v-if="detail.serviceAddress" class="location-address">{{ detail.serviceAddress }}</text>
          <text v-if="detail.distanceText" class="location-distance">{{ detail.distanceText }}</text>
        </view>

        <view class="summary-actions" aria-label="快捷操作">
          <button
            v-for="action in quickActions"
            :key="action.key"
            class="summary-action"
            :class="{ 'summary-action--disabled': action.key === 'contact' && !canDial }"
            :disabled="action.key === 'contact' && (!canDial || workOrder.contactInFlight)"
            @tap="handleQuickAction(action.key)"
          >
            <AppIcon
              :name="action.icon"
              :size="15"
              :color="action.key === 'contact' && !canDial ? '#a6b2c4' : action.color"
              aria-hidden="true"
            />
            <text>{{ workOrder.contactInFlight && action.key === 'contact' ? '打开中' : action.label }}</text>
          </button>
        </view>
        <text v-if="!canDial && detail.contact" class="action-hint">暂无可直接拨打的客户电话</text>
        <text v-if="contactFeedback || actionFeedback" class="action-feedback">{{ contactFeedback || actionFeedback }}</text>
      </view>

      <view
        v-if="detail.currentTask"
        class="current-task-card"
        :class="`current-task-card--${detail.currentTask.tone}`"
      >
        <text class="task-eyebrow" :class="`task-eyebrow--${detail.currentTask.tone}`">当前任务</text>
        <text class="task-title">{{ detail.currentTask.title }}</text>
        <text class="task-description">{{ detail.currentTask.description }}</text>
        <button
          class="primary-task-action"
          :class="`primary-task-action--${detail.currentTask.tone}`"
          disabled
        >
          {{ detail.currentTask.actionLabel }}
        </button>
        <text class="task-action-note">当前仅支持只读查看，操作能力将在后续核验后开放</text>
      </view>

      <view class="information-card">
        <scroll-view class="detail-tabs" scroll-x="true" show-scrollbar="false">
          <view
            v-for="tab in detailTabs"
            :key="tab.key"
            class="detail-tab"
            :class="{ 'detail-tab--active': activeTab === tab.key }"
            @tap="selectTab(tab.key)"
          >
            <text>{{ tab.label }}</text>
          </view>
        </scroll-view>

        <view v-if="activeTab === 'follow-up'" class="tab-panel">
          <view class="tab-empty">
            <text class="tab-empty-title">暂无跟进记录</text>
            <text class="tab-empty-copy">后续跟进信息将在业务能力开放后展示。</text>
          </view>
        </view>

        <view v-else-if="activeTab === 'customer'" class="tab-panel">
          <view class="detail-row" v-if="detail.customerName">
            <text class="row-label">客户名称</text>
            <text class="row-value">{{ detail.customerName }}</text>
          </view>
          <view class="detail-row detail-row--stacked" v-if="detail.serviceDistrict || detail.serviceAddress">
            <text class="row-label">服务地址</text>
            <text class="row-value row-value--long">
              {{ detail.serviceDistrict }}{{ detail.serviceDistrict && detail.serviceAddress ? ' ' : '' }}{{ detail.serviceAddress }}
            </text>
          </view>
          <view class="detail-row" v-if="detail.contact?.displayMask">
            <text class="row-label">联系电话</text>
            <text class="row-value">{{ detail.contact.displayMask }}</text>
          </view>
        </view>

        <view v-else-if="activeTab === 'order'" class="tab-panel">
          <view class="detail-row" v-if="detail.displayNumber">
            <text class="row-label">工单编号</text>
            <text class="row-value">#{{ detail.displayNumber }}</text>
          </view>
          <view class="detail-row" v-if="detail.taskLabel">
            <text class="row-label">当前状态</text>
            <text class="row-value row-value--accent">{{ detail.taskLabel }}</text>
          </view>
          <view class="detail-row" v-if="detail.servicePartLabel">
            <text class="row-label">服务部位</text>
            <text class="row-value">{{ detail.servicePartLabel }}</text>
          </view>
          <view class="detail-row" v-if="detail.distanceText">
            <text class="row-label">距离</text>
            <text class="row-value">{{ detail.distanceText }}</text>
          </view>
        </view>

        <view v-else class="tab-panel">
          <view class="tab-empty">
            <text class="tab-empty-title">暂无资料</text>
            <text class="tab-empty-copy">工单相关资料将在对应业务数据接入后展示。</text>
          </view>
        </view>
      </view>

    </view>

    <view v-else-if="workOrder.loadState === 'loading'" class="detail-loading-placeholder" aria-hidden="true" />

    <view v-else class="detail-state">
      <text class="state-title">正在准备工单详情</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

import { hasAuthenticatedSession } from '@features/home/access'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { detailTabs, type DetailTabKey } from '@features/work-orders/detail-tabs'
import { useSessionStore } from '@shared/state'
import AppIcon from '@shared/ui/AppIcon.vue'

const session = useSessionStore()
const workOrder = useWorkOrderDetailStore()
const routeReady = ref(false)
const routeValue = ref<unknown>(undefined)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const detail = computed(() => workOrder.detail)
const activeTab = ref<DetailTabKey>('follow-up')
const showLoadingSkeleton = ref(false)
const loadingSkeletonDelayMs = 240
let loadingSkeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearLoadingSkeletonTimer(): void {
  if (loadingSkeletonTimer) clearTimeout(loadingSkeletonTimer)
  loadingSkeletonTimer = undefined
}

watch(
  () => workOrder.loadState,
  (state) => {
    clearLoadingSkeletonTimer()
    showLoadingSkeleton.value = false
    if (state === 'loading') {
      loadingSkeletonTimer = setTimeout(() => {
        if (workOrder.loadState === 'loading') showLoadingSkeleton.value = true
      }, loadingSkeletonDelayMs)
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearLoadingSkeletonTimer)

const canDial = computed(() => Boolean(detail.value?.contact?.normalizedPhone))
const quickActions = [
  { key: 'contact', label: '联系', icon: 'phone' as const, color: '#2878f2' },
  { key: 'customer', label: '资料', icon: 'contact' as const, color: '#2878f2' },
  { key: 'records', label: '跟进', icon: 'task' as const, color: '#2878f2' },
  { key: 'navigate', label: '导航', icon: 'location' as const, color: '#2878f2' },
] as const
type QuickActionKey = (typeof quickActions)[number]['key']
const actionFeedback = ref('')
const failureCopy = computed(() => {
  if (workOrder.error?.category === 'session_invalid') return '登录状态已失效，请重新登录。'
  if (workOrder.error?.category === 'authorization_denied') return '当前账号无权查看此工单。'
  return '请稍后再试，或返回工单列表重新进入。'
})
const contactFeedback = computed(() => {
  switch (workOrder.contactState) {
    case 'granted':
      return '已打开电话能力。'
    case 'cancelled':
      return '已取消联系客户。'
    case 'unsupported_platform':
      return '当前平台暂不支持电话能力。'
    case 'unavailable':
      return '当前无法使用电话能力。'
    case 'denied':
    case 'denied_permanently_or_settings':
    case 'error_retryable':
      return '电话能力未能打开，请稍后重试。'
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

function selectTab(tab: DetailTabKey): void {
  activeTab.value = tab
}

async function dialContact(): Promise<void> {
  await workOrder.dialContact()
}

async function handleQuickAction(action: QuickActionKey): Promise<void> {
  actionFeedback.value = ''
  if (action === 'contact') {
    await dialContact()
    return
  }

  if (action === 'customer') {
    selectTab('customer')
    return
  }

  if (action === 'records') {
    selectTab('follow-up')
    return
  }

  if (action === 'navigate') {
    actionFeedback.value = '导航能力将在地图边界完成核验后提供。'
  }
}
</script>

<style>
/* Detail typography scale: keep hierarchy semantic and avoid component-specific sizes. */
.detail-page,
.guard-page,
.loading-page {
  background: #f3f6fa;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 20rpx 24rpx calc(46rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.detail-content,
.detail-state,
.guard-page,
.loading-page {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: 960rpx;
}

.back-link {
  color: #2878f2;
  font-size: 24rpx;
  font-weight: 700;
}

.summary-card,
.information-card {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 34rpx rgba(32, 55, 90, 0.07);
}

.summary-card {
  padding: 28rpx 28rpx 24rpx;
}

.summary-top-row,
.summary-identity,
.summary-title-row,
.location-row,
.section-heading-row,
.detail-row {
  align-items: center;
  display: flex;
}

.summary-top-row {
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.summary-identity {
  min-width: 0;
  gap: 18rpx;
}

.summary-copy {
  min-width: 0;
}

.summary-title-row {
  gap: 12rpx;
  min-width: 0;
}

.summary-customer {
  color: #172033;
  font-size: 34rpx;
  font-weight: 800;
  max-width: 450rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part-badge {
  background: #f0f2f5;
  border-radius: 6rpx;
  color: #303945;
  flex: 0 0 auto;
  font-size: 18rpx;
  font-weight: 700;
  padding: 5rpx 10rpx;
}

.summary-number {
  color: #60718d;
  flex: 0 0 auto;
  font-size: 26rpx;
  font-weight: 800;
  padding-top: 4rpx;
}

.location-row {
  color: #647895;
  font-size: 24rpx;
  gap: 8rpx;
  margin-top: 24rpx;
  min-width: 0;
}

.location-district,
.location-address {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-address {
  flex: 1;
}

.location-distance {
  color: #60718d;
  flex: 0 0 auto;
  font-size: 22rpx;
  font-weight: 700;
  margin-left: auto;
}

.section-heading-row {
  justify-content: space-between;
  gap: 16rpx;
}

.section-heading {
  color: #1d2b40;
  font-size: 26rpx;
  font-weight: 800;
}

.section-caption {
  color: #91a0b5;
  font-size: 20rpx;
}

.summary-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 24rpx;
}

.summary-action {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #dce7f5;
  border-radius: 14rpx;
  box-sizing: border-box;
  color: #2878f2;
  display: flex;
  flex: 1;
  font-size: 18rpx;
  font-weight: 800;
  gap: 6rpx;
  justify-content: center;
  margin: 0;
  min-width: 0;
  min-height: 64rpx;
  padding: 0 4rpx;
  white-space: nowrap;
}

.summary-action--disabled {
  border-color: #e1e7ef;
  color: #9aa7b9;
}

.summary-action::after,
.state-action::after {
  border: 0;
}

.action-hint,
.action-feedback {
  color: #8290a4;
  display: block;
  font-size: 20rpx;
  margin-top: 12rpx;
  text-align: center;
}

.action-feedback {
  color: #2878f2;
}

.current-task-card {
  border: 2rpx solid;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 34rpx rgba(32, 55, 90, 0.07);
  margin-top: 18rpx;
  padding: 24rpx 26rpx 22rpx;
}

.current-task-card--blue { background: #f7fbff; border-color: #cfe3ff; }
.current-task-card--red { background: #fff8f9; border-color: #ffd1d7; }
.current-task-card--orange { background: #fffaf4; border-color: #ffd9ad; }
.current-task-card--purple { background: #fbf8ff; border-color: #dccfff; }
.current-task-card--green { background: #f7fffa; border-color: #ccefdc; }
.current-task-card--gray { background: #fbfcfe; border-color: #d8dde6; }

.task-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
}

.task-eyebrow--blue { color: #1478ff; }
.task-eyebrow--red { color: #ff4052; }
.task-eyebrow--orange { color: #ff8a1a; }
.task-eyebrow--purple { color: #7459e8; }
.task-eyebrow--green { color: #18ae65; }
.task-eyebrow--gray { color: #687386; }

.task-title {
  color: #1d2b40;
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  margin-top: 12rpx;
}

.task-description {
  color: #697386;
  display: block;
  font-size: 22rpx;
  line-height: 1.6;
  margin-top: 8rpx;
}

.primary-task-action {
  border-radius: 14rpx;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 800;
  height: 68rpx;
  line-height: 68rpx;
  margin: 22rpx 0 0;
  opacity: 1;
  padding: 0;
  width: 100%;
}

.primary-task-action--blue,
.primary-task-action--blue[disabled] { background: #1478ff; }
.primary-task-action--red,
.primary-task-action--red[disabled] { background: #ff4052; }
.primary-task-action--orange,
.primary-task-action--orange[disabled] { background: #ff8a1a; }
.primary-task-action--purple,
.primary-task-action--purple[disabled] { background: #7459e8; }
.primary-task-action--green,
.primary-task-action--green[disabled] { background: #18ae65; }
.primary-task-action--gray,
.primary-task-action--gray[disabled] { background: #8b94a3; }

.primary-task-action[disabled] {
  color: #ffffff;
  opacity: 1;
}

.primary-task-action::after {
  border: 0;
}

.task-action-note {
  color: #a39a91;
  display: block;
  font-size: 20rpx;
  margin-top: 10rpx;
  text-align: center;
}

.detail-tabs {
  border-bottom: 1rpx solid #edf1f6;
  box-sizing: border-box;
  height: 82rpx;
  white-space: nowrap;
  width: 100%;
}

.detail-tab {
  align-items: center;
  box-sizing: border-box;
  color: #73819a;
  display: inline-flex;
  font-size: 22rpx;
  height: 82rpx;
  justify-content: center;
  margin: 0 20rpx;
  position: relative;
}

.detail-tab:first-child {
  margin-left: 28rpx;
}

.detail-tab--active {
  color: #2878f2;
  font-weight: 800;
}

.detail-tab--active::after {
  background: #2878f2;
  border-radius: 999rpx;
  bottom: 0;
  content: '';
  height: 4rpx;
  left: 0;
  position: absolute;
  right: 0;
}

.tab-panel {
  padding: 16rpx 28rpx 18rpx;
}

.tab-empty {
  align-items: center;
  display: flex;
  flex-direction: column;
  padding: 42rpx 0 28rpx;
  text-align: center;
}

.tab-empty-title {
  color: #536581;
  font-size: 24rpx;
  font-weight: 800;
}

.tab-empty-copy {
  color: #9aa7b9;
  font-size: 20rpx;
  line-height: 1.6;
  margin-top: 8rpx;
}

.information-card {
  margin-top: 18rpx;
  overflow: hidden;
}

.detail-row {
  border-top: 1rpx solid #edf1f6;
  gap: 20rpx;
  justify-content: space-between;
  min-height: 82rpx;
}

.detail-row--stacked {
  align-items: flex-start;
  flex-direction: column;
  gap: 8rpx;
  justify-content: center;
  padding: 18rpx 0;
}

.row-label {
  color: #8290a4;
  flex: 0 0 auto;
  font-size: 22rpx;
}

.row-value {
  color: #1d2b40;
  font-size: 24rpx;
  font-weight: 700;
  max-width: 68%;
  text-align: right;
}

.row-value--long {
  max-width: 100%;
  text-align: left;
  width: 100%;
}

.row-value--accent {
  color: #2878f2;
}

.detail-state,
.guard-page,
.loading-page {
  align-items: center;
  justify-content: center;
  min-height: 58vh;
  text-align: center;
}

.detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 0;
  width: 100%;
}

.detail-loading-state {
  align-items: stretch;
  justify-content: flex-start;
  min-height: 0;
}

.detail-loading-placeholder {
  min-height: 184rpx;
}

.skeleton-surface {
  background: #ffffff;
  border: 1rpx solid #e4eaf2;
  border-radius: 24rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.skeleton-summary {
  padding: 28rpx 28rpx 24rpx;
}

.skeleton-summary-top,
.skeleton-tabs,
.skeleton-information-row {
  align-items: center;
  display: flex;
}

.skeleton-summary-top {
  justify-content: space-between;
}

.skeleton-line {
  background: #edf2f7;
  border-radius: 999rpx;
  height: 22rpx;
  animation: detail-skeleton-pulse 1.6s ease-in-out infinite;
}

.skeleton-line--customer { height: 32rpx; width: 42%; }
.skeleton-line--number { height: 24rpx; width: 20%; }
.skeleton-line--location { margin-top: 24rpx; width: 64%; }
.skeleton-line--eyebrow { height: 20rpx; width: 18%; }
.skeleton-line--task-title { height: 30rpx; margin-top: 14rpx; width: 30%; }

.skeleton-actions--summary {
  margin-top: 24rpx;
}

.skeleton-actions {
  display: flex;
  gap: 18rpx;
}

.skeleton-actions view {
  background: #edf2f7;
  border-radius: 14rpx;
  flex: 1;
  height: 64rpx;
  animation: detail-skeleton-pulse 1.6s ease-in-out infinite;
}

.skeleton-task {
  background: #fffaf4;
  border-color: #ffd29d;
  padding: 24rpx 26rpx 22rpx;
}

.skeleton-button {
  background: #edf2f7;
  border-radius: 14rpx;
  height: 68rpx;
  margin-top: 22rpx;
  animation: detail-skeleton-pulse 1.6s ease-in-out infinite;
}

.skeleton-information {
  padding-bottom: 12rpx;
}

.skeleton-tabs {
  border-bottom: 1rpx solid #edf1f6;
  gap: 28rpx;
  height: 82rpx;
  padding: 0 28rpx;
}

.skeleton-tabs view {
  background: #edf2f7;
  border-radius: 999rpx;
  height: 20rpx;
  width: 76rpx;
  animation: detail-skeleton-pulse 1.6s ease-in-out infinite;
}

.skeleton-information-row {
  border-bottom: 1rpx solid #edf1f6;
  justify-content: space-between;
  margin: 0 28rpx;
  min-height: 82rpx;
}

.skeleton-information-row view {
  background: #edf2f7;
  border-radius: 999rpx;
  height: 20rpx;
  width: 22%;
  animation: detail-skeleton-pulse 1.6s ease-in-out infinite;
}

.skeleton-information-row view:last-child {
  width: 34%;
}

@keyframes detail-skeleton-pulse {
  0%,
  100% {
    opacity: 0.58;
  }
  50% {
    opacity: 1;
  }
}

.loading-mark,
.guard-mark,
.state-icon {
  align-items: center;
  border-radius: 50%;
  display: flex;
  height: 74rpx;
  justify-content: center;
  margin-bottom: 22rpx;
  width: 74rpx;
}

.loading-mark {
  background: #eaf2ff;
  border: 8rpx solid #cfe0ff;
  border-right-color: #2878f2;
}

.guard-mark {
  background: #eaf2ff;
}

.state-icon {
  background: #fff0f0;
  color: #e05252;
  font-size: 26rpx;
  font-weight: 800;
}

.state-icon--retry {
  background: #fff7e7;
  color: #e28a19;
}

.loading-title,
.guard-title,
.state-title {
  color: #172033;
  font-size: 30rpx;
  font-weight: 800;
}

.loading-copy,
.guard-copy,
.state-detail {
  color: #8290a4;
  font-size: 24rpx;
  line-height: 1.6;
  margin-top: 10rpx;
}

.state-action {
  background: #2878f2;
  border-radius: 14rpx;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 800;
  margin: 28rpx 0 0;
  min-width: 260rpx;
}
</style>
