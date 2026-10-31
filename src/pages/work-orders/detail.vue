<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备工单详情" />

  <view v-else-if="!canAccess" class="guard-page">
    <view class="guard-mark" aria-hidden="true"><AppIcon name="contact" :size="24" color="#2f72ec" /></view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单详情。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="detail-page">
    <AppWorkOrderSkeleton v-if="showLoadingSkeleton" variant="detail" />

    <AppFeedbackState
      v-else-if="workOrder.loadState === 'failed_retryable'"
      layout="detail" appearance="retry"
      title="暂时无法加载详情"
      description="请检查网络后重试。"
      action-label="重新加载"
      @action="retry"
    />
    <AppFeedbackState
      v-else-if="workOrder.loadState === 'failed_terminal'"
      layout="detail" appearance="error"
      title="工单详情暂不可用"
      :description="failureCopy"
      action-label="再次尝试"
      @action="retry"
    />
    <AppFeedbackState
      v-else-if="workOrder.loadState === 'succeeded' && detail && preAcceptBlocked"
      layout="detail" appearance="blocked"
      title="工单待接单"
      description="接单后可查看工单详情。"
    />

    <view v-else-if="workOrder.loadState === 'succeeded' && detail" class="detail-content">
      <AppSectionHeading class="detail-section-heading" title="工单概览" subtitle="服务信息与当前处理进度" data-testid="ds02b-detail-heading" />
      <AppRecordCard class="summary-card" data-testid="ds02b-detail-record-card">
        <view class="summary-card__content">
        <view class="summary-top-row">
          <view class="summary-identity">
            <view class="summary-copy">
              <view v-if="detail.customerName || detail.servicePartLabel" class="summary-title-row">
                <text v-if="detail.customerName" class="summary-customer">{{ detail.customerName }}</text>
                <AppMetaTag v-if="detail.servicePartLabel" class="part-badge" :label="detail.servicePartLabel" />
              </view>
            </view>
          </view>
          <text v-if="detail.displayNumber" class="summary-number">{{ workOrderNumberDisplay(detail.displayNumber) }}</text>
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
            v-for="action in visibleQuickActions"
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
        <AppStatus
          v-if="productionReadOnly"
          class="production-read-only-notice"
          message="当前工单仅可查看，业务操作暂未开放。"
          tone="warning"
          quiet
          data-testid="production-read-only-notice"
        />
        <text v-if="!canDial && detail.contact" class="action-hint">暂无可直接拨打的客户电话</text>
        <text v-if="contactFeedback || actionFeedback" class="action-feedback">{{ contactFeedback || actionFeedback }}</text>
        </view>
      </AppRecordCard>

      <WorkOrderTaskFocus
        v-if="workflowProjection.currentTask"
        :title="workflowProjection.currentTask.title"
        :action-label="productionReadOnly
          ? (workflowProjection.currentTask.actionIntent === 'place_order' ? '查看报价方案' : '暂不可操作')
          : workflowProjection.currentTask.actionLabel"
        :tone="workflowProjection.currentTask.tone"
        :disabled="(workflowProjection.currentTask.execution !== 'enabled' && !allowLocalMockPreview)
          || (productionReadOnly && workflowProjection.currentTask.actionIntent !== 'place_order')"
        :note="aStageSpecialKind ? '请在下方填写并保存现场情况。' : productionReadOnly ? '当前仅可查看，业务操作暂未开放。' : undefined"
        @action="handleCurrentTaskAction"
      />


      <!-- Current source-backed forms/repeat node only; Production repeat reads
           a bounded list after an explicit tap and never exposes write actions. -->
      <R1ProductionMainRepeatPanel
        v-if="productionReadOnly && currentR1FormNode?.sourceNodeType === 'repeat'"
        :node="currentR1FormNode" :read="workOrder.mainRepeatRead"
        @read="loadMainRepeatForms" />
      <R1SpecialMockTransactionPanel v-else-if="aStageSpecialKind && currentR1FormNode"
        :key="String(currentR1FormNode.id)" :kind="aStageSpecialKind"
        :node="currentR1FormNode" :work-order-id="String(detail.id)"
        :create-controller="createAStageSpecialControllerForUi" @changed="retry" />
      <R1NodeFormsOverview v-else-if="currentR1FormNode" :node="currentR1FormNode"
        :work-order-id="String(detail.id)" :actor-scope="workOrderReadScopeKey(session.session)" />
      <AppStatus v-if="aStageCompletedSpecialNode" tone="success" quiet
        message="现场记录已完成，可重新进入查看。"
        data-testid="a-special-complete" />
      <R1ProductionChildFormsPanel
        v-if="productionReadOnly && productionChildParents.length"
        :parents="productionChildParents"
        :selected-parent-id="workOrder.childReadParentId"
        :nodes="workOrder.childReadNodes"
        :state="workOrder.childReadState"
        :error="workOrder.childReadError"
        :repeat-by-node="workOrder.repeatReadByNode"
        @load-child="loadChildForms"
        @load-repeat="loadRepeatForms"
      />

      <AppRecordCard class="information-card">
        <scroll-view class="detail-tabs" scroll-x="true" show-scrollbar="false">
          <view
            v-for="tab in visibleDetailTabs"
            :key="tab.key"
            class="detail-tab"
            :class="{ 'detail-tab--active': activeTab === tab.key }"
            @tap="selectTab(tab.key)"
          >
            <text>{{ tab.label }}</text>
          </view>
        </scroll-view>

        <view v-if="activeTab === 'follow-up'" class="tab-panel">
          <view v-if="activities.length > 0" class="activity-list">
            <view v-for="(activity, index) in activities" :key="activity.id" class="activity-item">
              <view class="activity-rail" aria-hidden="true">
                <view class="activity-icon" :class="`activity-icon--${activity.tone}`">
                  <AppIcon :name="activity.icon" :size="14" color="#ffffff" />
                </view>
                <view v-if="index < activities.length - 1" class="activity-line" />
              </view>
              <view class="activity-body">
                <view class="activity-heading">
                  <text class="activity-title">{{ activity.title }}</text>
                  <text
                    v-if="activity.badge !== '系统'"
                    class="activity-badge"
                    :class="`activity-badge--${activity.tone}`"
                  >
                    {{ activity.badge }}
                  </text>
                </view>
                <text v-if="activity.content" class="activity-copy">{{ activity.content }}</text>
                <text class="activity-meta">{{ activity.owner }} · {{ activity.time }}</text>
              </view>
            </view>
          </view>
          <view v-else class="tab-empty">
            <text class="tab-empty-title">暂无跟进记录</text>
            <text class="tab-empty-copy">后续跟进信息将在业务能力开放后展示。</text>
          </view>
        </view>

        <view v-else-if="activeTab === 'customer'" class="tab-panel customer-info-panel">
          <view class="detail-row customer-info-row">
            <text class="row-label">客户姓名</text>
            <text class="row-value customer-info-value">{{ detail.customerName || '—' }}</text>
          </view>
          <view class="detail-row customer-info-row customer-info-row--address">
            <text class="row-label">服务地址</text>
            <text class="row-value customer-info-value customer-info-value--address">{{ customerServiceAddress }}</text>
          </view>
          <view class="detail-row customer-info-row">
            <text class="row-label">工单编号</text>
            <text class="row-value customer-info-value">{{ detail.displayNumber ? workOrderNumberDisplay(detail.displayNumber) : '—' }}</text>
          </view>
          <view class="detail-row customer-info-row">
            <text class="row-label">联系电话</text>
            <text class="row-value customer-info-value">{{ detail.contact?.displayMask || '—' }}</text>
          </view>
        </view>

        <view v-else-if="activeTab === 'order'" class="tab-panel order-info-panel">
          <view class="order-info-heading">
            <text>订单信息</text>
          </view>
          <view class="order-info-list">
            <view class="detail-row order-info-row" v-if="detail.displayNumber">
              <text class="row-label">工单编号</text>
              <text class="row-value order-info-value">{{ workOrderNumberDisplay(detail.displayNumber) }}</text>
            </view>
            <view class="detail-row order-info-row" v-if="detail.taskLabel">
              <text class="row-label">当前状态</text>
              <text class="row-value order-info-value" :class="`row-value--${workOrderCardToneFor(detail.taskLabel)}`">
                {{ detail.taskLabel }}
              </text>
            </view>
            <view class="detail-row order-info-row" v-if="detail.servicePartLabel">
              <text class="row-label">服务部位</text>
              <text class="row-value order-info-value">{{ detail.servicePartLabel }}</text>
            </view>
            <view class="detail-row order-info-row" v-if="detail.distanceText">
              <text class="row-label">距离</text>
              <text class="row-value order-info-value">{{ detail.distanceText }}</text>
            </view>
          </view>
        </view>

        <view v-else-if="activeTab === 'quotation' && productionReadOnly" class="tab-panel quotation-read-panel" data-testid="production-quotation-read-panel">
          <view class="quotation-read-intro">
            <text class="tab-empty-title">报价记录 · 只读</text>
            <text class="tab-empty-copy">查看当前工单最近的报价记录，历史报价暂不支持编辑。</text>
          </view>
          <view v-if="quotationBrowse.state === 'loading'" class="quotation-read-state" data-testid="quotation-read-loading">
            <AppLoadingState variant="inline" label="正在读取报价记录" />
          </view>
          <view v-else-if="quotationBrowse.state === 'failed_retryable' || quotationBrowse.state === 'failed_terminal'" class="quotation-read-state" data-testid="quotation-read-error">
            <text class="tab-empty-copy">{{ quotationBrowse.errorMessage }}</text>
            <button class="state-action quotation-retry" @tap="retryQuotationRead">重新读取</button>
          </view>
          <view v-else-if="quotationBrowse.state === 'idle'" class="quotation-read-state">
            <button class="state-action quotation-retry" @tap="loadQuotationRead">读取该工单报价记录</button>
          </view>
          <view v-else-if="matchingQuotationOrders.length === 0" class="tab-empty" data-testid="quotation-read-empty">
            <text class="tab-empty-title">暂未找到近期报价记录</text>
            <text class="tab-empty-copy">可稍后重试，或联系业务人员核实历史报价。</text>
          </view>
          <view v-else class="quotation-read-list">
            <view v-for="order in matchingQuotationOrders" :key="order.id" class="quotation-read-card" data-testid="quotation-read-record">
              <view class="quotation-read-heading">
                <text class="quotation-read-number">{{ order.displayNumber ? `报价单 ${order.displayNumber}` : '报价记录' }}</text>
                <text v-if="order.updateTime" class="quotation-read-date">{{ order.updateTime }}</text>
              </view>
              <text class="quotation-read-readonly">历史报价 · 仅供查看</text>
              <text v-if="order.totalPrice !== undefined" class="quotation-read-total">报价金额：¥{{ order.totalPrice.toFixed(2) }}</text>
              <view v-if="order.groups.length === 0" class="quotation-read-warning">
                <text>报价分组内容暂不可识别，已保留只读状态。</text>
              </view>
              <view v-for="(group, groupIndex) in order.groups" :key="`${order.id}-group-${groupIndex}`" class="quotation-read-group">
                <text class="quotation-read-group-title">{{ group.partDescription || `维修部位 ${groupIndex + 1}` }}</text>
                <text v-if="group.maintainAreaNum" class="quotation-read-meta">工程量：{{ group.maintainAreaNum }}</text>
                <view v-for="row in quotationLineRows(group)" :key="`${order.id}-${groupIndex}-${row.key}`" class="quotation-read-line" :class="{ 'quotation-read-line--nested': row.depth > 0 }">
                  <view class="quotation-read-line-main">
                    <text class="quotation-read-line-kind">{{ quotationKindLabel(row.line.kind) }}</text>
                    <text class="quotation-read-line-label">{{ row.line.label }}</text>
                  </view>
                  <text class="quotation-read-meta">
                    {{ row.line.quantity === undefined ? '' : `${row.line.quantity}${row.line.unit ? ` ${row.line.unit}` : ''}` }}{{ row.line.amount === undefined ? '' : ` · ¥${row.line.amount.toFixed(2)}` }}
                  </text>
                </view>
                <text v-if="!group.contentSupported" class="quotation-read-warning">该分组含未识别字段，以上仅为可确认内容。</text>
              </view>
              <navigator
                v-if="isSigningReadOrderCandidate(order) && signingOrderReadRouteFor(String(detail?.id ?? ''), order.id)"
                class="state-action quotation-retry"
                :url="signingOrderReadRouteFor(String(detail?.id ?? ''), order.id) || undefined"
                data-testid="production-signing-order-read-entry"
              >
                查看签约信息
              </navigator>
              <text v-else class="quotation-read-warning" data-testid="production-signing-order-read-unavailable">
                {{ unavailableSigningReadReason(order.state) }}
              </text>
            </view>
          </view>
        </view>

        <view v-else class="tab-panel">
          <view class="tab-empty">
            <text class="tab-empty-title">暂无资料</text>
            <text class="tab-empty-copy">工单相关资料将在对应业务数据接入后展示。</text>
          </view>
        </view>
      </AppRecordCard>

    </view>

    <view v-else-if="workOrder.loadState === 'loading'" class="detail-loading-placeholder" aria-hidden="true" />

    <AppLoadingState v-else variant="inline" label="正在准备工单详情" />
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

import { mockJourneyContext } from '@app/mock-journey'
import { hasAuthenticatedSession } from '@features/home/access'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { workOrderNumberDisplay } from '@shared/ui/work-order-number-display'
import { workOrderCardToneFor } from '@features/work-orders/card'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { actionWorkspaceRouteFor } from '@features/work-orders/action-workspace'
import { detailTabs, type DetailTabKey } from '@features/work-orders/detail-tabs'
import { detailWorkflowUiProjectionFor } from '@features/work-orders/detail-workflow'
import { quotationBrowseLineRows, useQuotationOrderBrowseStore } from '@features/work-orders/quotation/order-browse-store'
import { signingOrderReadRouteFor } from '@features/work-orders/signing/signing-review-read-workspace'
import { isSigningReadOrderCandidate, unavailableSigningReadReason } from '@shared/signing-order-read-policy'
import type { QuotationOrderBrowseGroup, QuotationOrderBrowseKind } from '@shared/ports'
import { useSessionStore } from '@shared/state'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppMetaTag from '@shared/ui/AppMetaTag.vue'
import AppSectionHeading from '@shared/ui/AppSectionHeading.vue'
import AppFeedbackState from '@shared/ui/AppFeedbackState.vue'
import AppWorkOrderSkeleton from '@shared/ui/AppWorkOrderSkeleton.vue'
import WorkOrderTaskFocus from '@features/work-orders/WorkOrderTaskFocus.vue'
import R1NodeFormsOverview from '@features/work-orders/R1NodeFormsOverview.vue'
import R1SpecialMockTransactionPanel from '@features/work-orders/R1SpecialMockTransactionPanel.vue'
import { isAStageSpecialMockAvailable, createAStageSpecialMockControllerForActor, type AStageSpecialKind } from '@app/a-stage-special-mock-ui'
import type { AStageSpecialMockControllerFactory } from '@features/work-orders/a-stage-special-mock-port'
import R1ProductionChildFormsPanel from '@features/work-orders/R1ProductionChildFormsPanel.vue'
import R1ProductionMainRepeatPanel from '@features/work-orders/R1ProductionMainRepeatPanel.vue'
import { appLoadingSkeletonDelayMs } from '@shared/ui/loading'

const createAStageSpecialControllerForUi: AStageSpecialMockControllerFactory =
  createAStageSpecialMockControllerForActor
const session = useSessionStore()
const workOrder = useWorkOrderDetailStore()
const quotationBrowse = useQuotationOrderBrowseStore()
const routeReady = ref(false)
const routeValue = ref<unknown>(undefined)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const productionReadOnly = isProductionReadOnlyRuntime()
const detail = computed(() => workOrder.detail)
const activities = computed(() => detail.value?.activities ?? [])
const customerServiceAddress = computed(() => {
  const district = detail.value?.serviceDistrict?.trim()
  const address = detail.value?.serviceAddress?.trim()
  return [district, address].filter(Boolean).join(' ') || '—'
})
const workflowProjection = computed(() => detailWorkflowUiProjectionFor(detail.value, session.session))
const currentR1FormNode = computed(() => {
  const task = workflowProjection.value.currentTask
  if (!task || (task.sourceNodeType !== 'forms' && task.sourceNodeType !== 'repeat')) return undefined
  return detail.value?.workflowNodes?.find(node => node.id === task.nodeId)
})
const aStageSpecialKind = computed<AStageSpecialKind | null>(() => {
  const source = currentR1FormNode.value?.sourceNodeType
  if (source !== 'forms' && source !== 'repeat' || productionReadOnly) return null
  const current = session.session
  const actor = current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) } : null
  return isAStageSpecialMockAvailable(source, String(detail.value?.id ?? ''), actor)
    ? source : null
})
const aStageCompletedSpecialNode = computed(() => {
  if (productionReadOnly) return null
  const current = session.session
  const actor = current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) } : null
  return detail.value?.workflowNodes?.find(node =>
    (node.sourceNodeType === 'forms' || node.sourceNodeType === 'repeat')
      && node.lifecycle === 'closed'
      && isAStageSpecialMockAvailable(node.sourceNodeType,
        String(detail.value?.id ?? ''), actor)) ?? null
})
const productionChildParents = computed(() => (productionReadOnly
  ? detail.value?.workflowNodes?.filter((node) => node.category === 'subworkflow'
    && ['subflows', 'subflow', 'subworkflow'].includes(node.sourceNodeType ?? '')) ?? []
  : []))
const allowLocalMockPreview = computed(() => {
  const stage = mockJourneyContext(String(detail.value?.id ?? ''))
  const task = workflowProjection.value.currentTask
  // Synthetic-only navigation never changes the R1 command permission. The
  // store still requires DEV H5-E2E + exact MOCK-019 identity to load drafts.
  return !productionReadOnly && stage?.stage === 'survey'
    && task?.actionIntent === 'interact_with_form'
    && task?.sourceNodeType === 'forms'
    && task?.execution === 'disabled_read_only'
})
const preAcceptBlocked = computed(() => Boolean(
  detail.value?.workflowNodes?.some((node) => node.category === 'accept' && node.lifecycle === 'active'),
))
const activeTab = ref<DetailTabKey>('follow-up')
const visibleDetailTabs = computed(() => productionReadOnly
  ? [...detailTabs, { key: 'quotation' as const, label: '报价记录' }]
  : detailTabs)
const matchingQuotationOrders = computed(() => quotationBrowse.items.filter(
  (order) => order.serviceAppointmentId === String(detail.value?.id ?? ''),
))
const showLoadingSkeleton = ref(false)
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
      }, appLoadingSkeletonDelayMs)
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearLoadingSkeletonTimer)

watch(
  () => detail.value?.id ?? null,
  () => quotationBrowse.clear(),
)

const canDial = computed(() => !productionReadOnly && Boolean(detail.value?.contact?.normalizedPhone))
const quickActions = [
  { key: 'contact', label: '联系', icon: 'phone' as const, color: '#2878f2' },
  { key: 'customer', label: '资料', icon: 'contact' as const, color: '#2878f2' },
  { key: 'records', label: '跟进', icon: 'task' as const, color: '#2878f2' },
  { key: 'navigate', label: '导航', icon: 'location' as const, color: '#2878f2' },
] as const
const visibleQuickActions = computed(() => quickActions.filter(
  (action) => !(productionReadOnly && (action.key === 'contact' || action.key === 'navigate')),
))
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
})

watch(
  [() => session.status, () => workOrderReadScopeKey(session.session), routeReady],
  ([status, scope, ready], previous) => {
    // Role changes during an authenticated session must re-read the detail.
    if (ready && status === 'authenticated' && scope
      && (!previous || previous[0] !== status || previous[1] !== scope || !previous[2])) {
      quotationBrowse.clear()
      loadForAuthenticatedSession()
    }
    if (status !== 'authenticated' && status !== 'unknown') workOrder.clear()
  },
  { immediate: true, flush: 'sync' },
)

async function retry(): Promise<void> {
  await workOrder.retry()
}

async function loadChildForms(parentNodeId: string): Promise<void> {
  await workOrder.loadChildWorkflowForms(parentNodeId)
}

async function loadRepeatForms(nodeId: string): Promise<void> {
  await workOrder.loadChildRepeatRecords(nodeId)
}

async function loadMainRepeatForms(nodeId: string): Promise<void> {
  await workOrder.loadMainRepeatRecords(nodeId)
}

function selectTab(tab: DetailTabKey): void {
  activeTab.value = tab
  if (tab === 'quotation' && productionReadOnly) void loadQuotationRead()
}

async function loadQuotationRead(): Promise<void> {
  const workOrderId = detail.value?.id
  if (!workOrderId) return
  await quotationBrowse.load(String(workOrderId))
}

async function retryQuotationRead(): Promise<void> {
  quotationBrowse.clear()
  await loadQuotationRead()
}

function quotationLineRows(group: QuotationOrderBrowseGroup) {
  return quotationBrowseLineRows(group)
}

function quotationKindLabel(kind: QuotationOrderBrowseKind): string {
  switch (kind) {
    case 'package': return '套餐'
    case 'procedure': return '工序'
    case 'material': return '材料'
    case 'measure': return '机措'
  }
}

async function dialContact(): Promise<void> {
  await workOrder.dialContact()
}

async function handleCurrentTaskAction(): Promise<void> {
  const currentTask = workflowProjection.value.currentTask
  if (!currentTask || (currentTask.execution !== 'enabled' && !allowLocalMockPreview.value)) return
  if (productionReadOnly && currentTask.actionIntent !== 'place_order') return
  const id = detail.value?.id
  if (!id) return
  const target = actionWorkspaceRouteFor(id, currentTask.nodeId, currentTask.actionIntent)
  // Quotation entry is an Action task, while the archived Order tab remains
  // independent. Production keeps its established read-only entry.
  await workOrder.navigateTo(currentTask.actionIntent === 'place_order' && !productionReadOnly
    ? `${target}&entry=orders` : target)
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
.guard-page {
  background: #f3f6fa;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 20rpx 24rpx calc(46rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.production-read-only-notice { display: block; margin-top: 16rpx; }
.child-subflow-mock-entry { background: var(--app-color-primary-soft); border: 1rpx dashed var(--app-color-primary-border); border-radius: var(--app-radius-control); color: var(--app-color-primary); display: block; font-size: var(--app-font-body); font-weight: 650; line-height: 1.5; margin-top: 20rpx; padding: 20rpx 24rpx; text-align: center; }
.mock-workflow-track { margin-top: 16rpx; padding: 20rpx 24rpx; }
.mock-workflow-track__top { display: flex; justify-content: space-between; align-items: baseline; gap: 12rpx; margin-bottom: 16rpx; }
.mock-workflow-track__heading { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 650; }
.mock-workflow-track__scope,.mock-workflow-track__hint { color: var(--app-color-text-secondary); font-size: var(--app-font-status); line-height: 1.5; }
.mock-workflow-track__steps { display: flex; gap: 10rpx; }
.mock-workflow-track__step { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx;
  border-top: 3rpx solid var(--app-color-border); padding-top: 10rpx; }
.mock-workflow-track__step--active { border-color: var(--app-color-primary); }
.mock-workflow-track__number { color: var(--app-color-text-secondary); font-size: var(--app-font-status); }
.mock-workflow-track__label { color: var(--app-color-text-primary); font-weight: 600; font-size: var(--app-font-body); }
.mock-workflow-track__state { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.mock-workflow-track__hint { display: block; margin-top: 12rpx; }
.mock-workflow-track__review { border-top: 1rpx solid var(--app-color-divider); margin-top: 16rpx; padding-top: 16rpx; display: flex; flex-direction: column; gap: 6rpx; }

.detail-content,
.detail-state,
.guard-page {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: 960rpx;
}

/* Native MP width rules apply to every WorkOrder, regardless of data source. */
.detail-content {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

.back-link {
  color: #2878f2;
  font-size: 24rpx;
  font-weight: 700;
}

.summary-card,
.information-card { width: 100%; min-width: 0; }
.detail-section-heading { width: calc(100% - 6px); margin: 2px 3px 1px; }

.summary-card {
  padding: 28rpx 28rpx 24rpx;
}

/* MP custom-component host width and slot padding match Mock and Real. */
.summary-card {
  box-sizing: border-box;
  padding: 0;
}
.summary-card__content {
  box-sizing: border-box;
  min-width: 0;
  padding: 28rpx 28rpx 24rpx;
  width: 100%;
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
  color: var(--app-text-strong);
  font-size: var(--app-content-section-size);
  font-weight: 730;
  max-width: 450rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part-badge {
  flex: 0 1 auto;
}

.summary-number {
  color: var(--app-content-muted-ink);
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 630;
  padding-top: 4rpx;
}


.location-row {
  color: var(--app-content-muted-ink);
  font-size: 12.5px;
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

.summary-identity,
.summary-copy { flex: 1 1 0; }
.summary-customer { flex: 0 1 auto; }
.part-badge { min-width: 0; }
.summary-number { white-space: nowrap; }
.summary-actions {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}
.summary-action {
  flex: 1 1 0;
  min-height: 88rpx;
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

/* DS-07.C2: former current-task-card / primary-task-action skin removed.
   Task presentation is owned by WorkOrderTaskFocus.vue (DS-06).
   Keep this business page free of a competing task palette. */

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
  color: var(--app-content-muted-ink);
  display: inline-flex;
  font-size: 13px;
  height: 82rpx;
  justify-content: center;
  margin: 0 20rpx;
  position: relative;
}

.detail-tab:first-child {
  margin-left: 28rpx;
}

.detail-tab--active {
  color: var(--app-color-primary-action);
  font-weight: 720;
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

.quotation-read-intro { padding: 8rpx 0 20rpx; }
.quotation-read-state { align-items: center; display: flex; flex-direction: column; padding: 24rpx 0; }
.quotation-retry { margin-top: 16rpx; }
.quotation-read-list { display: flex; flex-direction: column; gap: 16rpx; }
.quotation-read-card { background: #f8fafd; border: 1rpx solid #e6edf6; border-radius: 16rpx; padding: 20rpx; }
.quotation-read-heading { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8rpx 16rpx; justify-content: space-between; }
.quotation-read-number { color: #1d2b40; font-size: 24rpx; font-weight: 800; }
.quotation-read-readonly { color: #71819a; display: block; font-size: 19rpx; margin-top: 8rpx; }
.quotation-read-date, .quotation-read-meta, .quotation-read-pdf-note { color: #8391a6; font-size: 19rpx; }
.quotation-read-total { color: #263a58; display: block; font-size: 22rpx; font-weight: 700; margin-top: 12rpx; }
.quotation-read-group { border-top: 1rpx solid #e8edf4; margin-top: 16rpx; padding-top: 14rpx; }
.quotation-read-group-title { color: #455875; display: block; font-size: 21rpx; font-weight: 800; }
.quotation-read-line { align-items: flex-start; display: flex; flex-direction: column; gap: 4rpx; padding: 10rpx 0; }
.quotation-read-line--nested { border-left: 3rpx solid #dbe7f8; margin-left: 12rpx; padding-left: 14rpx; }
.quotation-read-line-main { align-items: baseline; display: flex; flex-wrap: wrap; gap: 4rpx 10rpx; }
.quotation-read-line-kind { color: #2878f2; font-size: 18rpx; font-weight: 700; }
.quotation-read-line-label { color: #26364e; font-size: 21rpx; }
.quotation-read-warning { color: #ad6a14; display: block; font-size: 19rpx; line-height: 1.5; margin-top: 12rpx; }
.quotation-read-pdf-note { display: block; margin-top: 14rpx; }

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

.activity-list {
  padding: 8rpx 0 4rpx;
}

.activity-item {
  display: flex;
  gap: 16rpx;
}

.activity-rail {
  align-items: center;
  display: flex;
  flex: 0 0 34rpx;
  flex-direction: column;
}

.activity-icon {
  align-items: center;
  border-radius: 50%;
  display: flex;
  flex: 0 0 32rpx;
  height: 32rpx;
  justify-content: center;
  width: 32rpx;
}

.activity-icon--blue { background: #2878f2; }
.activity-icon--red { background: #ff4052; }
.activity-icon--orange { background: #ff8a1a; }
.activity-icon--purple { background: #7459e8; }
.activity-icon--green { background: #18ae65; }
.activity-icon--gray { background: #94a3b8; }

.activity-line {
  background: #e2e8f0;
  flex: 1;
  margin-top: 8rpx;
  min-height: 22rpx;
  width: 1rpx;
}

.activity-body {
  flex: 1;
  min-width: 0;
  padding-bottom: 24rpx;
}

.activity-heading {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  min-height: 32rpx;
}

.activity-title {
  color: #1d2b40;
  font-size: 24rpx;
  font-weight: 800;
}

.activity-badge {
  border-radius: 6rpx;
  font-size: 18rpx;
  font-weight: 700;
  padding: 4rpx 8rpx;
}

.activity-badge--blue { background: #e8f2ff; color: #2878f2; }
.activity-badge--red { background: #ffe8e9; color: #ff4052; }
.activity-badge--orange { background: #fff0dc; color: #ff8a1a; }
.activity-badge--purple { background: #efeaff; color: #7459e8; }
.activity-badge--green { background: #e8f8ef; color: #18ae65; }
.activity-badge--gray { background: #edf1f6; color: #687386; }

.activity-copy {
  color: #697386;
  display: block;
  font-size: 22rpx;
  line-height: 1.55;
  margin-top: 8rpx;
}

.activity-meta {
  color: #94a1b3;
  display: block;
  font-size: 20rpx;
  margin-top: 8rpx;
}

.information-card {
  margin-top: 18rpx;
  overflow: hidden;
}

.customer-info-panel {
  padding: 8rpx 20rpx;
}

.customer-info-row {
  min-height: 82rpx;
}

.customer-info-row--address {
  min-height: 112rpx;
}

.customer-info-value {
  line-height: 1.45;
  max-width: 64%;
  text-align: right;
}

.customer-info-value--address {
  max-width: 64%;
  white-space: normal;
  word-break: break-all;
}

.order-info-panel {
  padding: 8rpx 20rpx 10rpx;
}

.order-info-heading {
  color: #536581;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.4;
  min-height: 42rpx;
}

.order-info-list {
  width: 100%;
}

.order-info-row {
  min-height: 82rpx;
}

.order-info-value {
  max-width: 68%;
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

.row-value--blue { color: #2878f2; }
.row-value--red { color: #f06445; }
.row-value--orange { color: #ff941f; }
.row-value--purple { color: #8a69e8; }
.row-value--green { color: #35b978; }
.row-value--gray { color: #8d99aa; }

.detail-state,
.guard-page {
  align-items: center;
  justify-content: center;
  min-height: 58vh;
  text-align: center;
}

/* Authentication visual remains local; feedback loading/error styling is shared. */
.guard-mark {
  align-items: center;
  border-radius: 50%;
  display: flex;
  height: 74rpx;
  justify-content: center;
  margin-bottom: 22rpx;
  width: 74rpx;
  background: #eaf2ff;
}
.guard-title {
  color: #172033;
  font-size: 30rpx;
  font-weight: 800;
}
.guard-copy {
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
